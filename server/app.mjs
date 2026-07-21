#!/usr/bin/env node
// TokenBrake Server — self-hosted team API-cost gateway. Runs on the customer's own machine.
// Point your AI base URLs at it, it meters every call, and (in hard mode) stops a runaway bill
// at the budget. Ships a web dashboard. Keys and prompts never leave the customer's server.
import http from "node:http";
import crypto from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { resolveUpstream, transformRequest, forwardHeaders, capResponse } from "../lib/proxy-core.js";
import { costFromResponse, gate } from "../lib/meter.js";
import { usageFromStream } from "../lib/stream.js";
import { getAgent, record, setBudget, allAgents, setAlerts, setWebhook, getWebhook, historyFor, exportHistory } from "./db.mjs";
import { verifyLicense, seatsForTier } from "../lib/license.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.TB_PORT) || 8788;
const KEY = process.env.TB_KEY || "";                 // team's TokenBrake key; empty = open (dev only)
// In the single-file bundle the dashboard HTML is inlined as globalThis.__DASHBOARD_HTML.
// Running from source, we read it off disk. Either way DASH holds the dashboard.
const DASH = globalThis.__DASHBOARD_HTML || readFileSync(join(__dir, "dashboard.html"), "utf8");

// --- plan / seats. We sell by monitored agents (seats), not by "computers." Enforcement is SOFT:
// over the cap we flag "upgrade" but never stop metering — a licensing check must never break a
// customer's production traffic. Unlicensed runs as a free Solo plan (3 seats) with the same nudge.
// TRIAL: TokenBrake is a paid product with a 14-day free trial — everything unlocked, no card,
// no account. We stamp first-run locally (~/.tokenbrake-trial); there's no phone-home. After the
// trial an unlicensed install keeps metering and keeps enforcing the budget caps the customer
// already set — the safety brake NEVER expires — but drops to 1 seat and loses history/export.
// Deleting the stamp resets the trial. That's deliberate: this is a brake on somebody's
// production traffic, and we will not build something that punishes them harder than it helps.
const TRIAL_DAYS = 14;
const TRIAL_FILE = join(process.env.HOME || ".", ".tokenbrake-trial");
function trialState() {
  try {
    let started;
    try { started = Number(readFileSync(TRIAL_FILE, "utf8").trim()); } catch {}
    if (!Number.isFinite(started) || started <= 0) {
      started = Math.floor(Date.now() / 1000);
      try { writeFileSync(TRIAL_FILE, String(started), { mode: 0o600 }); } catch {}
    }
    const daysLeft = Math.ceil((started + TRIAL_DAYS * 86400 - Date.now() / 1000) / 86400);
    return { started, active: daysLeft > 0, daysLeft: Math.max(0, daysLeft) };
  } catch { return { started: 0, active: true, daysLeft: TRIAL_DAYS }; }   // never fail closed
}
const LIC = process.env.TB_LICENSE ? verifyLicense(process.env.TB_LICENSE) : null;
const TRIAL = (LIC && LIC.valid) ? { active: false, daysLeft: 0 } : trialState();
const PLAN = (LIC && LIC.valid)
  ? { tier: LIC.tier, seats: LIC.seats, licensed: true, trial: false }
  : TRIAL.active
    ? { tier: "trial", seats: seatsForTier("business"), licensed: false, trial: true }   // trial = everything unlocked
    : { tier: "expired", seats: 1, licensed: false, trial: false };                      // still meters, still caps, 1 seat
