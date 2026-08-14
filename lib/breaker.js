// TokenBrake v2 — the circuit breaker.
//
// A real breaker, with the three states the pattern actually requires:
//
//   closed     traffic flows. We watch and we learn this agent's normal.
//   open       tripped. Traffic is refused for a cooldown. Nothing is spent.
//   half_open  cooldown elapsed. Exactly ONE probe call is allowed through. If the agent has
//              recovered, we close. If it trips again, we re-open with a longer cooldown.
//
// The half-open probe is the part that makes this safe to leave switched on. A false trip
// costs you one cooldown and then heals itself — no human, no restart, no ripping it out at
// 3am. Repeated trips back off exponentially, so a genuinely broken agent gets quieter rather
// than hammering.
//
// FAIL-OPEN IS ABSOLUTE. Every decision path is wrapped: if anything in this file or the
// detector throws, the call is ALLOWED. TokenBrake is a brake, not a kill switch on your
// business. The one and only time we block is a trip we can explain in a sentence.

import { Window, assess, fingerprint } from "./runaway.js";

export const BREAKER_DEFAULTS = {
  mode:          "guard",   // "guard" = block while open · "watch" = never block, only record
  cooldownMs:    60_000,    // first cooldown
  maxCooldownMs: 900_000,   // 15 min ceiling on the backoff
  backoff:       2,         // multiplier per consecutive trip
  decayMs:       1_800_000, // 30 min clean → forget the consecutive-trip count
};

export class Breaker {
  constructor(agent, opts = {}) {
    this.agent = String(agent || "default");
    this.cfg = { ...BREAKER_DEFAULTS, ...opts };
    this.win = new Window(opts);
    this.state = "closed";
    this.openedAt = 0;
    this.cooldownMs = this.cfg.cooldownMs;
    this.trips = 0;            // consecutive, for backoff
    this.lastTripAt = 0;
    this.probeInFlight = false;
    this.incidents = [];       // most recent first, capped
    this.blocked = 0;          // calls refused while open — the "what did it save" counter
    this.blockedCost = 0;      // estimated dollars not spent, at the burn rate when it tripped
  }

  /* ── decide, before a call goes upstream ─────────────────────────────────── */

  // Returns { allow, state, reason, detail, incident? }.
  // `now` is passed in — no clock reads in here, so tests are exact and time can't surprise us.
  allow(now) {
    try {
      if (this.state === "closed") return { allow: true, state: "closed" };

      if (this.state === "open") {
        if (now - this.openedAt >= this.cooldownMs) {
          this.state = "half_open";
          this.probeInFlight = false;
          return this._probe(now);
        }
        // Still open. Count what we're refusing, and estimate what it would have cost.
        const inc = this.incidents[0];
        const burnPerMs = inc && inc.metrics ? inc.metrics.burn / 60_000 : 0;
        this.blocked++;
        this.blockedCost += burnPerMs * (inc && inc.metrics && inc.metrics.calls > 1
          ? inc.metrics.spanMs / inc.metrics.calls   // mean gap between calls when it tripped
          : 0);
        return {
          allow: this.cfg.mode === "watch",
          state: "open",
          reason: inc ? inc.reason : "open",
          detail: inc ? inc.detail : "This agent is in cooldown.",
          retryInMs: Math.max(0, this.cooldownMs - (now - this.openedAt)),
        };
      }

      // half_open
      return this._probe(now);
    } catch {
      return { allow: true, state: this.state, failedOpen: true };
    }
  }

  _probe(now) {
    if (this.probeInFlight) {
      // One probe at a time. Everything else keeps waiting.
      return { allow: this.cfg.mode === "watch", state: "half_open", reason: "probe_in_flight",
               detail: "Testing whether this agent has recovered — one call at a time." };
    }
    this.probeInFlight = true;
    return { allow: true, state: "half_open", probe: true,
             detail: "Cooldown elapsed. Letting one call through to see if this agent recovered." };
  }

  /* ── record, after a call comes back ─────────────────────────────────────── */

  // body: the request body (for fingerprinting) · cost/ok: the outcome.
  // Returns an incident if this observation tripped the breaker, else null.
  record(now, { body = null, cost = 0, ok = true } = {}) {
    try {
      // While OPEN we are not assessing anything — we are waiting out a cooldown. Nothing
      // observed during that window may enter the record. This matters more than it looks:
      // in watch mode traffic keeps flowing, and a client can always ignore a 429 and keep
      // calling. If those calls landed in the window they would still be sitting there when
      // the cooldown expired, the half-open probe would be judged against them, and the
      // breaker could never close again. It would look like a hang. It is a deadlock.
      if (this.state === "open") return null;

      const fp = fingerprint(body);
      this.win.add({ at: now, exact: fp.exact, tail: fp.tail, cost, ok });

      // A probe that came back is the moment of truth for half-open.
      if (this.state === "half_open" && this.probeInFlight) {
        this.probeInFlight = false;
        const v = assess(this.win, now);
        if (v.trip) { this._open(now, v); return this.incidents[0]; }
        this._close(now);
        return null;
      }

      const v = assess(this.win, now);
      if (v.trip) { this._open(now, v); return this.incidents[0]; }

      // Healthy: let the agent teach us its normal, and let old trips age out.
      this.win.learn(now);
      if (this.trips && now - this.lastTripAt > this.cfg.decayMs) {
        this.trips = 0;
        this.cooldownMs = this.cfg.cooldownMs;
      }
      return null;
    } catch {
      return null;   // detection failing must never surface as an error to the caller
    }
  }

