// TokenBrake — the meter. Normalizes token usage from any provider (OpenAI vs Anthropic
// report caching differently), turns it into a dollar cost, and makes the hard-cap call.
import { costDetailed, costOf } from "./pricing.js";
const num = x => Number(x) || 0;

// Normalize a provider response's usage into one shape:
//   { inTokens (incl. cached-read), outTokens, cachedInTokens, cacheWriteTokens }
// OpenAI: prompt_tokens INCLUDES cached (subset).  Anthropic: input_tokens EXCLUDES cache;
// cache_read / cache_creation are separate lines. We fold both into the same convention.
export function usageFrom(body) {
  // Gemini shape — usageMetadata, not usage. promptTokenCount INCLUDES cached (subset, like
  // OpenAI); thinking tokens bill as output, so we add thoughtsTokenCount to output.
  const gm = body && body.usageMetadata;
  if (gm && (gm.promptTokenCount != null || gm.candidatesTokenCount != null)) {
    const cached = num(gm.cachedContentTokenCount);
    return { inTokens: num(gm.promptTokenCount), outTokens: num(gm.candidatesTokenCount) + num(gm.thoughtsTokenCount), cachedInTokens: cached, cacheWriteTokens: 0 };
  }
  const u = (body && body.usage) || {};
  // OpenAI shape
  if (u.prompt_tokens != null || u.completion_tokens != null) {
    const cached = (u.prompt_tokens_details && u.prompt_tokens_details.cached_tokens) || 0;
    return { inTokens: num(u.prompt_tokens), outTokens: num(u.completion_tokens), cachedInTokens: num(cached), cacheWriteTokens: 0 };
  }
  // Anthropic shape
  if (u.input_tokens != null || u.output_tokens != null) {
    const read = num(u.cache_read_input_tokens), write = num(u.cache_creation_input_tokens);
    return { inTokens: num(u.input_tokens) + read, outTokens: num(u.output_tokens), cachedInTokens: read, cacheWriteTokens: write };
  }
  return { inTokens: 0, outTokens: 0, cachedInTokens: 0, cacheWriteTokens: 0 };
}

// What did this call cost? model comes from the request, or the response body as fallback.
export function costFromResponse(model, body) {
  const usage = usageFrom(body);
  const model2 = model || (body && body.model);
  return { cost: costDetailed(model2, usage), ...usage };
}

// The cap decision, made BEFORE a call is forwarded.
//   spent  = dollars burned this period · budget = the ceiling (0 = no cap)
//   opts.mode = "hard" (circuit breaker: STOP at budget) | "soft" (smoke alarm: warn, keep running)
// Soft mode exists because for some, the API spend earns more than it costs — they WANT to run
// over, on purpose. We let them, and just flag it so they always know where they stand.
export function gate(spent, budget, opts = {}) {
  const s = num(spent), b = num(budget);
  // three modes: hard (circuit breaker: STOP), soft (warn but keep running), off (no cap at all)
  const mode = opts.mode === "soft" ? "soft" : opts.mode === "off" ? "off" : "hard";
  if (b <= 0 || mode === "off") return { allow: true, over: b > 0 && s >= b, capped: false, mode, pct: b > 0 ? s / b : 0, remaining: b > 0 ? Math.max(0, b - s) : Infinity };
  const over = s >= b;
  return {
    allow: mode === "hard" ? !over : true,   // only hard blocks; soft & off keep running (their choice)
    over,                                     // true once past budget (drives the alert)
    capped: over && mode === "hard",          // true only when we actually stopped a call
    mode, pct: s / b, remaining: Math.max(0, b - s)
  };
}

// Which alert thresholds did this spend level NEWLY cross? Thresholds are the CUSTOMER's — some
// don't want a peep until 125% (1.25). Pass whatever marks they set; default is 80% and 100%.
export function thresholdsCrossed(prevSpent, newSpent, budget, marks = [0.8, 1.0]) {
  const b = num(budget);
  if (b <= 0 || !Array.isArray(marks) || !marks.length) return [];
  const prev = num(prevSpent) / b, now = num(newSpent) / b;
  return marks.filter(m => prev < m && now >= m);
}

export { costOf };
