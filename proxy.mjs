#!/usr/bin/env node
// TokenBrake — local metering proxy. Point a cloud AI's base URL at http://localhost:8787/openai
// (or /anthropic) and every call is metered, budget-checked, and (in hard mode) stopped at the
// cap. Runs on YOUR machine: your keys and prompts never leave it except to the real provider.
import http from "node:http";
import { resolveUpstream, transformRequest, forwardHeaders, capResponse } from "./lib/proxy-core.js";
import { costFromResponse, gate } from "./lib/meter.js";
import { usageFromStream } from "./lib/stream.js";
import { loadStore, recordSpend } from "./lib/store.js";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// TokenBrake is a paid tool ($99/yr) with a 14-day free trial — everything unlocked, no card,
// no account, no phone-home. We stamp first run locally and count down from there.
// After the trial NOTHING about your traffic changes: the proxy keeps metering and keeps
// enforcing your budget caps, forever. The brake is a safety device and we will not disable a
// safety device over money. What you lose is scale and reporting — see the server build.
const TRIAL_DAYS = 14;
const TRIAL_FILE = join(process.env.HOME || ".", ".tokenbrake-trial");
function trialDaysLeft() {
  try {
    let started;
    try { started = Number(readFileSync(TRIAL_FILE, "utf8").trim()); } catch {}
    if (!Number.isFinite(started) || started <= 0) {
      started = Math.floor(Date.now() / 1000);
      try { writeFileSync(TRIAL_FILE, String(started), { mode: 0o600 }); } catch {}
    }
    return Math.max(0, Math.ceil((started + TRIAL_DAYS * 86400 - Date.now() / 1000) / 86400));
  } catch { return TRIAL_DAYS; }
}

const PORT = Number(process.env.TB_PORT) || 8787;
const json = (res, status, obj) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };

function meterAndRecord(agent, model, body) {
  try { const { cost, ...usage } = costFromResponse(model, body); if (cost > 0) recordSpend(agent, cost, usage); } catch {}
}

const server = http.createServer(async (req, res) => {
  const path = req.url.split("?")[0];

  // a tiny status page so you can confirm it's alive
  if (path === "/" || path === "/health") {
    const s = loadStore();
    const total = Object.values(s.agents).reduce((n, a) => n + (a.spend || 0), 0);
    return json(res, 200, { ok: true, service: "TokenBrake local proxy", period: s.period, cloud_spend: Number(total.toFixed(4)), usage: "point your AI's base URL at http://localhost:" + PORT + "/openai or /anthropic" });
  }

  const upstream = resolveUpstream(path);
  if (!upstream) return json(res, 400, { error: { message: "TokenBrake: unknown provider path — use /openai/... or /anthropic/...", type: "tokenbrake_bad_path" } });

  // which agent is this? (a header lets you name each AI; else default to the provider)
  const agent = String(req.headers["x-tokenbrake-agent"] || upstream.provider);

  // read the request body
  const chunks = []; for await (const c of req) chunks.push(c);
  const rawBody = Buffer.concat(chunks);

  // BUDGET CHECK — before we forward a cent's worth
  const store = loadStore();
  const a = store.agents[agent] || { spend: 0, budget: 0, mode: "hard" };
  const g = gate(a.spend, a.budget, { mode: a.mode });
  if (!g.allow) { const cap = capResponse(g.remaining, a.budget); return json(res, cap.status, cap.body); }

  // transform (inject usage for OpenAI streams) and forward
  let sendBody = rawBody, isStream = false, model;
  try { const t = transformRequest(upstream.provider, JSON.parse(rawBody.toString())); isStream = t.isStream; model = t.model; sendBody = Buffer.from(JSON.stringify(t.body)); } catch {}
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
    meterAndRecord(agent, model, usageFromStream(acc));            // meter after the stream closes
  } else {
    const buf = Buffer.from(await up.arrayBuffer());
    res.end(buf);
    try { meterAndRecord(agent, model, JSON.parse(buf.toString())); } catch {}
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`TokenBrake proxy live → http://localhost:${PORT}  (point your AI's base URL here: /openai or /anthropic)`);
  const left = process.env.TB_LICENSE ? -1 : trialDaysLeft();
  if (left < 0)       console.log("  licensed ✓  — thank you.");
  else if (left > 0)  console.log(`  free trial — ${left} day${left === 1 ? "" : "s"} left. TokenBrake is $99/yr: https://tokenbrake.com/pricing`);
  else                console.log("  trial ended — metering and your budget caps keep running (the brake never expires).\n  Support it and unlock the team server: https://tokenbrake.com/pricing");
});
