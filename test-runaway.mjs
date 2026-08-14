// TokenBrake v2 — tests for runaway detection and the circuit breaker.
//
// This is the code that can refuse a customer's production traffic, so it gets the hardest
// tests in the repo. Three things matter more than anything else here:
//
//   1. It catches a real loop, fast.
//   2. It does NOT trip on legitimate heavy traffic. A false positive costs more trust than a
//      missed loop costs money — the budget cap still backstops the slow case.
//   3. It fails OPEN. If any part of detection throws, the call goes through.

import { Window, assess, fingerprint, DEFAULTS } from "./lib/runaway.js";
import { Breaker, Fleet, breakerResponse } from "./lib/breaker.js";

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log("  ✓ " + name); } else { fail++; console.log("  ✗ " + name); } };
const T0 = 1_700_000_000_000;

// helpers ────────────────────────────────────────────────────────────────────
const chat = (text, model = "gpt-4o") => ({ model, messages: [{ role: "user", content: text }] });
const convo = (n, tail) => ({ model: "gpt-4o", messages: [
  ...Array.from({ length: n }, (_, i) => ({ role: "assistant", content: "step " + i })),
  { role: "user", content: tail },
]});

function feed(target, { n, gapMs, body, cost = 0.001, ok: good = true, start = T0, vary = false }) {
  let t = start;
  for (let i = 0; i < n; i++) {
    const b = vary ? chat("unique request number " + i) : body;
    if (target instanceof Breaker) target.record(t, { body: b, cost, ok: good });
    else { const f = fingerprint(b); target.add({ at: t, exact: f.exact, tail: f.tail, cost, ok: good }); }
    t += gapMs;
  }
  return t;
}

console.log("\nFingerprinting");
{
  const a = fingerprint(chat("hello")), b = fingerprint(chat("hello"));
  ok("identical requests share both fingerprints", a.exact === b.exact && a.tail === b.tail);
}
{
  const a = fingerprint(chat("hello")), b = fingerprint(chat("goodbye"));
  ok("different requests differ", a.exact !== b.exact && a.tail !== b.tail);
}
{
  // The nasty real-world loop: context grows every turn, but the question never changes.
  const a = fingerprint(convo(3, "what should I do next?"));
  const b = fingerprint(convo(9, "what should I do next?"));
  ok("growing context, same question → SAME tail fingerprint (the loop we must catch)", a.tail === b.tail);
  ok("…while the exact fingerprint correctly differs", a.exact !== b.exact);
}
{
  const a = fingerprint(chat("x", "gpt-4o")), b = fingerprint(chat("x", "gpt-4o-mini"));
  ok("same text on a different model is a different call", a.tail !== b.tail);
}
ok("unhashable input never throws", (() => { const c = {}; c.self = c; const f = fingerprint(c); return f && "exact" in f; })());

console.log("\nDetection — the loop it must catch");
{
  const w = new Window();
  feed(w, { n: 60, gapMs: 500, body: chat("am I done yet?") });   // 120/min, identical
  const v = assess(w, T0 + 30_000);
  ok("60 identical calls at 120/min trips", v.trip === true);
  ok("…reason is 'loop'", v.reason === "loop");
  ok("…and it explains itself in plain words", /same request/.test(v.detail || ""));
}
{
  const w = new Window();
  const end = feed(w, { n: 40, gapMs: 300, body: convo(5, "keep going") });
  ok("a growing-context loop is caught too", assess(w, end).trip === true);
}

console.log("\nDetection — what it must NOT touch (false positives)");
{
  const w = new Window();
  feed(w, { n: 200, gapMs: 100, vary: true });                    // 600/min, all different
  const v = assess(w, T0 + 20_000);
  ok("a fast batch job with 200 DIFFERENT prompts does not trip", v.trip === false);
}
{
  const w = new Window();
  feed(w, { n: 8, gapMs: 100, body: chat("same") });
  ok("a short identical burst below minCalls does not trip", assess(w, T0 + 800).trip === false);
}
{
  const w = new Window();
  feed(w, { n: 40, gapMs: 60_000, body: chat("same") });          // identical but ~1/min
  ok("identical calls at a SLOW rate do not trip (a cron job, not a loop)", assess(w, T0 + 40 * 60_000).trip === false);
}
{
  const w = new Window();
  feed(w, { n: 30, gapMs: 1000, vary: true, cost: 0 });
  ok("a brand-new agent working normally does not trip on surge", assess(w, T0 + 30_000).trip === false);
}

console.log("\nDetection — the other three reasons");
{
  const w = new Window();
  feed(w, { n: 20, gapMs: 1000, vary: true, cost: 0.5 });         // $10/min, varied prompts
  const v = assess(w, T0 + 20_000);
  ok("varied prompts still trip on raw burn rate", v.trip === true && v.reason === "burn");
  ok("…and quotes the hourly figure", /an hour/.test(v.detail || ""));
}
{
  const w = new Window();
  feed(w, { n: 30, gapMs: 500, vary: true, ok: false, cost: 0.001 });
  const v = assess(w, T0 + 15_000);
  ok("a retry storm of failing calls trips", v.trip === true && v.reason === "error_storm");
}
{
  const w = new Window();
  // Teach it a calm baseline over many separate windows, then surge with varied prompts.
  let t = T0;
  for (let k = 0; k < 5; k++) { t = feed(w, { n: 15, gapMs: 4000, vary: true, start: t }); w.learn(t); }
  const base = w.baseline;
  const w2 = new Window(); w2.baseline = base; w2.seen = 200;
  feed(w2, { n: 120, gapMs: 200, vary: true, start: t });
  const v = assess(w2, t + 24_000);
  ok("a surge far above a LEARNED baseline trips", v.trip === true && v.reason === "surge");
  ok("…and names the multiple of normal", /baseline/.test(v.detail || ""));
}

