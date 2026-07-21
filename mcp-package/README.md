# TokenBrake MCP

**Let an AI agent watch its own spending — and put a hard cap on itself.**

An agent in a retry loop can turn a $10 month into a $2,000 one overnight, and nothing in the loop
knows it's happening. This MCP server gives the model the missing sense: it can read live per-agent
API cost and set a budget that actually stops calls at the limit.

Works with any MCP client — Claude Desktop, Claude Code, Cursor, or your own.

## Tools

| Tool | What it does |
|---|---|
| `tokenbrake_check_meter` | Read this month's spend across every agent/project: dollars, budget, cap mode, call counts. |
| `tokenbrake_set_budget` | Set a monthly budget and cap mode. `hard` stops calls at the limit, `soft` warns and keeps running, `off` removes the cap. |
| `tokenbrake_set_alerts` | Choose when to be warned — thresholds are fractions of budget (`1.0` = 100%, `1.25` = 125%). Optional webhook. |

So you can say things like *"how much have my agents cost me this month?"* or *"cap the scraper at
$20 and hard-stop it there"* and the model does it.

## Requirements

This is a client for [TokenBrake](https://tokenbrake.com) — a self-hosted metering proxy that runs
on **your** machine. You need it running first; this server just talks to its local HTTP API.

Get it at [tokenbrake.com/get](https://tokenbrake.com/get). TokenBrake is a paid tool ($99/yr) with
a 14-day free trial — everything unlocked, no card, no account.

## Install

```bash
npx tokenbrake-mcp
```

Claude Desktop / Claude Code config:

```json
{
  "mcpServers": {
    "tokenbrake": {
      "command": "npx",
      "args": ["-y", "tokenbrake-mcp"],
      "env": {
        "TB_URL": "http://localhost:8788",
        "TB_KEY": "your-tokenbrake-key-if-you-set-one"
      }
    }
  }
}
```

| Variable | Required | Default | Notes |
|---|---|---|---|
| `TB_URL` | no | `http://localhost:8788` | Where your TokenBrake server is listening. |
| `TB_KEY` | no | — | Only if you set `TB_KEY` on the server. Sent as `x-tokenbrake-key`. |

## What it does and doesn't see

TokenBrake meters traffic that you route through it — you point an SDK's `base_url` at it, so it
sees your own apps and agents on OpenAI, Anthropic, Gemini, Grok, Groq, DeepSeek, Mistral and
OpenRouter. It **cannot** see usage from consumer apps like the ChatGPT or Claude desktop clients,
because those bill through the vendor and can't be proxied by anyone.

It never stores your API keys or your prompts — the proxy forwards your key to the real provider
and keeps only token counts and dollars.

It's a safety brake, not a warranty. It dramatically cuts bill shock. It can't promise a bill will
never exceed a budget.

## Privacy

Zero dependencies, zero telemetry. This server makes exactly one kind of outbound request: to the
`TB_URL` you configured. Nothing is sent anywhere else.

## License

MIT