function planStatus() {
  const used = allAgents().length;                    // distinct agents/projects tracked this month
  const over = PLAN.seats > 0 && used > PLAN.seats;   // seats 0 = unlimited
  return { tier: PLAN.tier, seats: PLAN.seats, used, over, licensed: PLAN.licensed, trial: PLAN.trial, trialDaysLeft: TRIAL.daysLeft };
}
// history + CSV export are paid features; the trial has them, an expired unlicensed install doesn't
const historyAllowed = () => PLAN.licensed || PLAN.trial;
const json = (res, s, o) => { res.writeHead(s, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
// constant-time secret compare — no timing side-channel on the TokenBrake key
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const authed = req => !KEY || safeEq(req.headers["x-tokenbrake-key"] || "", KEY) || safeEq(req.headers["authorization"] || "", "Bearer " + KEY);
const meterAndRecord = (agent, model, body) => { try { const { cost, ...u } = costFromResponse(model, body); if (cost > 0) record(agent, cost, u); } catch {} };

// Read a request body with a hard size cap so a malicious/broken client can't OOM the server.
// Throws { tooLarge:true } past the limit; callers turn that into a 413.
async function readBody(req, maxBytes) {
  const chunks = []; let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > maxBytes) { const e = new Error("body too large"); e.tooLarge = true; throw e; }
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}
const CTRL_MAX = 256 * 1024;            // control endpoints: small JSON only
const PROXY_MAX = 25 * 1024 * 1024;     // proxy: room for big prompts, but bounded

const server = http.createServer(async (req, res) => {
 try {
  const path = req.url.split("?")[0];

  // --- dashboard (the web UI) ---
  if (req.method === "GET" && (path === "/" || path === "/dashboard")) { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); return res.end(DASH); }
  if (path === "/health") return json(res, 200, { ok: true, service: "TokenBrake Server", secured: !!KEY });

  // --- machine-readable manifest: how any AI agent can operate this TokenBrake ---
  // Public so a customer's assistant can discover the controls; every WRITE still needs the key.
  if (req.method === "GET" && (path === "/agent.json" || path === "/.well-known/agent.json")) {
    const base = `http://${req.headers.host || "localhost:" + PORT}`;
    return json(res, 200, {
      name: "TokenBrake",
      description: "Circuit breaker for AI API bills. Meters every call, caps runaway spend, alerts at your own thresholds.",
      instructions: "You are operating a customer's TokenBrake meter. Send the header 'x-tokenbrake-key: <TB_KEY>' on every write call. Budgets and alerts are per agent/project name. 'mode' is hard (stop at budget), soft (warn, keep running), or off (no cap). Alert thresholds are fractions of budget: 1.0 = 100%, 1.25 = 125%.",
      auth: { type: "apiKey", header: "x-tokenbrake-key", note: KEY ? "required" : "server is open (no key set)" },
      actions: {
        check_meter: { method: "GET", path: "/api/stats", auth: true, description: "Read every agent's spend, budget, mode, and call count for this month." },
        set_budget: { method: "POST", path: "/api/budget", auth: true, body: { name: "string", budget: "number (USD/month)", mode: "hard|soft|off" }, description: "Set or change a budget. Turn the cap OFF with mode 'off'; turn it back ON with 'hard'." },
        set_alerts: { method: "POST", path: "/api/alerts", auth: true, body: { name: "string", thresholds: "number[] fractions of budget e.g. [1.25]", webhook: "string URL (optional, applies server-wide)" }, description: "Choose when to be notified. e.g. thresholds [1.25] = only alert at 125% of budget." },
      },
      examples: [
        `curl -H "x-tokenbrake-key: TB_KEY" ${base}/api/stats`,
        `curl -X POST -H "x-tokenbrake-key: TB_KEY" -H "content-type: application/json" -d '{"name":"support-bot","budget":200,"mode":"hard"}' ${base}/api/budget`,
        `curl -X POST -H "x-tokenbrake-key: TB_KEY" -H "content-type: application/json" -d '{"name":"support-bot","thresholds":[1.25]}' ${base}/api/alerts`,
      ],
      proxy: { openai: `${base}/openai`, anthropic: `${base}/anthropic`, xai: `${base}/xai`, groq: `${base}/groq`, deepseek: `${base}/deepseek`, mistral: `${base}/mistral`, gemini: `${base}/gemini`, openrouter: `${base}/openrouter`, note: "Point your AI base_url here to start metering. /xai /groq /deepseek /mistral /openrouter are OpenAI-compatible (use the OpenAI SDK); /gemini uses Google's native format. Tag calls with header 'x-tokenbrake-agent: <name>'." },
      plan: planStatus()
    });
  }

  // --- dashboard API (needs the key) ---
  if (path === "/api/stats") { if (!authed(req)) return json(res, 401, { error: "bad key" }); return json(res, 200, { agents: allAgents(), webhook: getWebhook(), plan: planStatus(), period: new Date().toISOString().slice(0, 7) }); }
  if (path === "/api/history") { if (!authed(req)) return json(res, 401, { error: "bad key" }); if (!historyAllowed()) return json(res, 402, { error: "Spend history is a paid feature — your trial has ended.", upgrade: "https://tokenbrake.com/pricing" }); const u = new URL(req.url, "http://x"); const days = Number(u.searchParams.get("days")) || 30; const agent = u.searchParams.get("agent") || null; return json(res, 200, { days: historyFor(days, agent), agent }); }
  if (path === "/api/export.csv") {
    if (!authed(req)) return json(res, 401, { error: "bad key" });
    if (!historyAllowed()) return json(res, 402, { error: "CSV export is a paid feature — your trial has ended.", upgrade: "https://tokenbrake.com/pricing" });
    const q = v => { const s = String(v == null ? "" : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    let csv = "agent,day,spend_usd,calls\n";
    for (const r of exportHistory()) csv += [q(r.name), q(r.day), (Number(r.spend) || 0).toFixed(6), Number(r.calls) || 0].join(",") + "\n";
    res.writeHead(200, { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="tokenbrake-history.csv"' });
    return res.end(csv);
  }
  if (path === "/api/budget" && req.method === "POST") {
    if (!authed(req)) return json(res, 401, { error: "bad key" });
    const raw = await readBody(req, CTRL_MAX);
    let b = {}; try { b = JSON.parse(raw.toString()); } catch {}
    return json(res, 200, setBudget(b.name, b.budget, b.mode));
  }
  // set notification thresholds (per agent) + optional webhook (server-wide). Customer decides when to be pinged.
  if (path === "/api/alerts" && req.method === "POST") {
    if (!authed(req)) return json(res, 401, { error: "bad key" });
    const raw = await readBody(req, CTRL_MAX);
    let b = {}; try { b = JSON.parse(raw.toString()); } catch {}
    if (typeof b.webhook === "string") setWebhook(b.webhook);
    const agent = b.name ? setAlerts(b.name, b.thresholds) : null;
    return json(res, 200, { ok: true, agent, webhook: getWebhook() });
  }

  // --- the proxy (needs the key) ---
  const upstream = resolveUpstream(path);
  if (!upstream) return json(res, 404, { error: { message: "TokenBrake Server: use /openai/... or /anthropic/... (or open / for the dashboard)" } });
  if (!authed(req)) return json(res, 401, { error: { message: "TokenBrake: missing or bad x-tokenbrake-key" } });

  const agent = String(req.headers["x-tokenbrake-agent"] || upstream.provider);
  const rawBody = await readBody(req, PROXY_MAX);

  // BUDGET CHECK — before forwarding
  const a = getAgent(agent);
  const g = gate(a.spend, a.budget, { mode: a.mode });
  if (!g.allow) { const cap = capResponse(g.remaining, a.budget); return json(res, cap.status, cap.body); }

  // transform + forward. Pass the path so Gemini can read its model + stream flag from the URL.
  let sendBody = rawBody, isStream = false, model, parsed;
  try { parsed = JSON.parse(rawBody.toString()); } catch {}
  try {
    const t = transformRequest(upstream.provider, parsed ?? {}, path);
    isStream = t.isStream; model = t.model;
    if (parsed !== undefined) sendBody = Buffer.from(JSON.stringify(t.body));
  } catch {}
  const headers = forwardHeaders(req.headers);
  if (req.method !== "GET" && req.method !== "HEAD") headers["content-length"] = Buffer.byteLength(sendBody);

  // preserve the original query string (Gemini uses ?alt=sse and optional ?key=). Host stays
  // fixed by resolveUpstream, so a query can't redirect us off the allowlisted origin.
  const qs = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";

  let up;
  try { up = await fetch(upstream.target + qs, { method: req.method, headers, body: (req.method === "GET" || req.method === "HEAD") ? undefined : sendBody }); }
  catch { return json(res, 502, { error: { message: "TokenBrake could not reach the provider (not charged)." } }); }

  const outHeaders = {};
  up.headers.forEach((v, k) => { if (!/^(content-encoding|content-length|transfer-encoding)$/i.test(k)) outHeaders[k] = v; });
  res.writeHead(up.status, outHeaders);

  if (isStream && up.body) {
    let acc = ""; const dec = new TextDecoder(); const reader = up.body.getReader();
    while (true) { const { done, value } = await reader.read(); if (done) break; res.write(Buffer.from(value)); acc += dec.decode(value, { stream: true }); }
    res.end(); meterAndRecord(agent, model, usageFromStream(acc));
  } else {
    const buf = Buffer.from(await up.arrayBuffer()); res.end(buf);
    try { meterAndRecord(agent, model, JSON.parse(buf.toString())); } catch {}
  }
 } catch (e) {
   // top-level boundary: an unexpected fault returns a clean error, never crashes the process
   if (e && e.tooLarge) { if (!res.headersSent) { try { json(res, 413, { error: { message: "TokenBrake: request body too large" } }); } catch {} } try { req.destroy(); } catch {} return; }
   if (!res.headersSent) { try { json(res, 500, { error: { message: "TokenBrake: internal error" } }); } catch {} }
   try { res.end(); } catch {}
 }
});

server.listen(PORT, () => {
  console.log(`TokenBrake Server → http://localhost:${PORT}`);
  console.log(`  dashboard: http://localhost:${PORT}/   ·   proxy: /openai /anthropic /xai /groq /deepseek /mistral /gemini /openrouter`);
  console.log(KEY ? "  secured with TB_KEY ✓" : "  ⚠ TB_KEY not set — open to anyone. Set TB_KEY before exposing this.");
  const seatTxt = PLAN.seats > 0 ? `${PLAN.seats} agent${PLAN.seats === 1 ? "" : "s"}` : "unlimited agents";
  if (PLAN.licensed)   console.log(`  plan: ${PLAN.tier} (${seatTxt}) · licensed ✓`);
  else if (PLAN.trial) console.log(`  plan: free trial — ${TRIAL.daysLeft} day${TRIAL.daysLeft === 1 ? "" : "s"} left, everything unlocked (${seatTxt}). Buy a licence: https://tokenbrake.com/pricing`);
  else                 console.log(`  plan: trial ended — still metering, budget caps still enforced, limited to ${seatTxt}. History & CSV export are off. Set TB_LICENSE to restore: https://tokenbrake.com/pricing`);
});
