// TokenBrake — model price book. USD per 1,000,000 tokens.
//
// Fields per row: in (input), out (output), cachedIn (cached-read input), cacheWrite
// (cache-creation, Anthropic). Missing cache fields fall back to the full input rate —
// a deliberate SAFE default: we would rather OVER-count than let a bill slip past the cap.
//
// ─────────────────────────────────────────────────────────────────────────────
// HOW THIS GOES WRONG, AND WHY THE DATE BELOW MATTERS
//
// This table went stale once already, and the tests did not catch it — they asserted the stale
// numbers, so the suite cheerfully certified prices that were years out of date. At the point it
// was caught, EVERY Anthropic row was a retired model, the entire GPT-5.6 family was missing
// (falling through to the unknown-model rate and under-counting output by 2x), four models that
// no longer exist were still listed, and Mistral Large was billing 4x its real price.
//
// A metering tool with a stale price book is worse than no metering tool, because it is
// confidently wrong. So:
//   1. VERIFIED_ON below is the date a human last checked these against the providers' own
//      published pricing pages. test.mjs FAILS when it goes stale. Do not silence that test;
//      re-check the prices and move the date.
//   2. Catch-all rows exist per provider so a NEW model name never falls through to the
//      generic unknown rate. Each catch-all is set to that provider's flagship rate.
//   3. UNKNOWN is set high on purpose. See the note on it below.
// ─────────────────────────────────────────────────────────────────────────────

// Last checked against the providers' official pricing pages. YYYY-MM-DD.
export const VERIFIED_ON = "2026-08-15";
// How long before test.mjs starts failing on staleness.
export const STALE_AFTER_DAYS = 90;

