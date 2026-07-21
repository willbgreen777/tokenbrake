# TokenBrake — Launch Kit

Storefront is live: **https://site-indol-tau-64.vercel.app** (get `tokenbrake.com` before launch —
~$10, and I'll wire it in 2 minutes; or I can rename the Vercel project to `tokenbrake.vercel.app`).

Everything below is written and ready. Each needs *your* click (your account, your post). Don't
blast all at once — space them out. The angle that makes this spread: **it shows a cost nobody
else shows (local watts) AND stops a real one (runaway cloud bills).** Lead with that.

**One-liner:**
> TokenBrake — a circuit breaker for your AI bill. See every AI on your Mac (cloud dollars AND
> local watts) in one menu-bar glance, and hard-stop a runaway API bill before it happens.

---

## 1. Show HN  ← do this first, Tue–Thu ~8am ET
**Title:** `Show HN: TokenBrake – see (and cap) what every AI on your Mac is costing you`

**Body:**
> I kept running several AIs at once — a cloud model, a local Ollama model, a couple of agents —
> and realized I had no idea what any of them cost me. The cloud ones burn API dollars; the local
> ones burn electricity and RAM 24/7. No tool showed both.
>
> TokenBrake is a tiny menu-bar widget that does. Local models show up automatically (it reads the
> machine and estimates watts/RAM). For cloud spend, you point the app's base URL at a local proxy
> (one line) and it meters every call — and in "hard" mode it *stops* a call once you hit your
> budget, so a runaway loop or a leaked key can't hand you a $2,000 surprise. There's a "soft" mode
> too, for when the spend is a profit center and you want to run over on purpose.
>
> It runs entirely local — your API key and prompts never leave your machine (the proxy forwards
> the key to the real provider and stores nothing). The metering engine has a full test suite, and
> the pricing rule is "when unsure, over-count, never under" so a bill can't slip past the cap.
>
> Free while it's in beta. Would love feedback on the approach — especially the local-watt estimate.

**First comment (post right after):**
> Author here. Technical notes: it's an SSRF-guarded local proxy (allowlist of provider hosts only),
> zero key/prompt storage, fails open so it never takes down your app. Handles streaming by asking
> OpenAI for a usage chunk and parsing Anthropic's. The watt figure is a transparent estimate
> (resident RAM + CPU-scaled draw) — happy to make it more accurate if someone knows a good sudo-less
> power source on Apple Silicon.

## 2. r/LocalLLaMA  ← perfect audience (they run local models and care about compute)
**Title:** `I built a menu-bar tool that shows what your local models actually cost in electricity + RAM (and caps your cloud API spend)`
Body: lead with the *local watt-tracking* angle — that's the fresh part for this crowd — then mention
the cloud cap. They've never seen the "what does keeping qwen3 resident 24/7 actually cost" number.

## 3. r/AI_Agents · r/OpenAI · r/OpenAIDev
**Title:** `A circuit breaker for your API bill — hard-stop a runaway agent before the $2k invoice`
Body: lead with the cap. Agent builders live in fear of a loop running overnight. This is the smoke
alarm + breaker. Mention soft mode for the folks whose agents are profit centers.

## 4. Directories (submit once, evergreen)
There's An AI For That · Futurepedia · AI Agents Directory · Toolify · awesome-ai-agents (GitHub PR).
Blurb: the one-liner above + a screenshot of the widget.

---

## Order & rules
1. **Show HN first** (Tue–Thu morning). Everything rides its wave.
2. Same day: **r/LocalLLaMA** (best-fit crowd).
3. Next days: the other subreddits, one per day.
4. Directories + GitHub PRs anytime.

**Before you post anything:** get `tokenbrake.com` (or let me rename the Vercel project), and change
the landing-page "Get the beta →" button to point at the real install (right now it's a placeholder).

## What's still yours (and one honest caveat)
- **Stripe** — the money pipe. Still the parked talk. Beta is free, so you can launch and gather
  users *now*; wire payment when it leaves beta.
- The **install flow** for a stranger: right now setup is developer-friendly (SwiftBar + a couple
  commands). Fine for an HN/Reddit crowd; before a wider push I'd package it into a one-click installer.
