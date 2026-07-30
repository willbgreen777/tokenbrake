# TokenBrake

**See — and stop — what the AI on your machine is really costing you.**

> **Free and open source.** No license, no account, no trial — the full safety brake, unlimited agents, forever. A free tool from [Akkad Empires](https://northjule.com).

A new problem: people now run several AIs at once (cloud ones like GPT/Grok/Claude, and local
ones like Ollama models) burning money and power in the background, and nobody can see it.
TokenBrake shows both hidden costs in one tiny menu-bar widget, and can hard-stop a runaway API
bill before it happens.

- **Cloud AIs** cost real **API dollars.** TokenBrake meters them and can cap them.
- **Local AIs** cost **electricity + RAM.** TokenBrake reads your machine and estimates it.

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
