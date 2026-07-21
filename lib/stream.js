// TokenBrake — streaming usage extractor. Streamed (SSE) responses omit usage by default;
// OpenAI puts a final usage chunk (when we ask via include_usage), Anthropic splits it across
// message_start (input + cache) and message_delta (output). We fold both into a normalized
// body-like { usage } that the meter already understands.
const num = x => Number(x) || 0;

export function usageFromStream(sseText) {
  const lines = String(sseText || "").split(/\r?\n/);
  let openaiUsage = null;
  let geminiUsage = null;
  let sawAnthropic = false, aIn = 0, aOut = 0, aRead = 0, aWrite = 0;

  for (const line of lines) {
    const m = line.match(/^data:\s*(.+)$/);
    if (!m) continue;
    const payload = m[1].trim();
    if (payload === "[DONE]") continue;
    let o; try { o = JSON.parse(payload); } catch { continue; }
    if (!o || typeof o !== "object") continue;

    // OpenAI: a chunk carrying a usage object (the final one wins)
    if (o.usage && (o.usage.prompt_tokens != null || o.usage.completion_tokens != null)) {
      openaiUsage = o.usage;
    }
    // Gemini: each SSE chunk carries cumulative usageMetadata — the last one has the full totals
    if (o.usageMetadata && (o.usageMetadata.promptTokenCount != null || o.usageMetadata.candidatesTokenCount != null)) {
      geminiUsage = o.usageMetadata;
    }
    // Anthropic: input + cache land in message_start; output accrues in message_delta
    if (o.type === "message_start" && o.message && o.message.usage) {
      sawAnthropic = true; const u = o.message.usage;
      aIn = num(u.input_tokens); aRead = num(u.cache_read_input_tokens); aWrite = num(u.cache_creation_input_tokens);
    }
    if (o.type === "message_delta" && o.usage) {
      sawAnthropic = true; if (o.usage.output_tokens != null) aOut = num(o.usage.output_tokens);
    }
  }

  if (openaiUsage) return { usage: openaiUsage };
  if (geminiUsage) return { usageMetadata: geminiUsage };
  if (sawAnthropic) return { usage: { input_tokens: aIn, output_tokens: aOut, cache_read_input_tokens: aRead, cache_creation_input_tokens: aWrite } };
  return { usage: {} };   // couldn't find usage — caller decides how to handle (estimate/flag)
}