  /* ── state transitions ───────────────────────────────────────────────────── */

  _open(now, verdict) {
    const wasOpen = this.state === "open" || this.state === "half_open";
    this.state = "open";
    this.openedAt = now;
    this.trips++;
    this.lastTripAt = now;
    // Back off only on repeats — a first trip gets the base cooldown.
    this.cooldownMs = wasOpen || this.trips > 1
      ? Math.min(this.cfg.maxCooldownMs, this.cfg.cooldownMs * Math.pow(this.cfg.backoff, this.trips - 1))
      : this.cfg.cooldownMs;

    const incident = {
      agent: this.agent,
      at: now,
      reason: verdict.reason,
      detail: verdict.detail,
      metrics: verdict.metrics,
      baseline: verdict.baseline,
      cooldownMs: this.cooldownMs,
      consecutiveTrips: this.trips,
      mode: this.cfg.mode,
      // Clearly a PROJECTION, not a measurement: what this burn rate would cost if it ran
      // unchecked for the cooldown. Labelled as an estimate everywhere it is shown.
      projectedCostOverCooldown: Number(((verdict.metrics.burn / 60_000) * this.cooldownMs).toFixed(2)),
    };
    this.incidents.unshift(incident);
    if (this.incidents.length > 50) this.incidents.length = 50;

    // Spend the evidence. Once we've acted on this window it must not be re-used: otherwise a
    // half-open probe is judged against the pre-trip history and can never come back clean
    // until the whole window ages out. Clearing means the probe is assessed purely on the
    // agent's NEW behaviour — which is the only thing we actually want to know. The learned
    // baseline and lifetime count survive, because those are about the agent, not the fault.
    this.win.records.length = 0;

    return incident;
  }

  _close(now) {
    this.state = "closed";
    this.probeInFlight = false;
    this.win.learn(now);
  }

  // Manual override — a human deciding they know better. Always available.
  reset(now = 0) {
    this.state = "closed";
    this.probeInFlight = false;
    this.trips = 0;
    this.cooldownMs = this.cfg.cooldownMs;
    this.openedAt = 0;
    if (now) this.win.learn(now);
    return this;
  }

  status(now = 0) {
    return {
      agent: this.agent,
      state: this.state,
      mode: this.cfg.mode,
      trips: this.trips,
      blocked: this.blocked,
      estimatedSaved: Number(this.blockedCost.toFixed(2)),
      retryInMs: this.state === "open" ? Math.max(0, this.cooldownMs - (now - this.openedAt)) : 0,
      lastIncident: this.incidents[0] || null,
      baseline: Math.round(this.win.baseline),
    };
  }
}

/* ── the fleet ─────────────────────────────────────────────────────────────── */

// One breaker per agent, created on demand. Agents are independent on purpose: a stuck
// summariser must never be able to trip the breaker on your checkout flow.
export class Fleet {
  constructor(opts = {}) { this.opts = opts; this.map = new Map(); }
  for(agent) {
    const k = String(agent || "default");
    if (!this.map.has(k)) this.map.set(k, new Breaker(k, this.opts));
    return this.map.get(k);
  }
  allIncidents() {
    return [...this.map.values()].flatMap(b => b.incidents).sort((a, b) => b.at - a.at);
  }
  status(now = 0) { return [...this.map.values()].map(b => b.status(now)); }
}

// The response a blocked call gets. Shaped like a provider error so an existing client's
// error handling reads it without changes, and worded so whoever finds it in a log at 3am
// knows exactly what happened and what to do.
export function breakerResponse(agent, reason, detail, retryInMs) {
  return {
    status: 429,
    headers: { "retry-after": String(Math.ceil((retryInMs || 0) / 1000)) },
    body: {
      error: {
        type: "tokenbrake_runaway_stopped",
        code: "runaway_" + (reason || "stopped"),
        message: `TokenBrake stopped agent "${agent}": ${detail} Calls resume automatically in ${Math.ceil((retryInMs || 0) / 1000)}s, or run: node ~/TokenBrake/reset.mjs ${agent}`,
        agent, reason,
      }
    }
  };
}
