#!/usr/bin/env node
// TokenBrake — the demo that shows why v2 exists.
//
//   node demo-runaway.mjs
//
// Simulates one night. An agent gets stuck in a loop at 02:00 and keeps calling until someone
// notices at 08:00. We run the same six hours twice: once with a v1 monthly budget cap, once
// with the v2 runaway breaker, and print what each one actually cost.
//
// No network, no API keys, no money. Pure simulation against the real detection code — the
// same lib/runaway.js and lib/breaker.js the proxy uses in production.

import { Breaker } from "./lib/breaker.js";
import { gate } from "./lib/meter.js";

const money = n => "$" + Number(n).toFixed(2);
const clock = ms => new Date(ms).toISOString().slice(11, 19);

// ── the night ───────────────────────────────────────────────────────────────
const START      = Date.UTC(2026, 0, 1, 2, 0, 0);   // 02:00 — the loop begins
const NOTICED_AT = Date.UTC(2026, 0, 1, 8, 0, 0);   // 08:00 — a human wakes up
const GAP_MS     = 900;                             // a call every 0.9s
const COST_EACH  = 0.012;                           // a modest agent turn
const MONTHLY_BUDGET = 400;                         // v1's ceiling
const ALREADY_SPENT  = 120;                         // it's mid-month

const stuckCall = { model: "gpt-4o", messages: [
  { role: "system", content: "You are a helpful research agent." },
  { role: "user", content: "Find the answer and stop when you have it." },
  { role: "assistant", content: "Let me check that again." },
]};

console.log(`
╔════════════════════════════════════════════════════════════════════╗
║  One agent. One stuck loop. 02:00 to 08:00.                        ║
║  A call every ${(GAP_MS / 1000).toFixed(1)}s at $${COST_EACH.toFixed(3)} each. Nobody is awake.            ║
╚════════════════════════════════════════════════════════════════════╝`);

/* ── Run 1: v1, a monthly budget cap only ─────────────────────────────────── */

let spent = ALREADY_SPENT, calls = 0, cappedAt = null;
for (let t = START; t <= NOTICED_AT; t += GAP_MS) {
  const g = gate(spent, MONTHLY_BUDGET, { mode: "hard" });
  if (!g.allow) { cappedAt = cappedAt ?? t; break; }
  spent += COST_EACH; calls++;
}
const v1Burned = spent - ALREADY_SPENT;

console.log(`\n── v1 · monthly budget cap (${money(MONTHLY_BUDGET)}, ${money(ALREADY_SPENT)} already spent) ──`);
console.log(`   calls allowed through : ${calls.toLocaleString()}`);
console.log(`   burned by the loop    : ${money(v1Burned)}`);
console.log(cappedAt
  ? `   cap finally fired at  : ${clock(cappedAt)} — after ${((cappedAt - START) / 3.6e6).toFixed(1)} hours`
  : `   cap never fired       : the loop stayed under the ceiling all night`);
console.log(`   → the cap worked exactly as designed. It is simply the wrong instrument:`);
console.log(`     it can only act once the money is already gone.`);

/* ── Run 2: v2, the runaway breaker ───────────────────────────────────────── */

const b = new Breaker("research-agent", { cooldownMs: 300_000 });   // 5 min cooldowns
let spent2 = ALREADY_SPENT, calls2 = 0, blocked = 0, firstTrip = null;

for (let t = START; t <= NOTICED_AT; t += GAP_MS) {
  const d = b.allow(t);
  if (!d.allow) { blocked++; continue; }
  const g = gate(spent2, MONTHLY_BUDGET, { mode: "hard" });
  if (!g.allow) break;
  spent2 += COST_EACH; calls2++;
  const inc = b.record(t, { body: stuckCall, cost: COST_EACH, ok: true });
  if (inc && !firstTrip) firstTrip = inc;
}
const v2Burned = spent2 - ALREADY_SPENT;

console.log(`\n── v2 · runaway breaker ──`);
console.log(`   calls allowed through : ${calls2.toLocaleString()}`);
console.log(`   calls refused         : ${blocked.toLocaleString()}`);
console.log(`   burned by the loop    : ${money(v2Burned)}`);
if (firstTrip) {
  console.log(`   tripped at            : ${clock(firstTrip.at)} — ${((firstTrip.at - START) / 1000).toFixed(0)} seconds in`);
  console.log(`   reason                : ${firstTrip.reason}`);
  console.log(`   what it saw           : ${firstTrip.detail}`);
}

/* ── the difference ───────────────────────────────────────────────────────── */

const saved = v1Burned - v2Burned;
console.log(`
╔════════════════════════════════════════════════════════════════════╗
║  budget cap alone : ${money(v1Burned).padEnd(10)}                                    ║
║  runaway breaker  : ${money(v2Burned).padEnd(10)}                                    ║
║  difference       : ${money(saved).padEnd(10)} on ONE loop, on ONE night          ║
╚════════════════════════════════════════════════════════════════════╝

Both runs used the same cap, the same prices and the same loop. The only
difference is that v2 recognised the SHAPE of the traffic — the same request,
over and over, going nowhere — and stopped it in ${firstTrip ? ((firstTrip.at - START) / 1000).toFixed(0) : "?"} seconds instead of hours.

After each cooldown it let one call through to check whether the agent had
recovered. It hadn't, so it re-opened and backed off. That is why the night
cost ${money(v2Burned)} instead of ${money(v1Burned)} — and why nobody had to be awake.
`);
