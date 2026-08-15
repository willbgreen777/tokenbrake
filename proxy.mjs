#!/usr/bin/env node
// TokenBrake — local metering proxy. Point a cloud AI's base URL at http://localhost:8787/openai
// (or /anthropic) and every call is metered, budget-checked, and (in hard mode) stopped at the
// cap. Runs on YOUR machine: your keys and prompts never leave it except to the real provider.
import http from "node:http";
import { resolveUpstream, transformRequest, forwardHeaders, capResponse } from "./lib/proxy-core.js";
import { costFromResponse, gate } from "./lib/meter.js";
import { usageFromStream } from "./lib/stream.js";
import { loadStore, recordSpend } from "./lib/store.js";
import { Fleet, breakerResponse } from "./lib/breaker.js";
import { licenseStatus } from "./lib/license.js";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// TokenBrake — free for individuals and companies under 100 people. No account, no phone-home,
// no trial clock. v2 adds the runaway breaker: a budget cap only fires once the money is gone,
// so it can't save you from the agent that loops at 2am. The breaker watches the SHAPE of the
// traffic and stops that in seconds, before the spend matters.

const PORT = Number(process.env.TB_PORT) || 8787;
const json = (res, status, obj, extra = {}) => { res.writeHead(status, { "content-type": "application/json", ...extra }); res.end(JSON.stringify(obj)); };

// One breaker per agent. Mode comes from the environment so it can be turned down to
// observe-only without touching code: TB_BREAKER=watch (or =off to disable entirely).
const BREAKER_MODE = String(process.env.TB_BREAKER || "guard").toLowerCase();

// Commercial licence — read ONCE at start-up, reported, and never consulted again. Deliberately
// not part of any request path: see the long note at the top of lib/license.js. A company over
// the PolyForm threshold sets TB_LICENSE so it can prove entitlement; nothing here behaves
// differently either way, and a bad key is a printed warning, never a refusal.
const LICENSE = (() => { try { return licenseStatus(); } catch { return { licensed: false, set: false, line: "commercial licence: check skipped" }; } })();
const fleet = new Fleet({
  mode: BREAKER_MODE === "watch" ? "watch" : "guard",
  burnPerMin: Number(process.env.TB_BURN_PER_MIN) || undefined,
});

function meterAndRecord(agent, model, body, reqBody, okStatus) {
  let cost = 0;
  try { const r = costFromResponse(model, body); cost = r.cost; const { cost: _c, ...usage } = r; if (cost > 0) recordSpend(agent, cost, usage); } catch {}
  // Feed the breaker whatever we learned. Wrapped: detection must never surface as an error.
  try {
    if (BREAKER_MODE !== "off") {
      const inc = fleet.for(agent).record(Date.now(), { body: reqBody, cost, ok: okStatus < 400 });
      if (inc) {
        console.error(`\n🛑 TokenBrake stopped "${inc.agent}" — ${inc.reason}`);
        console.error(`   ${inc.detail}`);
        console.error(`   Estimated spend avoided over the ${Math.round(inc.cooldownMs / 1000)}s cooldown: ~$${inc.projectedCostOverCooldown} (projection, not a measurement)`);
        console.error(`   Resume now with:  node ~/TokenBrake/reset.mjs ${inc.agent}\n`);
      }
    }
  } catch {}
}