export const PRICES = {
  // ─── OpenAI ─────────────────────────────────────────────────────────────
  // Current family. Standard tier, context under 270K. NOTE: OpenAI charges a higher
  // long-context tier above 270K tokens which this flat shape cannot express, so very
  // large-context calls UNDER-count. Documented rather than hidden.
  "gpt-5.6-sol":        { in: 5.00,  out: 30.00, cachedIn: 0.50 },
  "gpt-5.6-terra":      { in: 2.00,  out: 12.00, cachedIn: 0.20 },
  "gpt-5.6-luna":       { in: 0.20,  out: 1.20,  cachedIn: 0.02 },
  "gpt-5":              { in: 5.00,  out: 30.00, cachedIn: 0.50 },   // catch-all → flagship
  // Still served, but OpenAI has published shutdown dates for most of these
  // (gpt-4.1*, gpt-4-turbo, gpt-4, gpt-3.5-turbo, o1*, o4-mini: 2026-10-23; o3, o3-mini: 2026-12-11).
  "gpt-4o-mini":        { in: 0.15,  out: 0.60,  cachedIn: 0.075 },
  "gpt-4o":             { in: 2.50,  out: 10.00, cachedIn: 1.25 },
  "gpt-4.1-mini":       { in: 0.40,  out: 1.60,  cachedIn: 0.10 },
  "gpt-4.1-nano":       { in: 0.10,  out: 0.40,  cachedIn: 0.025 },
  "gpt-4.1":            { in: 2.00,  out: 8.00,  cachedIn: 0.50 },
  "gpt-4-turbo":        { in: 10.00, out: 30.00 },
  "gpt-4":              { in: 30.00, out: 60.00 },
  "gpt-3.5-turbo":      { in: 0.50,  out: 1.50 },
  "o4-mini":            { in: 1.10,  out: 4.40,  cachedIn: 0.275 },
  "o3-mini":            { in: 1.10,  out: 4.40,  cachedIn: 0.55 },
  "o3":                 { in: 2.00,  out: 8.00,  cachedIn: 0.50 },
  "o1-mini":            { in: 1.10,  out: 4.40,  cachedIn: 0.55 },
  "o1":                 { in: 15.00, out: 60.00, cachedIn: 7.50 },
  "text-embedding-3-small": { in: 0.02, out: 0.00 },
  "text-embedding-3-large": { in: 0.13, out: 0.00 },

  // ─── Anthropic ──────────────────────────────────────────────────────────
  // Cache read = 0.1x input, cache write (5-minute) = 1.25x input, per Anthropic's own docs.
  "claude-fable-5":     { in: 10.00, out: 50.00, cachedIn: 1.00, cacheWrite: 12.50 },
  "claude-mythos-5":    { in: 10.00, out: 50.00, cachedIn: 1.00, cacheWrite: 12.50 },  // limited availability
  "claude-opus-5":      { in: 5.00,  out: 25.00, cachedIn: 0.50, cacheWrite: 6.25 },
  "claude-opus-4-8":    { in: 5.00,  out: 25.00, cachedIn: 0.50, cacheWrite: 6.25 },
  "claude-opus-4-7":    { in: 5.00,  out: 25.00, cachedIn: 0.50, cacheWrite: 6.25 },
  "claude-opus-4-6":    { in: 5.00,  out: 25.00, cachedIn: 0.50, cacheWrite: 6.25 },
  "claude-opus-4-5":    { in: 5.00,  out: 25.00, cachedIn: 0.50, cacheWrite: 6.25 },
  "claude-sonnet-5":    { in: 2.00,  out: 10.00, cachedIn: 0.20, cacheWrite: 2.50 },
  "claude-sonnet-4-6":  { in: 3.00,  out: 15.00, cachedIn: 0.30, cacheWrite: 3.75 },
  "claude-sonnet-4-5":  { in: 3.00,  out: 15.00, cachedIn: 0.30, cacheWrite: 3.75 },
  "claude-haiku-4-5":   { in: 1.00,  out: 5.00,  cachedIn: 0.10, cacheWrite: 1.25 },
  // Retired on the Anthropic API but still served via Bedrock / Vertex, so still meterable.
  "claude-opus-4-1":    { in: 15.00, out: 75.00, cachedIn: 1.50, cacheWrite: 18.75 },
  "claude-opus-4":      { in: 15.00, out: 75.00, cachedIn: 1.50, cacheWrite: 18.75 },
  "claude-sonnet-4":    { in: 3.00,  out: 15.00, cachedIn: 0.30, cacheWrite: 3.75 },
  "claude-3-7-sonnet":  { in: 3.00,  out: 15.00, cachedIn: 0.30, cacheWrite: 3.75 },
  "claude-3-5-sonnet":  { in: 3.00,  out: 15.00, cachedIn: 0.30, cacheWrite: 3.75 },
  "claude-3-5-haiku":   { in: 0.80,  out: 4.00,  cachedIn: 0.08, cacheWrite: 1.00 },
  "claude-3-haiku":     { in: 0.25,  out: 1.25,  cachedIn: 0.03, cacheWrite: 0.30 },
  "claude-3-opus":      { in: 15.00, out: 75.00, cachedIn: 1.50, cacheWrite: 18.75 },
  // Catch-all for a Claude name we don't recognise (incl. OpenRouter's dotted "claude-4.5-sonnet"
  // style). Set to the Opus tier: the flagship general model, and high enough that an unrecognised
  // new model over-counts rather than under-counts.
  "claude":             { in: 5.00,  out: 25.00, cachedIn: 0.50, cacheWrite: 6.25 },

  // ─── xAI / Grok ─────────────────────────────────────────────────────────
  // Standard real-time, short-context rates. xAI doubles rates past its long-context threshold
  // and for the Priority tier; we meter the standard rate, so those calls under-estimate.
  "grok-4.6":           { in: 2.00,  out: 6.00,  cachedIn: 0.50 },
  "grok-4.5":           { in: 2.00,  out: 6.00,  cachedIn: 0.30 },
  "grok":               { in: 2.00,  out: 6.00,  cachedIn: 0.30 },   // catch-all → flagship

  // ─── Groq (LPU host for open models) ────────────────────────────────────
  "gpt-oss-120b":       { in: 0.15,  out: 0.60,  cachedIn: 0.075 },
  "gpt-oss-20b":        { in: 0.075, out: 0.30,  cachedIn: 0.0375 },
  "qwen3.6-27b":        { in: 0.60,  out: 3.00 },
  // Groq has announced the shutdown of these two for free and developer tiers (2026-08-16);
  // enterprise committed-spend accounts continue. Prices are correct while they last.
  "llama-3.3-70b":      { in: 0.59,  out: 0.79 },
  "llama-3.1-8b":       { in: 0.05,  out: 0.08 },

  // ─── DeepSeek ───────────────────────────────────────────────────────────
  // HEADS UP: DeepSeek is moving to peak / off-peak billing (announced for mid-August 2026),
  // where off-peak is roughly half these rates and peak is higher. A flat table cannot express
  // that, so DeepSeek figures should be treated as approximate until this is revisited.
  "deepseek-v4-pro":    { in: 0.435, out: 0.87,  cachedIn: 0.003625 },
  "deepseek-v4-flash":  { in: 0.14,  out: 0.28,  cachedIn: 0.0028 },
  "deepseek-reasoner":  { in: 0.14,  out: 0.28 },                    // OpenAI-compat alias
  "deepseek-chat":      { in: 0.14,  out: 0.28 },                    // OpenAI-compat alias
  "deepseek":           { in: 0.435, out: 0.87 },                    // catch-all → pro (safe-higher)

  // ─── Mistral ────────────────────────────────────────────────────────────
  "mistral-medium":     { in: 1.50,  out: 7.50 },
  "mistral-large":      { in: 0.50,  out: 1.50 },
  "mistral-small":      { in: 0.15,  out: 0.60 },
  "codestral":          { in: 0.30,  out: 0.90 },
  "mistral":            { in: 1.50,  out: 7.50 },                    // catch-all → medium (highest)

  // ─── Google Gemini ──────────────────────────────────────────────────────
  // NOT OpenAI-shaped (usageMetadata, model in the URL). Standard tier, context <= 200k.
  // Gemini doubles above 200k, so very-large-context calls under-estimate.
  // gemini-3.7 / 3.6 flash carry promotional pricing through 2026-12-31, after which they
  // double to 1.50 / 7.50 / 0.15 — revisit on that date.
  "gemini-3.7-flash":       { in: 0.75, out: 3.75,  cachedIn: 0.075 },
  "gemini-3.6-flash":       { in: 0.75, out: 3.75,  cachedIn: 0.075 },
  "gemini-3.5-flash-lite":  { in: 0.30, out: 2.50,  cachedIn: 0.03 },
  "gemini-3.5-flash":       { in: 1.50, out: 9.00,  cachedIn: 0.15 },
  "gemini-3.1-flash-lite":  { in: 0.25, out: 1.50,  cachedIn: 0.025 },
  "gemini-3.1-pro":         { in: 2.00, out: 12.00, cachedIn: 0.20 },  // billable id is -preview
  "gemini-2.5-flash-lite":  { in: 0.10, out: 0.40,  cachedIn: 0.01 },
  "gemini-2.5-flash":       { in: 0.30, out: 2.50,  cachedIn: 0.03 },
  "gemini-2.5-pro":         { in: 1.25, out: 10.00, cachedIn: 0.125 },
  "gemini":                 { in: 2.00, out: 12.00, cachedIn: 0.20 },  // catch-all → flagship
};

