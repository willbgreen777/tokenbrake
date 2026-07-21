// TokenBrake — the per-agent ledger. The new world you named: several AIs living on one
// machine at once (Claude, Jule, Grok, GPT…), each quietly burning tokens in the background.
// This tracks spend PER AGENT so a person can finally see what each one is actually costing —
// something no one can see today. Each metered call is tagged with an agent label; the ledger
// rolls it up into a live breakdown + a total, and can hold a per-agent budget + mode.
const num = x => Number(x) || 0;

export class Ledger {
  constructor() { this.agents = {}; this.total = 0; }

  // ensure an agent row exists (with optional budget + hard/soft mode of its own)
  ensure(agent, cfg = {}) {
    const a = String(agent || "unlabeled");
    if (!this.agents[a]) {
      this.agents[a] = { agent: a, spend: 0, calls: 0, inTokens: 0, outTokens: 0,
                         budget: num(cfg.budget), mode: cfg.mode === "soft" ? "soft" : "hard" };
    } else if (cfg.budget != null || cfg.mode) {
      if (cfg.budget != null) this.agents[a].budget = num(cfg.budget);
      if (cfg.mode) this.agents[a].mode = cfg.mode === "soft" ? "soft" : "hard";
    }
    return this.agents[a];
  }

  // record a completed call's cost + tokens against an agent
  record(agent, cost, usage = {}) {
    const e = this.ensure(agent);
    e.spend += num(cost); e.calls += 1;
    e.inTokens += num(usage.inTokens); e.outTokens += num(usage.outTokens);
    this.total += num(cost);
    return e;
  }

  spendOf(agent) { const e = this.agents[String(agent || "unlabeled")]; return e ? e.spend : 0; }

  // the live breakdown, biggest burner first — this is what the widget shows
  breakdown() {
    return Object.values(this.agents)
      .map(e => ({ ...e, pct: e.budget > 0 ? e.spend / e.budget : 0 }))
      .sort((a, b) => b.spend - a.spend);
  }

  // a one-glance summary for the menu-bar: total, top burner, how many agents live here
  glance() {
    const b = this.breakdown();
    return { total: this.total, agents: b.length, top: b[0] ? { agent: b[0].agent, spend: b[0].spend } : null };
  }
}