console.log("\nBreaker — the state machine");
{
  const b = new Breaker("looper", { cooldownMs: 60_000 });
  ok("starts closed and allows", b.allow(T0).allow === true && b.state === "closed");

  feed(b, { n: 60, gapMs: 500, body: chat("stuck") });
  ok("trips to open on a loop", b.state === "open");
  const openedAt = b.openedAt;
  ok("…trips FAST — inside the first 6 seconds, not after the budget is gone", openedAt - T0 < 6_000);
  ok("…and spends the evidence so recovery isn't judged on the fault", b.win.records.length === 0);

  const d = b.allow(openedAt + 30_000);
  ok("blocks while open", d.allow === false && d.state === "open");
  ok("…tells the caller when to retry", d.retryInMs > 0);

  const inc = b.incidents[0];
  ok("records an incident with evidence", !!inc && inc.reason === "loop" && inc.metrics.calls > 0);
  ok("…including a clearly-projected cost", typeof inc.projectedCostOverCooldown === "number");

  const probe = b.allow(openedAt + 60_001);
  ok("after cooldown it half-opens and allows ONE probe", probe.allow === true && probe.state === "half_open" && probe.probe === true);
  ok("…and holds everything else back meanwhile", b.allow(openedAt + 60_002).allow === false);

  b.record(openedAt + 61_000, { body: chat("something else entirely"), cost: 0.001, ok: true });
  ok("a healthy probe closes the breaker", b.state === "closed");
  ok("…and traffic flows again", b.allow(openedAt + 62_000).allow === true);
}
{
  const b = new Breaker("persistent", { cooldownMs: 10_000, backoff: 2 });
  feed(b, { n: 60, gapMs: 500, body: chat("stuck") });
  const first = b.cooldownMs;
  b.allow(T0 + 30_000 + 10_001);                        // half-open
  feed(b, { n: 60, gapMs: 500, body: chat("stuck"), start: T0 + 41_000 });
  ok("re-tripping backs the cooldown off", b.cooldownMs > first);
  ok("…and the backoff is capped", b.cooldownMs <= b.cfg.maxCooldownMs);
}
{
  const b = new Breaker("watched", { mode: "watch", cooldownMs: 10_000 });
  feed(b, { n: 60, gapMs: 500, body: chat("stuck") });
  ok("watch mode still detects and records", b.state === "open" && b.incidents.length === 1);
  ok("…but NEVER blocks a call", b.allow(T0 + 30_000).allow === true);
}
{
  const b = new Breaker("manual", { cooldownMs: 999_999 });
  feed(b, { n: 60, gapMs: 500, body: chat("stuck") });
  b.reset();
  ok("a human can always override the breaker", b.state === "closed" && b.allow(T0 + 1).allow === true);
}

console.log("\nFail-open — the promise that must never break");
{
  const b = new Breaker("broken");
  b.win = null;                                          // simulate total internal corruption
  ok("record() swallows an internal fault", b.record(T0, { body: chat("x") }) === null);
  ok("allow() still ALLOWS when internals are broken", b.allow(T0).allow === true);
}
{
  const b = new Breaker("throwy", { cooldownMs: 10_000 });
  feed(b, { n: 60, gapMs: 500, body: chat("stuck") });
  Object.defineProperty(b, "incidents", { get() { throw new Error("boom"); } });
  const d = b.allow(T0 + 1000);
  ok("a throw inside the open path fails OPEN, not closed", d.allow === true && d.failedOpen === true);
}
{
  const b = new Breaker("weird");
  ok("garbage bodies don't trip or throw", b.record(T0, { body: undefined }) === null && b.allow(T0).allow === true);
}

console.log("\nFleet — agents stay independent");
{
  const f = new Fleet({ cooldownMs: 300_000 });
  feed(f.for("summariser"), { n: 60, gapMs: 500, body: chat("stuck") });
  ok("the stuck agent is stopped", f.for("summariser").allow(T0 + 30_000).allow === false);
  ok("a different agent is untouched", f.for("checkout").allow(T0 + 30_000).allow === true);
  ok("incidents are collected fleet-wide", f.allIncidents().length === 1);
  ok("status reports every agent", f.status(T0 + 30_000).length === 2);
}

console.log("\nThe blocked response");
{
  const r = breakerResponse("summariser", "loop", "It went round in circles.", 45_000);
  ok("is a 429 with retry-after", r.status === 429 && r.headers["retry-after"] === "45");
  ok("names the agent and the fix", /summariser/.test(r.body.error.message) && /reset\.mjs/.test(r.body.error.message));
  ok("uses a stable machine-readable code", r.body.error.code === "runaway_loop");
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
