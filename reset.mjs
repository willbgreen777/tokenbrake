#!/usr/bin/env node
// TokenBrake — clear a tripped runaway breaker.
//
//   node reset.mjs                 clear every agent
//   node reset.mjs summariser      clear one agent
//   node reset.mjs --status        show what's tripped and why
//
// The breaker lives in the running proxy's memory, so this talks to it over localhost rather
// than touching a file. If the proxy isn't running there is nothing tripped to clear.
//
// You should rarely need this: a tripped breaker half-opens on its own after the cooldown and
// closes itself if the agent has recovered. This is the manual override for when you know
// better than it does — which you sometimes will.

const PORT = Number(process.env.TB_PORT) || 8787;
const base = `http://127.0.0.1:${PORT}`;
const args = process.argv.slice(2);
const wantStatus = args.includes("--status") || args.includes("-s");
const agent = args.find(a => !a.startsWith("-"));

const money = n => "$" + Number(n || 0).toFixed(2);
const secs = ms => Math.max(0, Math.round((ms || 0) / 1000)) + "s";

async function main() {
  let res;
  try {
    res = await fetch(base + (wantStatus ? "/breaker" : "/breaker/reset" + (agent ? `?agent=${encodeURIComponent(agent)}` : "")),
      { method: wantStatus ? "GET" : "POST" });
  } catch {
    console.error(`Couldn't reach the TokenBrake proxy on ${base}.`);
    console.error("If it isn't running, nothing is tripped — there's nothing to reset.");
    console.error("Start it with:  node ~/TokenBrake/proxy.mjs");
    process.exit(1);
  }

  const data = await res.json().catch(() => ({}));

  if (wantStatus) {
    console.log(`\nTokenBrake runaway breaker — mode: ${data.mode}\n`);
    if (!data.agents || !data.agents.length) {
      console.log("  No agents seen yet. Nothing to report.\n");
      return;
    }
    for (const a of data.agents) {
      const mark = a.state === "closed" ? "✓" : a.state === "open" ? "🛑" : "…";
      console.log(`  ${mark} ${a.agent.padEnd(20)} ${a.state.padEnd(10)} normal ~${a.baseline}/min` +
        (a.state === "open" ? `  · resumes in ${secs(a.retryInMs)}` : ""));
      if (a.lastIncident) {
        console.log(`      last trip: ${a.lastIncident.reason} — ${a.lastIncident.detail}`);
      }
      if (a.blocked) {
        console.log(`      refused ${a.blocked} calls · estimated spend avoided ~${money(a.estimatedSaved)} (projection, not measured)`);
      }
    }
    console.log("");
    return;
  }

  console.log(`✓ Breaker cleared for: ${data.reset || agent || "all agents"}. Calls resume immediately.`);
}

main().catch(e => { console.error("reset failed:", e.message); process.exit(1); });
