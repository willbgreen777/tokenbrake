# Turning the money on — your steps

Everything on the code side is done and tested. This is the part that needs your hands, because
it needs your Gumroad login. **Five steps, about ten minutes.** Do them one at a time; there's
nothing here you can break.

---

## Step 1 — Create the product on Gumroad

Go to **gumroad.com** → **Products** → **New product**.

- **Type:** Digital product
- **Name:** `TokenBrake — Commercial Licence`
- **Price:** `249` (one-time, not a subscription)
- **Content / file:** you can leave this empty, or attach a one-page PDF receipt. The licence
  key is what they're buying, and Gumroad generates that itself in Step 2.

Then hit **Save**. Don't publish yet.

---

## Step 2 — Turn on licence keys

Still editing the product, find **Settings** → tick **Generate a unique licence key per sale**.

This is the whole mechanism. Gumroad now issues every buyer a key automatically and emails it
to them. You never touch it.

**Save.**

---

## Step 3 — Copy two values to me

On the product page, find:

1. The **product ID** — in the product's URL or under the licence key settings. It looks like a
   long string of letters and numbers.
2. The **product URL** — looks like `https://[yourhandle].gumroad.com/l/xxxxx`

Paste both to me and I'll put them into Vercel. They are not secrets — the product ID is safe
to publish, which is why this whole flow needs no API key.

---

## Step 4 — Publish

Hit **Publish** on the product.

---

## Step 5 — Test it yourself

Gumroad lets a seller buy their own product as a test. Do that once, take the key it gives you,
and paste it into `tokenbrake.com/get`. You should get a TokenBrake licence key back
immediately.

**If that works, the money path is live and I never have to touch it again.**

---

# The listing copy — paste this in

**Product name:**

```
TokenBrake — Commercial Licence
```

**Short description / tagline:**

```
See and cap what your AI agents are actually costing you. One payment, one company, forever.
```

**Full description:**

```
TokenBrake meters every AI API call your team makes, in real time, per agent — and hard-stops
a runaway bill before it happens.

It runs entirely on your own machines. No account, no cloud, no data leaves your network except
the API calls themselves, going where they always went. Your API keys are never stored, never
seen, never proxied anywhere but through your own process.

WHAT YOU GET
- Metering across 8 providers: OpenAI, Anthropic, xAI/Grok, Groq, DeepSeek, Mistral, Google
  Gemini and OpenRouter — streaming and prompt caching handled correctly
- Hard caps: stop at a budget, warn at a budget, or just watch
- Per-agent breakdown, so you know which one is burning the money
- Live dashboard, 30-day trend, CSV export
- Local model costs too — electricity and RAM, estimated from your actual machine
- A zero-dependency MCP server, so your agents can query their own spend
- Installs in one line. Single file. Node 24+.

WHO NEEDS THIS LICENCE
TokenBrake is free for individuals and for any company under 100 people and under $1M revenue.
This licence is for companies above that.

WHAT IT COVERS
One company. Unlimited machines, unlimited agents, unlimited people. One payment — not a
subscription, no renewal, no per-seat maths.

HOW IT WORKS
Buy here, and Gumroad emails you a licence key. Paste it at tokenbrake.com/get and you'll get
your TokenBrake key instantly. Verification is offline and permanent — TokenBrake never phones
home, and your licence keeps working whether or not we're still here.

Fails open by design: if TokenBrake ever breaks, your API calls still go through. It can't take
your production down.
```

**Tags:** `developer tools`, `ai`, `llm`, `api`, `cost management`, `devops`

---

# What I decided, and why

You asked me to make the call, so here it is with the reasoning.

**What we charge for: companies, not people.**
The free version is already complete — there's nothing meaningful left to hold back without
crippling it, so an artificial "pro tier" would be dishonest. The real difference isn't
features, it's who's using it. A solo dev capping their own $40 Claude bill and a company
running twenty agents burning thousands are different buyers, and only one of them has a
budget. Free-for-individuals is also the only thing that will spread it, and adoption is your
actual bottleneck.

**How much: $249, one time.**
- Under the ~$500 line where a company purchase usually needs procurement sign-off. A team lead
  can expense this without asking anyone.
- Flat per company, not per seat. Per-seat pricing generates "how many seats do I need?" emails,
  and you can't be answering emails.
- **One-time, not a subscription — this is the important one.** Subscriptions mean renewal
  emails, failed cards, cancellation requests, dunning. That is ongoing admin with nobody to
  staff it. One payment, one key, forever means the product runs with zero human attention.
  It's less money per customer in theory. It's more money in practice, because the alternative
  is a system that needs you and therefore stops.

**The licence change: MIT → PolyForm Small Business.**
This is the part I want you to look at before it goes public, so I've left it uncommitted.

You can't honestly sell a commercial licence for MIT code — MIT already grants commercial use,
so you'd be charging for something the buyer already has. To sell anything, the terms have to
change. PolyForm Small Business is a real, standard, published licence: free for individuals
and companies under 100 people / $1M revenue, paid above that. The source stays public.

The honest bit: the MIT release from July 29th stays MIT forever and anyone could fork it. That
risk is real but small — it's two weeks old with no users. Changing terms now, before anyone
has built on them, is the difference between setting terms and pulling a rug. `LICENSE-HISTORY.md`
says all of that out loud rather than hiding it.

**If any of that doesn't sit right with you, say so and I'll change it.** `git checkout LICENSE`
puts it back exactly as it was.
