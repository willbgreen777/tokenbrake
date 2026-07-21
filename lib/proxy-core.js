// TokenBrake — proxy core. The security-critical decisions live here, isolated and testable.
//
// SECURITY POSTURE (USMC durability — built so it can't get us hacked or sued):
//   1. SSRF GUARD. We forward ONLY to a fixed allowlist of provider origins. A customer can
//      never make us call an arbitrary host — no open relay, no reaching internal services.
//   2. KEY HYGIENE. The customer's provider API key rides through in the Authorization header
//      and is forwarded verbatim. We NEVER store it, log it, or write it anywhere. Zero-knowledge.
//   3. NO BODY RETENTION. Request and response bodies (which hold the customer's data) are
//      never persisted or logged. The only things we keep are token counts and dollar cost.
//   4. FAIL-OPEN on OUR errors. If TokenBrake itself faults, we let the call through rather
//      than break the customer's production app — and we say so plainly. The cap is best-effort,
//      not a warranty. (Blocking only happens on a KNOWN over-budget, never on our own bug.)

// The ONLY hosts we will ever forward to. Nothing user-supplied, ever.
// xAI (Grok) is OpenAI-compatible; both "xai" and "grok" route to it so customers can use
// whichever word they think in.
export const PROVIDERS = {
  openai:    "https://api.openai.com",
  anthropic: "https://api.anthropic.com",
  xai:       "https://api.x.ai",
  grok:      "https://api.x.ai",
  groq:      "https://api.groq.com/openai",   // Groq's OpenAI-compatible endpoint lives under /openai
  deepseek:  "https://api.deepseek.com",
  mistral:   "https://api.mistral.ai",
  gemini:    "https://generativelanguage.googleapis.com",   // Google Gemini (its own wire format)
  google:    "https://generativelanguage.googleapis.com",
  openrouter: "https://openrouter.ai/api"                    // aggregator; OpenAI-compatible wire format
};

// Providers whose wire format is OpenAI-compatible (same request/response + streaming usage).
const OPENAI_COMPATIBLE = new Set(["openai", "xai", "grok", "groq", "deepseek", "mistral", "openrouter"]);

// Resolve a customer request path to an allowlisted upstream target — or null to refuse.
// e.g. "/openai/v1/chat/completions" -> https://api.openai.com/v1/chat/completions
export function resolveUpstream(pathname) {
  const parts = String(pathname || "").replace(/^\/+/, "").split("/");
  const provider = (parts.shift() || "").toLowerCase();
  const base = PROVIDERS[provider];
  if (!base) return null;                              // not on the allowlist → refuse
  // rebuild the remaining path safely; strip any scheme/host a caller tried to smuggle in
  const rest = "/" + parts.join("/").replace(/^https?:\/*/i, "");
  const target = base + rest;
  // belt & suspenders: the final URL MUST start with the exact allowlisted origin
  if (!target.startsWith(base + "/") && target !== base) return null;
  return { provider, base, target };
}

// For a streaming OpenAI call, ask the provider to include a final usage chunk so we can meter
// EXACTLY (streamed responses omit usage by default). Anthropic streams usage natively.
export function transformRequest(provider, bodyObj, pathname = "") {
  // Gemini is its own shape: the model and the stream flag live in the URL, not the body.
  // e.g. /v1beta/models/gemini-2.5-flash:generateContent  (or :streamGenerateContent for SSE)
  if (provider === "gemini" || provider === "google") {
    const mm = /\/models\/([^:/?]+):(\w+)/.exec(pathname || "");
    return { body: bodyObj, isStream: /:streamGenerateContent/.test(pathname || ""), model: mm ? mm[1] : undefined };
  }
  if (!bodyObj || typeof bodyObj !== "object") return { body: bodyObj, isStream: false, model: undefined };
  const isStream = bodyObj.stream === true;
  if (OPENAI_COMPATIBLE.has(provider) && isStream) {
    bodyObj.stream_options = { ...(bodyObj.stream_options || {}), include_usage: true };
  }
  return { body: bodyObj, isStream, model: bodyObj.model };
}

// Which request headers are safe to forward upstream. We pass Authorization (their key) and
// content-type and anthropic's version header; we DROP hop-by-hop and our own auth header so
// the TokenBrake key is never leaked to the provider.
const DROP = new Set(["host", "content-length", "connection", "x-tokenbrake-key", "x-tokenbrake-budget", "x-tokenbrake-agent"]);
export function forwardHeaders(incoming) {
  const out = {};
  for (const [k, v] of Object.entries(incoming || {})) {
    if (!DROP.has(k.toLowerCase())) out[k] = v;
  }
  return out;
}

// A guard we can call in tests and at runtime: is this call allowed to proceed right now?
// Combines the budget gate with a clean, honest 402 payload for the customer's app to read.
export function capResponse(remaining, budget) {
  return {
    status: 402,
    body: {
      error: {
        type: "tokenbrake_budget_reached",
        message: `TokenBrake stopped this call: your budget of $${Number(budget).toFixed(2)} for this period is used up. Raise the limit or wait for the next period.`,
        code: "budget_reached"
      }
    }
  };
}
