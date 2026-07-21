// TokenBrake — server state-engine tests (db.mjs). Locks down the money/state core: budgets,
// modes, recording, per-agent + total history, alerts, webhook, and CSV export. Uses a throwaway
// DB so it never touches a real one. Run: node test-server.mjs
import { rmSync } from "node:fs";
const DB = "/tmp/tb-servertest-" + Date.now() + ".db";
process.env.TB_DB = DB;
const { getAgent, record, setBudget, setAlerts, setWebhook, getWebhook, allAgents, historyFor, exportHistory } =
  await import("./server/db.mjs");

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log("  ✓", n); } else { fail++; console.log("  ✗ FAIL:", n); } };
const near = (a, b) => Math.abs(a - b) < 1e-9;

console.log("BUDGETS + MODES:");
setBudget("support-bot", 200, "hard");
ok("hard budget stored", (a => a.budget === 200 && a.mode === "hard")(getAgent("support-bot")));
setBudget("support-bot", 200, "soft");
ok("mode switches to soft", getAgent("support-bot").mode === "soft");
setBudget("batch", 50, "off");
ok("off mode stored", getAgent("batch").mode === "off");
setBudget("weird", 10, "banana");
ok("unknown mode falls back to hard", getAgent("weird").mode === "hard");

console.log("RECORD + COUNTERS:");
record("support-bot", 1.50, { inTokens: 1000, outTokens: 500 });
record("support-bot", 0.50, { inTokens: 200, outTokens: 100 });
const sb = getAgent("support-bot");
ok("spend accumulates ($2.00)", near(sb.spend, 2.00));
ok("calls counted (2)", sb.calls === 2);
ok("input tokens summed (1200)", sb.in_tok === 1200);
ok("output tokens summed (600)", sb.out_tok === 600);

console.log("HISTORY (total + per-agent):");
record("batch", 4.00, {});
const all = historyFor(30), sbh = historyFor(30, "support-bot"), bh = historyFor(30, "batch");
ok("history returns 30 continuous days", all.length === 30 && all[0].spend === 0);
ok("today total across agents ($6.00)", near(all[all.length - 1].spend, 6.00));
ok("per-agent history isolates support-bot ($2.00)", near(sbh[sbh.length - 1].spend, 2.00));
ok("per-agent history isolates batch ($4.00)", near(bh[bh.length - 1].spend, 4.00));
ok("unknown agent → all zeros, no throw", historyFor(30, "ghost").every(d => d.spend === 0));

console.log("ALERTS + WEBHOOK:");
setAlerts("support-bot", [1.25]);
ok("custom threshold stored as JSON", JSON.parse(getAgent("support-bot").alerts)[0] === 1.25);
setAlerts("support-bot", []);
ok("empty thresholds clear back to null (default)", getAgent("support-bot").alerts == null);
setWebhook("https://hooks.example.com/x");
ok("webhook set + read back", getWebhook() === "https://hooks.example.com/x");

console.log("ALL AGENTS + EXPORT:");
ok("allAgents sorted biggest spender first", allAgents()[0].name === "batch" || allAgents()[0].spend >= allAgents()[1].spend);
const rows = exportHistory();
ok("exportHistory returns rows for each agent", rows.some(r => r.name === "support-bot") && rows.some(r => r.name === "batch"));

console.log("CSV FORMATTING (endpoint logic):");
const q = v => { const s = String(v == null ? "" : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
ok("plain value unquoted", q("support-bot") === "support-bot");
ok("comma value quoted", q("a,b") === '"a,b"');
ok('quote value escaped + quoted', q('a"b') === '"a""b"');
record('tricky,"name', 1.0, {});
const csv = "agent,day,spend_usd,calls\n" + exportHistory().map(r => [q(r.name), q(r.day), (Number(r.spend) || 0).toFixed(6), Number(r.calls) || 0].join(",")).join("\n");
ok("CSV has header row", csv.startsWith("agent,day,spend_usd,calls\n"));
ok("CSV safely quotes a nasty agent name", csv.includes('"tricky,""name"'));
ok("CSV spend has fixed precision", /,\d+\.\d{6},/.test(csv));

try { rmSync(DB); } catch {}
console.log("\n" + (fail === 0 ? "✅ ALL " + pass + " SERVER TESTS PASS" : "❌ " + fail + " FAILED (" + pass + " passed)"));
process.exit(fail ? 1 : 0);
