# TokenBrake

**See — and stop — what the AI on your machine is really costing you.**

> **Free for you. Source-available.** No account, no trial, no phone-home — the full safety
> brake, unlimited agents. Free for individuals and for companies under 100 people and under
> $1M revenue. Larger companies need a [commercial licence](https://tokenbrake.com/pricing) —
> one payment, one company, no renewal. See [LICENSE](LICENSE) and [LICENSE-HISTORY.md](LICENSE-HISTORY.md).

A new problem: people now run several AIs at once (cloud ones like GPT/Grok/Claude, and local
ones like Ollama models) burning money and power in the background, and nobody can see it.
TokenBrake shows both hidden costs in one tiny menu-bar widget, and can hard-stop a runaway API
bill before it happens.

- **Cloud AIs** cost real **API dollars.** TokenBrake meters them and can cap them.
- **Local AIs** cost **electricity + RAM.** TokenBrake reads your machine and estimates it.

---

## New in v2 — the runaway breaker

**A budget cap is a lagging indicator.** It does nothing until the money is already gone. If an
agent gets stuck in a loop at 2am, the cap sits there while the loop eats the entire month's
ceiling, and fires only once it's spent. That's not the failure people are afraid of.

v2 watches the **shape** of the traffic instead, and stops a runaway in seconds:

| | budget cap alone | runaway breaker |
|---|---|---|
| One stuck agent, 02:00–08:00 | **$280.01** | **$3.60** |
| Calls it let through | 23,334 | 300 |
| Time to act | 5.8 hours | **10 seconds** |

Run it yourself — no keys, no network, no money: **`node demo-runaway.mjs`**

### What it catches

- **loop** — the same request over and over at a high rate. Catches the growing-context case
  too: the conversation keeps getting longer but the question never changes.
- **burn** — dollars per minute over a hard ceiling, whatever the pattern.
- **error_storm** — most calls failing while retrying without backing off.
- **surge** — far above what *this* agent normally does, against a baseline it learned itself.

### What it deliberately does not catch

A fast batch job with 200 different prompts. High throughput isn't a runaway — **repetition** is.
That asymmetry is the whole design: a false trip costs more trust than a missed loop costs money,
and the budget cap still backstops the slow case.

### It's a real circuit breaker

`closed → open → half_open → closed`. After the cooldown it lets **one** call through to see if
the agent recovered. Recovered, it closes itself. Still stuck, it re-opens and backs off
exponentially. A false trip costs you one cooldown and then heals — no human, no restart, no
ripping it out at 3am.

```bash
node reset.mjs --status      # what's tripped, why, and what it estimates it stopped
node reset.mjs my-agent      # manual override — always available
TB_BREAKER=watch node proxy.mjs   # detect and record, never block
TB_BREAKER=off   node proxy.mjs   # disable entirely
```

**Fail-open is absolute.** Every path is wrapped. If detection throws, the call goes through.
TokenBrake is a brake, not a kill switch on your business — the only time it blocks is a trip it
can explain to you in a sentence.

Everything runs on YOUR machine. No account, no cloud, no data leaves except the API calls
themselves going to their real provider.

---

## 1. Install the menu-bar widget (2 minutes)

1. Install **SwiftBar** (a free, tiny menu-bar host — not made by us):
   `brew install swiftbar`  — or download from https://swiftbar.app
2. Open SwiftBar. It asks for a **plugin folder** → choose `~/TokenBrake/swiftbar`.
3. Done. A `🔥 $…` shows up in your menu bar. Click it to see every AI on this Mac and what
   each one costs. The **local models show up automatically** — no setup.

*(Set your electricity rate if you like: `export TB_CENTS_PER_KWH=15` — default is 15¢/kWh.)*

## 2. (Optional) Meter your cloud AIs and set a hard cap

The local models are read automatically. To also see — and cap — your **cloud** API spend,
route those calls through the local proxy:

1. Start the proxy:  `node ~/TokenBrake/proxy.mjs`   *(keep it running; it listens on localhost)*
2. In whatever app/agent makes the API calls, change the **base URL**:
   - OpenAI → `http://localhost:8787/openai`   (SDK base_url, one line)
   - Anthropic → `http://localhost:8787/anthropic`
   - Optionally add a header `x-tokenbrake-agent: my-gpt-bot` to name each AI separately.
   - Your real API key stays exactly where it was — it passes straight through, never stored.
3. Set a monthly budget + mode:
   - `node ~/TokenBrake/set-budget.mjs openai 20 hard`  → **hard** = stop at $20 (circuit breaker)
   - `node ~/TokenBrake/set-budget.mjs openai 20 soft`  → **soft** = warn but keep running (you chose to)

That's it. Spend shows live in the widget; in hard mode, a call over budget gets stopped with a
clear message instead of a surprise invoice.

---

## How it's built (and why it's safe)

- **Engine** (`lib/`): prices every major OpenAI + Anthropic model (incl. prompt-caching),
  meters streaming and non-streaming calls, and makes the cap decision. 34 tests, all passing
  (`node test.mjs`).
- **Security** (`SECURITY.md`): the proxy only ever forwards to an allowlist of provider hosts
  (no open relay), never stores your API key or your prompts, and fails *open* so it can't take
  down your app. When unsure about price, it **over**-counts — never under — so a bill can't slip
  past the cap.
- **Honest limits:** it's a safety brake, not a warranty. Local watt figures are transparent
  estimates. Cloud AIs are only counted once you route them through the proxy.

## Files
```
lib/pricing.js   model price book (+ caching)
lib/meter.js     usage → cost, and the hard/soft cap decision
lib/proxy-core.js  SSRF guard, key hygiene, request transform
lib/stream.js    pull usage out of streamed responses
lib/local.js     find local models, estimate watts/RAM
lib/store.js     local per-agent ledger (~/.tokenbrake/ledger.json)
proxy.mjs        the local metering proxy
report.mjs       the menu-bar widget output
set-budget.mjs   set a per-agent budget + mode
swiftbar/        the SwiftBar plugin
test.mjs         the test suite
```

## Free & open source

TokenBrake is free, MIT-licensed, and made by **Akkad Empires**. There's nothing to buy and no license key — every feature is unlocked. If it saves you from one surprise invoice, that's the whole point.

More free things we make:
- **[Northjule](https://northjule.com)** — free tools plus ready-to-run AI-employee and IT toolkits.
- **[Wrenchyard](https://wrenchyard.com)** — a live foundry where autonomous AI agents build in the open.

Contributions and issues welcome on [GitHub](https://github.com/willbgreen777/tokenbrake).
