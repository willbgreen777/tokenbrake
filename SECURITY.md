# TokenBrake — Security & Durability Posture

Built to the standard of the thing it's named after: reliable, disciplined, and honest.
We are a proxy that sits between a customer's app and their AI provider. That is a position
of trust. These are the rules we hold, and the tests that prove we hold them.

## The four load-bearing rules (enforced in `lib/proxy-core.js`, proven in `test.mjs`)

1. **SSRF guard — we forward ONLY to a fixed allowlist of provider origins.**
   A customer can never make TokenBrake call an arbitrary host. `resolveUpstream()` refuses
   anything not in `PROVIDERS`, and neutralizes smuggled URLs so the target host always stays
   the allowlisted provider. This means we can't be turned into an open relay or a way to
   reach internal services. *(tested: refuses unknown hosts, neutralizes `/openai/https://evil.com/x`)*

2. **Key hygiene — the customer's provider API key is never stored, logged, or written down.**
   It rides through in the `Authorization` header, gets forwarded verbatim, and is gone. Our
   own TokenBrake account key is stripped before forwarding, so it never leaks to the provider.
   Zero-knowledge of their secret. *(tested: forwards Authorization, strips `x-tokenbrake-key` and `host`)*

3. **No body retention — request and response bodies are never persisted or logged.**
   Those hold the customer's prompts and data. The only things we ever keep are token counts
   and dollar cost. There is no place in this system where a customer's content is saved.

4. **Fail-open on our own errors — we never break a customer's production app.**
   If TokenBrake itself faults, the call passes through. Blocking happens **only** on a known,
   measured over-budget condition — never because of a bug on our side. The cap is a
   best-effort safety brake, **not a warranty** (see Legal below).

## Billing accuracy (the other way this could hurt someone)

If the meter under-counts, a customer's budget silently blows and they blame us. So the price
book (`lib/pricing.js`) follows one rule: **when uncertain, over-count, never under-count.**
Unknown/new models are billed at a safe-high default; unpriced cache rates fall back to the
full input rate. We would rather stop a call slightly early than let a surprise bill through.
Caching is priced correctly for both OpenAI and Anthropic (they report it differently), and
streaming calls are metered exactly by asking OpenAI for a usage chunk and parsing Anthropic's.

## Legal — what we promise and what we don't

TokenBrake is a **safety tool, not a guarantee.** We reduce the risk of bill-shock; we do not
warrant that a bill can never exceed a budget (a provider outage, a call in flight when the cap
trips, or our own downtime under fail-open can all let a little through). The Terms of Service
must say this plainly, in the customer's interest and ours. We never touch the customer's money
or their provider account — we only observe traffic they route through us and can stop forwarding.

## Still required before it goes live (not yet built)

- The runtime proxy wiring (Edge/Workers) that pipes streams through with low latency.
- An atomic spend counter (so concurrent calls can't race past the cap).
- Per-account API keys, stored **hashed**, with rate-limiting on the ingest path.
- Terms of Service + Privacy Policy reflecting the promises above (have a lawyer review before scale).
- Stripe for billing — the one piece that touches money, set up on the owner's account.

*Last reviewed: at engine v0.1 — 23/23 security + accuracy tests passing.*
