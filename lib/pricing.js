// TokenBrake — model price book. USD per 1,000,000 tokens.
// Fields per row: in (input), out (output), cachedIn (cached-read input), cacheWrite
// (cache-creation, Anthropic). Missing cache fields fall back to the full input rate —
// a deliberate SAFE default: we would rather OVER-count than let a bill slip past the cap.
// Prices drift; this table is the single source of truth to keep current.
export const PRICES = {
  // ---- OpenAI (cached input ≈ 0.5× input) ----
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
  // ---- Anthropic (cache read ≈ 0.1× input, cache write ≈ 1.25× input) ----
  "claude-3-5-haiku":   { in: 0.80,  out: 4.00,  cachedIn: 0.08,  cacheWrite: 1.00 },
  "claude-3-haiku":     { in: 0.25,  out: 1.25,  cachedIn: 0.03,  cacheWrite: 0.30 },
  "claude-3-5-sonnet":  { in: 3.00,  out: 15.00, cachedIn: 0.30,  cacheWrite: 3.75 },
  "claude-3-7-sonnet":  { in: 3.00,  out: 15.00, cachedIn: 0.30,  cacheWrite: 3.75 },
  "claude-sonnet-4":    { in: 3.00,  out: 15.00, cachedIn: 0.30,  cacheWrite: 3.75 },
  "claude-3-opus":      { in: 15.00, out: 75.00, cachedIn: 1.50,  cacheWrite: 18.75 },
  "claude-opus-4":      { in: 15.00, out: 75.00, cachedIn: 1.50,  cacheWrite: 18.75 },
  "claude":             { in: 3.00,  out: 15.00, cachedIn: 0.30,  cacheWrite: 3.75 },   // catch-all (e.g. OpenRouter's dotted names) → sonnet rate
  // ---- xAI / Grok (OpenAI-compatible). Standard real-time, short-context rates. NOTE: xAI
  // doubles rates once a prompt crosses its long-context threshold and for Priority tier —
  // TokenBrake meters the standard rate, so very-large-context calls may under-estimate. ----
  "grok-4.5":           { in: 2.00,  out: 6.00,  cachedIn: 0.30 },
  "grok-4.3":           { in: 1.25,  out: 2.50,  cachedIn: 0.20 },
  "grok-4.20":          { in: 1.25,  out: 2.50,  cachedIn: 0.20 },   // covers grok-4.20-* variants
  "grok-build":         { in: 1.00,  out: 2.00,  cachedIn: 0.20 },
  "grok":               { in: 2.00,  out: 6.00,  cachedIn: 0.30 },   // catch-all → flagship rate
  // ---- Groq (LPU host for open models; OpenAI-compatible). Rates from groq.com/pricing. ----
  "gpt-oss-120b":       { in: 0.15,  out: 0.60,  cachedIn: 0.075 },
  "gpt-oss-20b":        { in: 0.075, out: 0.30,  cachedIn: 0.0375 },
  "llama-3.3-70b":      { in: 0.59,  out: 0.79 },
  "llama-3.1-8b":       { in: 0.05,  out: 0.08 },
  "kimi-k2":            { in: 1.00,  out: 3.00,  cachedIn: 0.50 },
  "qwen3.6-27b":        { in: 0.60,  out: 3.00 },
  // ---- DeepSeek (OpenAI-compatible). chat/reasoner are compat aliases for v4-flash modes. ----
  "deepseek-v4-pro":    { in: 0.435, out: 0.87,  cachedIn: 0.003625 },
  "deepseek-v4-flash":  { in: 0.14,  out: 0.28,  cachedIn: 0.0028 },
  "deepseek-reasoner":  { in: 0.14,  out: 0.28 },
  "deepseek-chat":      { in: 0.14,  out: 0.28 },
  "deepseek":           { in: 0.435, out: 0.87 },                    // catch-all → pro (safe-higher)
  // ---- Mistral (OpenAI-compatible). Large $2/$6 per mistral.ai. ----
  "mistral-large":      { in: 2.00,  out: 6.00 },
  "mistral-small":      { in: 0.10,  out: 0.30 },
  "codestral":          { in: 0.30,  out: 0.90 },
  "mistral":            { in: 2.00,  out: 6.00 },                    // catch-all → large (safe-higher)
  // ---- Google Gemini (NOT OpenAI-shaped — usageMetadata, model-in-URL). Standard-tier,
  // short-context (<=200k) rates from ai.google.dev/gemini-api/docs/pricing. Gemini doubles
  // rates above 200k tokens, so very-large-context calls may under-estimate. ----
  "gemini-3.5-flash":       { in: 1.50, out: 9.00,  cachedIn: 0.15 },
  "gemini-3.1-pro":         { in: 2.00, out: 12.00, cachedIn: 0.20 },
  "gemini-3.1-flash-lite":  { in: 0.25, out: 1.50,  cachedIn: 0.025 },
  "gemini-2.5-pro":         { in: 1.25, out: 10.00, cachedIn: 0.125 },
  "gemini-2.5-flash-lite":  { in: 0.10, out: 0.40,  cachedIn: 0.01 },
  "gemini-2.5-flash":       { in: 0.30, out: 2.50,  cachedIn: 0.03 },
  "gemini":                 { in: 2.00, out: 12.00, cachedIn: 0.20 }  // catch-all → flagship (safe-higher)
};

// Unknown/new model → bill at a mid-high rate so nothing sneaks past the cap unpriced.
export const UNKNOWN = { in: 5.00, out: 15.00 };

// longest-prefix match so "gpt-4o-2024-08-06" resolves to the "gpt-4o" row (not "gpt-4").
export function priceFor(model) {
  const m = String(model || "").toLowerCase();
  let best = null, bestLen = -1;
  for (const key of Object.keys(PRICES)) {
    if (m.includes(key) && key.length > bestLen) { best = PRICES[key]; bestLen = key.length; }
  }
  return best || UNKNOWN;
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
