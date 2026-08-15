# The launch posts — ready to paste

*You paste. You press enter. That's the whole job. Nothing here is about you.*

---

## READ THIS FIRST — where to go, and in what order

**Start with Reddit, not Hacker News.** I want to be straight with you about why.

Hacker News has far more reach, but it's blunt to the point of cruel and a rough reception
there would land hard. Reddit's technical forums are kinder, still full of exactly the right
people, and give us a real signal about whether the pitch lands before we take the bigger swing.

**Order:**

1. **r/LocalLLaMA** — people running AI on their own machines. Your exact audience.
2. **r/selfhosted** — people who run their own tools. Second best fit.
3. **Hacker News** — only after we've seen how 1 and 2 go, and only if you want to.

Post to **one** on day one. Not all three. Multiple simultaneous launches read as spam and get
you banned from all of them.

**One practical thing:** some subreddits require your account to be a certain age or have some
karma. If it rejects the post, that's not you being rejected — it's a spam filter. Tell me and
we go somewhere else.

---

## POST 1 — r/LocalLLaMA

**Title:**

```
I built a circuit breaker that catches a looping AI agent in ~10 seconds instead of at the budget cap
```

**Body:**

```
I kept reading about people waking up to a huge API bill because an agent got stuck in a loop
overnight. Budget caps don't help much with that — a cap is a lagging indicator, it can't act
until the money is already spent. If your ceiling is $400, a stuck loop will happily spend $400
and then stop.

So I built something that watches the shape of the traffic instead.

The main signal is repetition, not volume. A stuck agent sends the same request over and over;
a legitimate batch job sends a lot of *different* requests. That asymmetry is the whole design —
it means a fast batch job with 200 varied prompts passes straight through, which matters more to
me than catching every possible runaway. A false positive that blocks real work costs more trust
than a missed loop costs money.

It also fingerprints the last message rather than the whole request, which catches the version
that actually bit people I've read about: the conversation keeps growing so every request looks
different, but the agent is asking the same question forever.

Simulated one stuck agent from 02:00 to 08:00, nobody awake:

  budget cap alone:  $280.01  (23,334 calls, acted after 5.8 hours)
  runaway breaker:     $3.60  (300 calls, tripped in 10 seconds)

You can run that yourself with `node demo-runaway.mjs` — no API keys, no network, no money, it
runs against the real detection code.

It's a proper circuit breaker, not a kill switch: closed → open → half-open. After the cooldown
it lets exactly one call through to see if the agent recovered. Recovered, it closes itself.
Still stuck, it re-opens and backs off exponentially. A false trip costs you one cooldown and
then heals — that's the part that makes it safe to leave switched on.

Fail-open is absolute. Every path is wrapped; if detection itself throws, your call goes through.

Other bits: local proxy, runs entirely on your machine, never stores your API keys or prompts
(only hashes for the loop detection). Meters 8 providers. Also shows local model costs in
electricity and RAM, which is the number nobody measures.

https://github.com/willbgreen777/tokenbrake

Honest disclosure so it's not a surprise: it's source-available rather than open source —
PolyForm Small Business. Free for individuals and companies under 100 people / $1M revenue,
which is basically everyone here. Larger companies pay once. I've written up why in
LICENSE-HISTORY.md in the repo rather than burying it.

Happy to hear where the detection would fall over. The false-positive side is the part I care
most about getting right.
```

---

## POST 2 — r/selfhosted

Same link, different emphasis: these people care that it runs on their own hardware.

**Title:**

```
TokenBrake — self-hosted proxy that meters your AI API spend and stops a runaway agent in seconds
```

**Body:**

```
Runs entirely on your own machine. No account, no cloud, no phone-home, no telemetry. Your API
keys pass through to the real provider and are never stored, and prompts are never retained —
only hashes, and only for loop detection.

What it does:

- Meters every call across 8 providers (OpenAI, Anthropic, Gemini, Grok, Groq, DeepSeek,
  Mistral, OpenRouter), streaming and prompt caching handled properly
- Hard budget caps, per agent
- Estimates what your *local* models cost in electricity and RAM — the number nobody measures
- And the new part: catches a runaway agent from the shape of its traffic rather than waiting
  for a budget cap to notice

That last one is the reason I built it. A budget cap is a lagging indicator — it can't act until
the money is gone. Simulated one agent stuck in a loop overnight: $280 with a cap alone, $3.60
with the breaker, because it tripped in 10 seconds rather than 5.8 hours.

It's deliberately quiet. The main signal is repetition, not volume, so a legitimate high-throughput
job with varied prompts doesn't trip it. And it fails open — if detection throws, your call goes
through. It's a brake, not a kill switch on your production.

One line to install, single file, zero dependencies, Node 24+.

https://github.com/willbgreen777/tokenbrake

Source-available (PolyForm Small Business) — free for individuals and companies under 100
people / $1M revenue, paid above that.
```

---

## POST 3 — Hacker News (only later, only if you want to)

**Title** (HN caps at 80 characters — this is 76):

```
Show HN: TokenBrake – catch a runaway AI agent by its shape, not its budget
```

**First comment** (on HN you post the link, then immediately add this as a comment):

```
Author here. The thing that started this: a budget cap is a lagging indicator. It cannot act
until the money is already gone, so it's structurally the wrong instrument for the failure people
actually fear — an agent stuck in a loop while nobody's awake.

So this watches traffic shape rather than totals. Four signals: repetition, dollars per minute,
error-retry storms, and deviation from the agent's own learned baseline.

The interesting design constraint was the false-positive side. A high-throughput batch job looks
a lot like a runaway if you only measure rate. What separates them is repetition — a loop sends
the same request, a batch job sends different ones. So the primary rule requires BOTH a high rate
and a high repeat ratio, and a batch job with varied prompts passes straight through. I'd rather
miss a slow runaway (the budget cap still backstops that) than block someone's real work.

The fingerprinting has two forms: a hash of the whole normalized request, and a hash of just the
last message plus model. The second one catches the nastier shape, where an agent appends to a
growing conversation while asking the same question forever — every request differs, nothing
progresses.

It's a real circuit breaker rather than a kill switch: closed/open/half-open with exponential
backoff. After the cooldown exactly one probe call goes through; recovered closes it, still-stuck
re-opens with a longer cooldown. That self-healing property is what makes it safe to leave on —
a false trip costs one cooldown, not a 3am page.

Two bugs the tests caught that I'd have shipped otherwise: the detection window survived a trip,
so the half-open probe was judged against pre-trip evidence and could never come back clean; and
traffic arriving during the cooldown poisoned the probe, which was a genuine deadlock that would
have presented as a hang.

Fail-open is absolute — every path wrapped, a throw allows the call.

`node demo-runaway.mjs` reproduces the numbers with no keys and no network.

Licence, since it'll come up: source-available under PolyForm Small Business, free under 100
people / $1M revenue. It was MIT for two weeks and I changed it before anyone had adopted it;
LICENSE-HISTORY.md says so plainly rather than hiding it. The MIT release stays MIT forever.

Most interested in where the detection would fall over.
```

---

## What to do when someone replies

**You don't have to answer anything technical.** Paste the question to me and I'll write the
reply. That's the deal — you press enter, I do the words.

**If someone's rude:** ignore it. Genuinely. Not every comment deserves a response and silence
costs nothing. Nobody is keeping score.

**If someone's harsh but right:** those are the valuable ones. Send them to me. Being told a real
flaw by a stranger is worth more than ten people saying "nice."

**If it sinks without a trace:** that's the normal outcome, not a verdict. Most posts do. We'd try
a different forum and a different angle, and it costs another hour.
