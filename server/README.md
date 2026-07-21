# TokenBrake Server (self-hosted)

A team API-cost gateway you run on **your own server**. Point your apps' AI calls at it and it
meters every one in real time, shows live spend on a dashboard, and **hard-stops a runaway bill
at the budget you set** — per agent, per project, whatever you name. Your API keys and prompts
never leave your infrastructure. That's the whole pitch: cost control *and* a security win, in one.

## Why self-hosted
- Your provider keys pass straight through to OpenAI/Anthropic and are **never stored** by us.
- Your prompts and responses are **never logged** — only token counts and dollars.
- Nothing to trust us with. It runs in your box, on your terms.

## Run it

**Docker (recommended):**
```
docker build -t tokenbrake .
docker run -d -p 8788:8788 -v tbdata:/data -e TB_KEY=pick-a-long-secret tokenbrake
```

**Or plain Node (needs Node 24+):**
```
TB_KEY=pick-a-long-secret node server/app.mjs
```

`TB_KEY` is your team's shared secret — every request must present it. Set it before you expose
the server to anything.

## Use it (one line per app)
In whatever service makes the API calls, change the base URL and add one header:
- OpenAI → `http://YOUR_SERVER:8788/openai`  (header `x-tokenbrake-key: <your TB_KEY>`)
- Anthropic → `http://YOUR_SERVER:8788/anthropic`
- Name each app/agent separately with `x-tokenbrake-agent: billing-bot` (optional).
- Your real OpenAI/Anthropic key stays in the `Authorization` header exactly as before — it just
  passes through.

## Set budgets & watch it
Open **http://YOUR_SERVER:8788/** — the dashboard. Enter your `TB_KEY`, and you'll see live spend
per agent. Set a budget and a mode:
- **hard** — the circuit breaker. Calls are refused once the budget is hit. No surprise invoice.
- **soft** — warn but keep running, for when the spend earns more than it costs.

Budgets reset at the start of each month automatically.

## What's built vs. next
- **Now:** real-time metering (OpenAI + Anthropic, streaming + non-streaming, prompt-caching priced
  right), hard/soft caps, SQLite persistence, team-key auth, live dashboard. The engine has a full
  test suite (`node ../test.mjs`), and the security posture is documented in `../SECURITY.md`.
- **Next (easy adds):** per-key email alerts at 50/80/100%, more providers (Grok, Gemini, Groq —
  each is one allowlist entry), and per-seat licensing.

TokenBrake is a safety brake, not a warranty — it dramatically reduces bill-shock; it can't
guarantee a bill will never exceed a budget (a call in flight when the cap trips can still complete).
