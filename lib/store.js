// TokenBrake — local ledger persistence. A single JSON file at ~/.tokenbrake/ledger.json,
// holding per-agent API spend for the current period. The proxy writes it; the menu-bar
// widget reads it. It rolls over automatically each month. No cloud, no account — your
// numbers live on your machine, which is the whole point.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const DIR = join(homedir(), ".tokenbrake");
const FILE = join(DIR, "ledger.json");
const period = () => new Date().toISOString().slice(0, 7);   // "2026-07"

function blank() { return { period: period(), agents: {}, updated: new Date().toISOString() }; }

export function loadStore() {
  try {
    if (!existsSync(FILE)) return blank();
    const s = JSON.parse(readFileSync(FILE, "utf8"));
    if (!s || s.period !== period()) return blank();          // new month → fresh slate
    if (!s.agents) s.agents = {};
    return s;
  } catch { return blank(); }
}

export function saveStore(s) {
  try {
    if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
    s.updated = new Date().toISOString();
    writeFileSync(FILE, JSON.stringify(s));
    return true;
  } catch { return false; }
}

// record a metered call against an agent, return the updated agent row (for cap checks)
export function recordSpend(agent, cost, usage = {}) {
  const s = loadStore();
  const a = String(agent || "unlabeled");
  const e = s.agents[a] || (s.agents[a] = { agent: a, kind: "cloud", spend: 0, calls: 0, inTokens: 0, outTokens: 0, budget: 0, mode: "hard" });
  e.spend += Number(cost) || 0;
  e.calls += 1;
  e.inTokens += Number(usage.inTokens) || 0;
  e.outTokens += Number(usage.outTokens) || 0;
  saveStore(s);
  return e;
}

// set a per-agent budget + mode (from the widget or a config)
export function setAgentBudget(agent, budget, mode = "hard") {
  const s = loadStore();
  const a = String(agent || "unlabeled");
  const e = s.agents[a] || (s.agents[a] = { agent: a, kind: "cloud", spend: 0, calls: 0, inTokens: 0, outTokens: 0, budget: 0, mode: "hard" });
  e.budget = Number(budget) || 0;
  e.mode = mode === "soft" ? "soft" : "hard";
  saveStore(s);
  return e;
}

export function cloudAgents() { return Object.values(loadStore().agents); }
export const LEDGER_PATH = FILE;