// Unknown model, unknown provider → bill high.
//
// This is set at the most expensive generally-available rate we know of rather than something
// "reasonable", and that is deliberate. The whole point of a cap is that it fires BEFORE the
// money is gone; a low guess on an unrecognised model is exactly how a bill slips past one. An
// over-estimate is visible and annoying, an under-estimate is invisible and expensive.
//
// In practice this should almost never fire: every provider above has a catch-all row, so a new
// model from a KNOWN provider gets that provider's flagship rate instead of this.
export const UNKNOWN = { in: 10.00, out: 50.00 };

// Days since VERIFIED_ON. Used by the staleness test, and worth surfacing anywhere the numbers
// are presented as authoritative.
export function priceBookAgeDays(now = Date.now()) {
  return Math.floor((now - Date.parse(VERIFIED_ON + "T00:00:00Z")) / 86400000);
}
export function priceBookIsStale(now = Date.now()) {
  return priceBookAgeDays(now) > STALE_AFTER_DAYS;
}

// longest-prefix match so "gpt-4o-2024-08-06" resolves to the "gpt-4o" row (not "gpt-4"),
// and "claude-opus-4-5-20251101" resolves to "claude-opus-4-5" (not "claude-opus-4").
export function priceFor(model) {
  const m = String(model || "").toLowerCase();
  let best = null, bestLen = -1;
  for (const key of Object.keys(PRICES)) {
    if (m.includes(key) && key.length > bestLen) { best = PRICES[key]; bestLen = key.length; }
  }
  return best || UNKNOWN;
}

// Was this model actually recognised, or did it fall through to UNKNOWN? Callers can use this
// to say "estimated" rather than quoting a figure as if it were certain.
export function isKnownModel(model) {
  return priceFor(model) !== UNKNOWN;
}

// Simple cost (no caching) — kept for quick calls and tests.
export function costOf(model, inTokens = 0, outTokens = 0) {
  const p = priceFor(model);
  return (Number(inTokens) * p.in + Number(outTokens) * p.out) / 1e6;
}

// Full cost with caching. usage = { inTokens, outTokens, cachedInTokens, cacheWriteTokens }.
// SAFE RULE: cachedIn falls back to full input rate, cacheWrite to full input rate, if the
// model row doesn't specify them — we never accidentally under-charge cached traffic.
export function costDetailed(model, usage = {}) {
  const p = priceFor(model);
  const inT     = Number(usage.inTokens) || 0;
  const outT    = Number(usage.outTokens) || 0;
  const cachedT = Number(usage.cachedInTokens) || 0;
  const writeT  = Number(usage.cacheWriteTokens) || 0;
  // cached-read and cache-write are a SUBSET of / separate from plain input depending on
  // provider; we bill them on their own lines and count only the non-cached input as "in".
  const plainIn = Math.max(0, inT - cachedT);
  const cachedRate = p.cachedIn != null ? p.cachedIn : p.in;   // safe fallback: full input rate
  const writeRate  = p.cacheWrite != null ? p.cacheWrite : p.in;
  return (plainIn * p.in + cachedT * cachedRate + writeT * writeRate + outT * p.out) / 1e6;
}
