// TokenBrake Server — persistent store (built-in SQLite, zero dependencies). Holds each
// agent/project's budget, mode, and running spend for the current month. Atomic updates via
// single SQL statements so concurrent calls can't race past the cap. Lives on the customer's
// own server — their numbers never leave their infrastructure.
import { DatabaseSync } from "node:sqlite";
import { homedir } from "node:os";
import { thresholdsCrossed } from "../lib/meter.js";

const PATH = process.env.TB_DB || (homedir() + "/.tokenbrake-server.db");
const db = new DatabaseSync(PATH);
db.exec(`CREATE TABLE IF NOT EXISTS agents(
  name TEXT PRIMARY KEY, budget REAL DEFAULT 0, mode TEXT DEFAULT 'hard',
  spend REAL DEFAULT 0, calls INTEGER DEFAULT 0, in_tok INTEGER DEFAULT 0, out_tok INTEGER DEFAULT 0,
  period TEXT, alerts TEXT )`);
db.exec(`CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY, v TEXT)`);
// Daily spend history — persists forever (survives the monthly counter reset) so the dashboard
// can show real trends over time, not just this month. One row per agent per day.
db.exec(`CREATE TABLE IF NOT EXISTS history(
  name TEXT, day TEXT, spend REAL DEFAULT 0, calls INTEGER DEFAULT 0,
  PRIMARY KEY(name, day) )`);
try { db.exec("ALTER TABLE agents ADD COLUMN alerts TEXT"); } catch {}   // upgrade older DBs

const period = () => new Date().toISOString().slice(0, 7);   // "2026-07"
const today  = () => new Date().toISOString().slice(0, 10);  // "2026-07-19"

// get an agent row, rolling its counters over if the month changed
export function getAgent(name) {
  const n = String(name || "unlabeled"), p = period();
  let r = db.prepare("SELECT * FROM agents WHERE name=?").get(n);
  if (!r) { db.prepare("INSERT INTO agents(name,period) VALUES(?,?)").run(n, p); return db.prepare("SELECT * FROM agents WHERE name=?").get(n); }
  if (r.period !== p) { db.prepare("UPDATE agents SET spend=0,calls=0,in_tok=0,out_tok=0,period=? WHERE name=?").run(p, n); r = db.prepare("SELECT * FROM agents WHERE name=?").get(n); }
  return r;
}

// record a completed call — atomic increment, and fire an alert if a CUSTOMER threshold was crossed
export function record(name, cost, usage = {}) {
  const a = getAgent(name);
  const before = a.spend, after = before + (Number(cost) || 0);
  db.prepare("UPDATE agents SET spend=spend+?, calls=calls+1, in_tok=in_tok+?, out_tok=out_tok+? WHERE name=?")
    .run(Number(cost) || 0, Number(usage.inTokens) || 0, Number(usage.outTokens) || 0, String(name || "unlabeled"));
  // append to the permanent daily history (one row per agent per day)
  db.prepare("INSERT INTO history(name,day,spend,calls) VALUES(?,?,?,1) ON CONFLICT(name,day) DO UPDATE SET spend=spend+?, calls=calls+1")
    .run(a.name, today(), Number(cost) || 0, Number(cost) || 0);
  try {
    if (a.budget > 0 && a.mode !== "off") {
      const marks = a.alerts ? JSON.parse(a.alerts) : undefined;   // undefined → sensible default
      const crossed = thresholdsCrossed(before, after, a.budget, marks);
      if (crossed.length) fireAlert(a.name, after, a.budget, crossed);
    }
  } catch {}
}

// POST a notification to the customer's webhook when spend crosses one of THEIR thresholds.
function fireAlert(name, spend, budget, crossed) {
  const url = meta("webhook");
  if (!url) return;                       // no webhook set → stay quiet (their choice)
  const pct = Math.round((spend / budget) * 100);
  const payload = {
    event: "tokenbrake.budget_alert", agent: name, spend: Math.round(spend * 100) / 100, budget,
    pct, threshold_pct: Math.round(Math.max(...crossed) * 100), at: new Date().toISOString(),
    message: `${name} reached ${pct}% of its $${budget}/mo budget.`
  };
  try { fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }).catch(() => {}); } catch {}
}

// customer sets which % thresholds they care about, e.g. [1.25] = only bother me at 125%
export function setAlerts(name, thresholds) {
  const n = String(name || "unlabeled"); getAgent(n);
  const arr = Array.isArray(thresholds) ? thresholds.map(Number).filter(x => x > 0) : null;
  db.prepare("UPDATE agents SET alerts=? WHERE name=?").run(arr && arr.length ? JSON.stringify(arr) : null, n);
  return db.prepare("SELECT * FROM agents WHERE name=?").get(n);
}
export function setWebhook(url) { meta("webhook", String(url || "")); return meta("webhook"); }
export function getWebhook() { return meta("webhook") || ""; }

export function setBudget(name, budget, mode = "hard") {
  const n = String(name || "unlabeled");
  getAgent(n);
  const m = mode === "soft" ? "soft" : mode === "off" ? "off" : "hard";
  db.prepare("UPDATE agents SET budget=?, mode=? WHERE name=?").run(Number(budget) || 0, m, n);
  return db.prepare("SELECT * FROM agents WHERE name=?").get(n);
}

export function allAgents() {
  const p = period();
  // reset any stale-period rows lazily on read
  for (const r of db.prepare("SELECT name FROM agents WHERE period IS NOT ?").all(p)) getAgent(r.name);
  return db.prepare("SELECT * FROM agents ORDER BY spend DESC").all();
}

// Daily spend totals for the last `days` days (across all agents), gaps filled with $0 so the
// chart is continuous. Returns [{ day, spend, calls }] oldest→newest.
export function historyFor(days = 30, name = null) {
  const n = Math.max(1, Math.min(365, Number(days) || 30));
  const rows = name
    ? db.prepare("SELECT day, spend, calls FROM history WHERE name=?").all(String(name))
    : db.prepare("SELECT day, SUM(spend) AS spend, SUM(calls) AS calls FROM history GROUP BY day").all();
  const byDay = Object.fromEntries(rows.map(r => [r.day, r]));
  const out = [];
  const d = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const day = new Date(d.getTime() - i * 86400000).toISOString().slice(0, 10);
    const r = byDay[day];
    out.push({ day, spend: r ? Math.round(r.spend * 1e6) / 1e6 : 0, calls: r ? r.calls : 0 });
  }
  return out;
}

// Full daily history as raw rows (for CSV export / finance reconciliation), newest day first.
export function exportHistory() {
  return db.prepare("SELECT name, day, spend, calls FROM history ORDER BY day DESC, name ASC").all();
}

export function meta(k, v) {
  if (v === undefined) { const r = db.prepare("SELECT v FROM meta WHERE k=?").get(k); return r ? r.v : null; }
  db.prepare("INSERT INTO meta(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=?").run(k, String(v), String(v));
}
export const DB_PATH = PATH;