const server = http.createServer(async (req, res) => {
  const path = req.url.split("?")[0];

  // a tiny status page so you can confirm it's alive
  if (path === "/" || path === "/health") {
    const s = loadStore();
    const total = Object.values(s.agents).reduce((n, a) => n + (a.spend || 0), 0);
    return json(res, 200, {
      ok: true, service: "TokenBrake local proxy", period: s.period,
      cloud_spend: Number(total.toFixed(4)),
      // Entitlement, for whoever has to evidence it. Reporting only — nothing here gates traffic.
      license: { licensed: LICENSE.licensed, tier: LICENSE.tier || null, ref: LICENSE.ref || null,
                 perpetual: LICENSE.perpetual ?? null, note: LICENSE.line },
      usage: "point your AI's base URL at http://localhost:" + PORT + "/openai or /anthropic",
    });
  }

  // Breaker state — what's tripped, why, and what it estimates it stopped.
  if (path === "/breaker") {
    const now = Date.now();
    return json(res, 200, {
      mode: BREAKER_MODE,
      agents: fleet.status(now),
      incidents: fleet.allIncidents().slice(0, 20),
      note: "estimatedSaved and projectedCostOverCooldown are projections from the burn rate at the moment of the trip, not measured spend.",
    });
  }

  // Manual override. Local-only (the server binds 127.0.0.1), so no auth needed — anyone who
  // can reach this can already read your files.
  if (path === "/breaker/reset") {
    const who = new URL(req.url, "http://x").searchParams.get("agent");
    if (!who) { fleet.map.forEach(b => b.reset(Date.now())); return json(res, 200, { ok: true, reset: "all" }); }
    fleet.for(who).reset(Date.now());
    return json(res, 200, { ok: true, reset: who });
  }

  const upstream = resolveUpstream(path);
  if (!upstream) return json(res, 400, { error: { message: "TokenBrake: unknown provider path — use /openai/... or /anthropic/...", type: "tokenbrake_bad_path" } });

  // which agent is this? (a header lets you name each AI; else default to the provider)
  const agent = String(req.headers["x-tokenbrake-agent"] || upstream.provider);

  // read the request body
  const chunks = []; for await (const c of req) chunks.push(c);
  const rawBody = Buffer.concat(chunks);

  // parse once — the breaker needs the body to fingerprint, the transform needs it anyway
  let reqObj = null;
  try { reqObj = JSON.parse(rawBody.toString()); } catch {}

  // RUNAWAY CHECK — before the budget check, because this is the one that fires in seconds
  // rather than after the money is gone. Wrapped so a fault here can never block a call.
  if (BREAKER_MODE !== "off") {
    try {
      const d = fleet.for(agent).allow(Date.now());
      if (!d.allow) {
        const br = breakerResponse(agent, d.reason, d.detail, d.retryInMs);
        return json(res, br.status, br.body, br.headers);
      }
    } catch { /* fail open — always */ }
  }

  // BUDGET CHECK — before we forward a cent's worth
  const store = loadStore();
  const a = store.agents[agent] || { spend: 0, budget: 0, mode: "hard" };
  const g = gate(a.spend, a.budget, { mode: a.mode });
  if (!g.allow) { const cap = capResponse(g.remaining, a.budget); return json(res, cap.status, cap.body); }

  // transform (inject usage for OpenAI streams) and forward
  let sendBody = rawBody, isStream = false, model;
  try { const t = transformRequest(upstream.provider, reqObj, path); isStream = t.isStream; model = t.model; sendBody = Buffer.from(JSON.stringify(t.body)); } catch {}
  const headers = forwardHeaders(req.headers);
  if (req.method !== "GET" && req.method !== "HEAD") headers["content-length"] = Buffer.byteLength(sendBody);

  let up;
  try {
    up = await fetch(upstream.target, { method: req.method, headers, body: (req.method === "GET" || req.method === "HEAD") ? undefined : sendBody });
  } catch {
    return json(res, 502, { error: { message: "TokenBrake could not reach the provider (your call was not charged).", type: "tokenbrake_upstream_unreachable" } });
  }

  // relay status + safe headers
  const outHeaders = {};
  up.headers.forEach((v, k) => { if (!/^(content-encoding|content-length|transfer-encoding)$/i.test(k)) outHeaders[k] = v; });
  res.writeHead(up.status, outHeaders);

  if (isStream && up.body) {
    let acc = ""; const dec = new TextDecoder(); const reader = up.body.getReader();
    while (true) { const { done, value } = await reader.read(); if (done) break; res.write(Buffer.from(value)); acc += dec.decode(value, { stream: true }); }
    res.end();
    meterAndRecord(agent, model, usageFromStream(acc), reqObj, up.status);   // meter after the stream closes
  } else {
    const buf = Buffer.from(await up.arrayBuffer());
    res.end(buf);
    // Meter even when the provider returned an error: a failing call still costs time, and the
    // breaker needs to see failures to spot a retry storm. Parse failures don't stop the record.
    let parsed = null; try { parsed = JSON.parse(buf.toString()); } catch {}
    meterAndRecord(agent, model, parsed, reqObj, up.status);
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`TokenBrake proxy live → http://localhost:${PORT}  (point your AI's base URL here: /openai or /anthropic)`);
  console.log(`  runaway breaker: ${BREAKER_MODE.toUpperCase()}  ·  state: http://localhost:${PORT}/breaker  ·  TB_BREAKER=watch to observe only, =off to disable`);
  console.log(`  ${LICENSE.line}`);
  console.log("  A Northjule product · https://tokenbrake.com");
});
