# TokenBrake — Cold Outreach Kit

Written to sound like you: direct, honest, no hype. Short beats clever — cold emails get skimmed in 3 seconds, so the first line has to earn the second. Send from your normal email, plain text, no images, one link max.

**Fill in the brackets** before sending. `[Name]` = a real first name. `[Company]` = their company. `[what they run]` = the AI thing they actually do (an assistant, a support bot, an agent, a summarizer — check their site/product first).

---

## Who to send to

Companies that run AI **in production on the API** — not people using the ChatGPT app. Signals they're a fit:
- They mention "AI agents," "copilot," "assistant," "powered by GPT/Claude/Gemini" on their site.
- They're a small/mid software company, a dev shop, or an indie SaaS (they feel the bill personally).
- Job posts mentioning OpenAI/Anthropic/LangChain/agents = they're spending real money.

Skip: giant enterprises (long sales cycles) and pure consumers.

---

## Subject lines (pick one, keep it lowercase and boring — it looks personal, not marketed)

- `your AI API bill`
- `quick question about your [OpenAI] spend`
- `before your next API invoice`
- `circuit breaker for your AI bill`
- `capping a runaway AI bill`

---

## Email 1 — operator to operator (main opener)

> **Subject:** your AI API bill
>
> Hi [Name],
>
> Quick one — [Company] runs [what they run], so you've got AI API spend that can spike without warning. One retry loop or a leaked key can turn a $200 month into a five-figure invoice you don't see until it lands.
>
> The native limits don't really stop that: OpenAI's is delayed up to 24 hours and covers your whole account, not one runaway agent.
>
> I built TokenBrake — a small self-hosted proxy that meters every call live, per agent, and hard-stops a runaway at the budget you set. Your API keys and prompts never leave your server.
>
> Worth a 5-minute look? You can size up your own exposure here: **tokenbrake.com/calculator**
>
> — [Your name], Northjule

---

## Email 2 — the calculator hook (shortest, highest curiosity)

> **Subject:** what your agents cost per month
>
> [Name] — I run a tool that caps AI API bills, and the "runaway loop" number for a setup like [Company]'s is bigger than most people expect. Here's a calculator so you can run your own in 30 seconds: **tokenbrake.com/calculator**
>
> If a surprise API bill is a real risk for you, TokenBrake stops it — per agent, in real time, self-hosted so your keys never leave your box. Happy to send the 2-line setup.
>
> — [Your name]

---

## Email 3 — blunt (for technical founders / operators)

> **Subject:** circuit breaker for your AI bill
>
> [Name],
>
> You can't set a real-time hard cap on your OpenAI / Claude / Gemini bill natively — the limits are delayed or account-wide. So one bad loop = a surprise invoice.
>
> TokenBrake fixes exactly that: self-hosted proxy, per-agent budgets, hard stop at your number, keys never stored. $99/yr, one line to install.
>
> Guides + calculator: **tokenbrake.com/guides**
>
> If it's useful, reply "send it" and I'll give you the setup.
>
> — [Your name]

---

## Follow-up 1 — the bump (send 3 days after, reply on the same thread)

> **Subject:** re: your AI API bill
>
> [Name] — bumping this in case it slipped by. 30-second version: the calculator (**tokenbrake.com/calculator**) shows your exposure; TokenBrake caps it. Worth a reply either way?
>
> — [Your name]

---

## Follow-up 2 — the breakup (send 5 days after follow-up 1)

> **Subject:** closing the loop
>
> [Name], I'll stop here so I'm not cluttering your inbox. If a runaway API bill ever becomes a real worry, the door's open — tokenbrake.com. Appreciate your time.
>
> — [Your name]

---

## Rules that make cold email actually work

1. **Personalize line one.** One specific, true detail about them ("saw you launched [their AI feature]") beats any template. 30 seconds of homework doubles reply rates.
2. **One link, one ask.** Every email points to *one* thing (the calculator) and asks for *one* thing (a reply or a look). No PDF attachments on the first touch — they trip spam filters.
3. **Send Tue–Thu, morning their time.** Avoid Mondays and Fridays.
4. **Plain text, real signature.** No logos, no tracking pixels, no "unsubscribe" theater on a 1:1 email. It should read like a human wrote it to them.
5. **Volume + follow-up.** Most replies come on the follow-up. Expect ~20–40 sends to get real conversations early; that's normal, not failure.
6. **When they reply interested,** send the one-pager (`one-pager.html` → save as PDF) or just walk them to **tokenbrake.com/pricing** and the docs. Then you close — that's your job, not the email's.

---

## What to say on the call / reply (your cheat sheet)

- **The problem:** native spend limits are delayed or account-wide; a runaway agent bills you before you can react.
- **What it does:** meters every AI call in real time, per agent, and hard-stops at the budget you set.
- **Trust:** self-hosted, keys and prompts never leave their server, SSRF-guarded, fails open so it can't break their production.
- **Coverage:** OpenAI, Anthropic, Grok, Groq, DeepSeek, Mistral, Gemini, OpenRouter.
- **Price:** $99/yr Solo (up to 3 agents), $490/yr Business (unlimited). Paid in USDC.
- **Install:** one line — `curl -fsSL https://tokenbrake.com/install.sh | sh`.
- **Honest line (use it — it builds trust):** "It's a safety brake, not a warranty. Keep your provider limits on too. This just stops the runaway before it lands."
