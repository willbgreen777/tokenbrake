import { costOf, costDetailed, priceFor, isKnownModel, priceBookIsStale, priceBookAgeDays, VERIFIED_ON, STALE_AFTER_DAYS } from "./lib/pricing.js";
import { usageFrom, costFromResponse, gate, thresholdsCrossed } from "./lib/meter.js";
import { resolveUpstream, transformRequest, forwardHeaders, PROVIDERS } from "./lib/proxy-core.js";
import { usageFromStream } from "./lib/stream.js";
import { Ledger } from "./lib/ledger.js";
let pass=0, fail=0;
const ok=(n,c)=>{ if(c){pass++;console.log("  ✓",n);}else{fail++;console.log("  ✗ FAIL:",n);} };
const near=(a,b)=>Math.abs(a-b)<1e-9;

console.log("PRICING + CACHING:");
ok("gpt-4o 1000in/500out = $0.0075", near(costOf("gpt-4o",1000,500),0.0075));
ok("dated model resolves to gpt-4o", priceFor("gpt-4o-2024-08-06").in===2.50);
ok("OpenAI cached input billed cheaper ($0.035)", near(costDetailed("gpt-4o",{inTokens:10000,outTokens:2000,cachedInTokens:8000}),0.035));
ok("Anthropic cache read+write priced right ($0.0192)", near(costDetailed("claude-3-5-sonnet",{inTokens:5000,outTokens:500,cachedInTokens:4000,cacheWriteTokens:2000}),0.0192));
ok("SAFE: unknown model cached tokens billed at FULL input (never under-count)", near(costDetailed("mystery-model-9",{inTokens:1000,cachedInTokens:1000}),0.010));
ok("SAFE: an unrecognised model is flagged as unrecognised", isKnownModel("mystery-model-9")===false && isKnownModel("gpt-4o")===true);

console.log("PRICING — CURRENT MODEL LINEUP (the rows that went stale once already):");
// These exist because the whole table was years out of date and the suite did not notice:
// every Anthropic row was a retired model, the GPT-5.6 family was missing entirely, and
// Mistral Large was billing 4x. A metering tool that is confidently wrong is worse than none.
ok("gpt-5.6-sol = $5/$30", priceFor("gpt-5.6-sol").in===5.00 && priceFor("gpt-5.6-sol").out===30.00);
ok("gpt-5.6-terra = $2/$12", priceFor("gpt-5.6-terra").in===2.00 && priceFor("gpt-5.6-terra").out===12.00);
ok("gpt-5.6-luna = $0.20/$1.20", priceFor("gpt-5.6-luna").in===0.20 && priceFor("gpt-5.6-luna").out===1.20);
ok("a dated gpt-5.6 id still resolves", priceFor("gpt-5.6-terra-2026-07-01").out===12.00);
ok("an unknown gpt-5 model → flagship catch-all, not UNKNOWN", priceFor("gpt-5.9-unreleased").in===5.00);
ok("claude-opus-5 = $5/$25", priceFor("claude-opus-5").in===5.00 && priceFor("claude-opus-5").out===25.00);
ok("claude-sonnet-5 = $2/$10", priceFor("claude-sonnet-5").in===2.00 && priceFor("claude-sonnet-5").out===10.00);
ok("claude-haiku-4-5 = $1/$5", priceFor("claude-haiku-4-5").in===1.00 && priceFor("claude-haiku-4-5").out===5.00);
ok("claude-fable-5 = $10/$50", priceFor("claude-fable-5").in===10.00 && priceFor("claude-fable-5").out===50.00);
ok("dated Anthropic id resolves to the right row", priceFor("claude-opus-4-5-20251101").out===25.00);
ok("opus-4-5 beats opus-4 (longest-prefix, 5x price difference)", priceFor("claude-opus-4-5-20251101").in===5.00 && priceFor("claude-opus-4").in===15.00);
ok("sonnet-4-6 beats sonnet-4", priceFor("claude-sonnet-4-6-20260101").in===3.00);
ok("Anthropic cache read is 0.1x and cache write 1.25x of input", (()=>{const p=priceFor("claude-opus-5");return near(p.cachedIn,p.in*0.1)&&near(p.cacheWrite,p.in*1.25);})());
ok("gemini-3.7-flash on its own row", priceFor("gemini-3.7-flash").in===0.75 && priceFor("gemini-3.7-flash").out===3.75);
ok("gemini-3.5-flash-lite beats gemini-3.5-flash", priceFor("gemini-3.5-flash-lite").in===0.30 && priceFor("gemini-3.5-flash").in===1.50);
ok("every provider has a catch-all, so a new model never hits UNKNOWN",
   isKnownModel("claude-99")&&isKnownModel("gemini-99")&&isKnownModel("grok-99")&&isKnownModel("deepseek-99")&&isKnownModel("mistral-99")&&isKnownModel("gpt-5-99"));

console.log("PRICING — STALENESS GUARD:");
// This test is the whole reason the table above is current. When it fails, do NOT bump the date:
// open the providers' pricing pages, correct the rows, and then move VERIFIED_ON.
ok(`price book was verified within ${STALE_AFTER_DAYS} days (VERIFIED_ON=${VERIFIED_ON}, age=${priceBookAgeDays()}d)`,
   priceBookIsStale()===false);
ok("staleness check actually trips when the book is old", priceBookIsStale(Date.parse("2099-01-01"))===true);

console.log("PRICING — xAI / GROK:");
ok("grok-4.5 1000in/500out = $0.005", near(costOf("grok-4.5",1000,500),0.005));
ok("grok-4.6 (current flagship) = $2/$6", priceFor("grok-4.6").in===2.00 && priceFor("grok-4.6").out===6.00);
ok("retired grok names fall to the flagship catch-all, never to UNKNOWN", priceFor("grok-4.3").in===2.00 && priceFor("grok-4.20-0309").in===2.00);
ok("grok-4.5 beats generic 'grok' (longest-prefix)", priceFor("grok-4.5").in===2.00);
ok("unknown grok model → flagship catch-all, not UNKNOWN", priceFor("grok-9-future").in===2.00);
ok("grok cached input billed cheaper ($0.0064)", near(costDetailed("grok-4.5",{inTokens:10000,outTokens:0,cachedInTokens:8000}),0.0064));

console.log("PRICING — GROQ / DEEPSEEK / MISTRAL:");
ok("groq llama-3.3-70b-versatile prices via prefix", priceFor("llama-3.3-70b-versatile").in===0.59 && priceFor("llama-3.3-70b-versatile").out===0.79);
ok("groq openai/gpt-oss-120b prices via prefix", priceFor("openai/gpt-oss-120b").in===0.15);
ok("deepseek-chat (compat alias) = flash rate", priceFor("deepseek-chat").in===0.14);
ok("deepseek-v4-pro flagship rate", priceFor("deepseek-v4-pro").out===0.87);
ok("unknown deepseek model → pro catch-all (safe-higher)", priceFor("deepseek-v9-turbo").in===0.435);
ok("mistral-large-latest = $0.50/$1.50", priceFor("mistral-large-latest").in===0.50 && priceFor("mistral-large-latest").out===1.50);
ok("mistral-small-3.1 = $0.15/$0.60", priceFor("mistral-small-3.1").in===0.15 && priceFor("mistral-small-3.1").out===0.60);
ok("codestral prices on its own row", priceFor("codestral-2501").in===0.30);
ok("mistral-medium-3.5 prices on the medium row", priceFor("mistral-medium-3.5").in===1.50 && priceFor("mistral-medium-3.5").out===7.50);
ok("unknown mistral model → medium catch-all (safe-higher)", priceFor("mistral-brand-new").in===1.50);

console.log("GEMINI (non-OpenAI adapter):");
ok("routes to Google endpoint", resolveUpstream("/gemini/v1beta/models/gemini-2.5-flash:generateContent").target==="https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent");
ok("model read from URL path", transformRequest("gemini",{},"/v1beta/models/gemini-2.5-pro:generateContent").model==="gemini-2.5-pro");
ok("stream flag read from URL (streamGenerateContent)", transformRequest("gemini",{},"/v1beta/models/gemini-2.5-flash:streamGenerateContent").isStream===true && transformRequest("gemini",{},"/v1beta/models/gemini-2.5-flash:generateContent").isStream===false);
ok("usageMetadata → normalized (thinking counts as output)", JSON.stringify(usageFrom({usageMetadata:{promptTokenCount:1000,candidatesTokenCount:500,cachedContentTokenCount:200,thoughtsTokenCount:100}}))===JSON.stringify({inTokens:1000,outTokens:600,cachedInTokens:200,cacheWriteTokens:0}));
ok("gemini-2.5-flash = $0.30/$2.50", priceFor("gemini-2.5-flash").in===0.30 && priceFor("gemini-2.5-flash").out===2.50);
ok("flash-lite beats flash (longest-prefix)", priceFor("gemini-2.5-flash-lite").in===0.10);
ok("dated flash variant still prices as flash", priceFor("gemini-2.5-flash-preview-09-2025").in===0.30);
ok("gemini-2.5-pro = $1.25/$10", near(costOf("gemini-2.5-pro",1000,1000),0.01125));
ok("unknown gemini model → flagship catch-all (safe-higher)", priceFor("gemini-9-ultra").in===2.00);
const gemStream='data: {"candidates":[{}],"usageMetadata":{"promptTokenCount":100}}\n\ndata: {"candidates":[{}],"usageMetadata":{"promptTokenCount":100,"candidatesTokenCount":50,"thoughtsTokenCount":10}}\n\n';
ok("extracts usage from Gemini SSE stream", JSON.stringify(usageFrom(usageFromStream(gemStream)))===JSON.stringify({inTokens:100,outTokens:60,cachedInTokens:0,cacheWriteTokens:0}));

console.log("USAGE PARSING (both providers):");
ok("OpenAI usage incl. cached subset", JSON.stringify(usageFrom({usage:{prompt_tokens:1000,completion_tokens:500,prompt_tokens_details:{cached_tokens:800}}}))===JSON.stringify({inTokens:1000,outTokens:500,cachedInTokens:800,cacheWriteTokens:0}));
ok("Anthropic usage folds cache lines", JSON.stringify(usageFrom({usage:{input_tokens:1000,output_tokens:500,cache_read_input_tokens:400,cache_creation_input_tokens:200}}))===JSON.stringify({inTokens:1400,outTokens:500,cachedInTokens:400,cacheWriteTokens:200}));

console.log("HARD CAP:");
ok("under budget → allowed", gate(9.5,10).allow===true);
ok("at/over budget → BLOCKED", gate(10,10).allow===false && gate(15,10).allow===false);
ok("no budget → no cap", gate(500,0).allow===true);

console.log("SECURITY — SSRF GUARD:");
ok("allows OpenAI", resolveUpstream("/openai/v1/chat/completions").target==="https://api.openai.com/v1/chat/completions");
ok("allows Anthropic", resolveUpstream("/anthropic/v1/messages").target==="https://api.anthropic.com/v1/messages");
ok("allows xAI/Grok", resolveUpstream("/xai/v1/chat/completions").target==="https://api.x.ai/v1/chat/completions" && resolveUpstream("/grok/v1/chat/completions").target==="https://api.x.ai/v1/chat/completions");
ok("allows Groq (under /openai path)", resolveUpstream("/groq/v1/chat/completions").target==="https://api.groq.com/openai/v1/chat/completions");
ok("allows DeepSeek", resolveUpstream("/deepseek/v1/chat/completions").target==="https://api.deepseek.com/v1/chat/completions");
ok("allows Mistral", resolveUpstream("/mistral/v1/chat/completions").target==="https://api.mistral.ai/v1/chat/completions");
ok("allows OpenRouter", resolveUpstream("/openrouter/v1/chat/completions").target==="https://openrouter.ai/api/v1/chat/completions");
ok("OpenRouter is OpenAI-compatible (injects usage on stream)", transformRequest("openrouter",{stream:true}).body.stream_options.include_usage===true);
ok("OpenRouter prefixed names price via existing table", priceFor("openai/gpt-4o").in===2.50 && priceFor("google/gemini-2.5-flash").in===0.30 && priceFor("deepseek/deepseek-chat").in===0.14 && priceFor("x-ai/grok-4.5").in===2.00);
ok("OpenRouter dotted Claude name → claude catch-all (opus tier, safe-higher)", priceFor("anthropic/claude-3.5-sonnet").in===5.00 && priceFor("anthropic/claude-3.5-sonnet").out===25.00);
ok("native hyphenated Claude still beats catch-all", priceFor("claude-3-opus").out===75.00);
ok("Groq smuggle stays on Groq origin", resolveUpstream("/groq/https://evil.com/x").target.startsWith("https://api.groq.com/openai/") && !resolveUpstream("/groq/https://evil.com/x").target.includes("//evil.com"));
ok("injects include_usage for Groq/DeepSeek/Mistral streams", transformRequest("groq",{stream:true}).body.stream_options.include_usage===true && transformRequest("deepseek",{stream:true}).body.stream_options.include_usage===true && transformRequest("mistral",{stream:true}).body.stream_options.include_usage===true);
ok("REFUSES unknown host", resolveUpstream("/evil.com/v1/x")===null);
ok("REFUSES bare non-provider", resolveUpstream("/internal-service/admin")===null);
ok("neutralizes smuggled URL (stays on openai host)", resolveUpstream("/openai/https://evil.com/x").target.startsWith("https://api.openai.com/") && !resolveUpstream("/openai/https://evil.com/x").target.includes("//evil.com"));

console.log("SECURITY — KEY HYGIENE:");
const fh = forwardHeaders({ authorization:"Bearer sk-secret", "x-tokenbrake-key":"tb_customer_secret", host:"tokenbrake.app", "content-type":"application/json" });
ok("forwards the provider Authorization", fh.authorization==="Bearer sk-secret");
ok("STRIPS our TokenBrake key (never leaked upstream)", fh["x-tokenbrake-key"]===undefined);
ok("STRIPS host header", fh.host===undefined);
ok("STRIPS internal x-tokenbrake-agent (not leaked upstream)", forwardHeaders({"x-tokenbrake-agent":"support-bot","authorization":"Bearer x"})["x-tokenbrake-agent"]===undefined);

console.log("STREAMING METERING:");
ok("injects include_usage for OpenAI stream", transformRequest("openai",{stream:true,model:"gpt-4o"}).body.stream_options.include_usage===true);
ok("does NOT inject for non-stream", transformRequest("openai",{stream:false}).body.stream_options===undefined);
ok("does NOT inject for Anthropic", transformRequest("anthropic",{stream:true}).body.stream_options===undefined);
ok("injects include_usage for xAI/Grok stream", transformRequest("xai",{stream:true,model:"grok-4.5"}).body.stream_options.include_usage===true && transformRequest("grok",{stream:true,model:"grok-4.5"}).body.stream_options.include_usage===true);
const oaiStream='data: {"choices":[{"delta":{"content":"hi"}}]}\n\ndata: {"choices":[],"usage":{"prompt_tokens":100,"completion_tokens":50}}\n\ndata: [DONE]\n';
ok("extracts usage from OpenAI stream", JSON.stringify(usageFrom(usageFromStream(oaiStream)))===JSON.stringify({inTokens:100,outTokens:50,cachedInTokens:0,cacheWriteTokens:0}));
const antStream='event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":200,"cache_read_input_tokens":100}}}\n\nevent: message_delta\ndata: {"type":"message_delta","usage":{"output_tokens":80}}\n\n';
ok("extracts usage from Anthropic stream", JSON.stringify(usageFrom(usageFromStream(antStream)))===JSON.stringify({inTokens:300,outTokens:80,cachedInTokens:100,cacheWriteTokens:0}));

console.log("SOFT vs HARD CAP (idea 1 — let them run over on purpose):");
ok("HARD blocks over budget", gate(15,10,{mode:"hard"}).allow===false);
ok("SOFT never blocks (their choice to overspend)", gate(15,10,{mode:"soft"}).allow===true);
ok("SOFT still flags 'over' for the alert", gate(15,10,{mode:"soft"}).over===true);
ok("SOFT is not 'capped' (nothing was stopped)", gate(15,10,{mode:"soft"}).capped===false);
ok("default mode is HARD (safe by default)", gate(15,10).allow===false);

console.log("OFF MODE (no cap at all):");
ok("OFF never blocks", gate(999,10,{mode:"off"}).allow===true);
ok("OFF reports mode 'off'", gate(5,10,{mode:"off"}).mode==="off");
ok("OFF not 'capped'", gate(999,10,{mode:"off"}).capped===false);

console.log("CUSTOM NOTIFY THRESHOLDS (customer decides when to be pinged):");
ok("default marks fire at 80% and 100%", JSON.stringify(thresholdsCrossed(7,9,10))==="[0.8]" && JSON.stringify(thresholdsCrossed(9,10,10))==="[1]");
ok("125%-only: silent at 100%", thresholdsCrossed(9,10,10,[1.25]).length===0);
ok("125%-only: fires when crossing 125%", JSON.stringify(thresholdsCrossed(12,13,10,[1.25]))==="[1.25]");
ok("fires each mark once, on the crossing call only", thresholdsCrossed(8.5,9.5,10,[0.8,1.0]).length===0);
ok("no budget → no alerts", thresholdsCrossed(5,50,0,[1.25]).length===0);

console.log("PER-AGENT LEDGER (idea 2 — what is each AI on my PC costing?):");
const L = new Ledger();
L.record("Claude", 2.00, {inTokens:100000,outTokens:20000});
L.record("Jule",   0.50, {inTokens:40000,outTokens:8000});
L.record("Grok",   4.00, {inTokens:200000,outTokens:50000});
L.record("Claude", 1.00, {inTokens:50000,outTokens:10000});
ok("rolls up total across all agents ($7.50)", near(L.total,7.50));
ok("tracks per-agent spend (Claude = $3.00)", near(L.spendOf("Claude"),3.00));
const bd = L.breakdown();
ok("breakdown sorted biggest-burner-first (Grok, Claude, Jule)", bd[0].agent==="Grok" && bd[1].agent==="Claude" && bd[2].agent==="Jule");
ok("counts calls per agent (Claude made 2)", bd.find(x=>x.agent==="Claude").calls===2);
ok("glance() gives the one-line widget summary", L.glance().top.agent==="Grok" && L.glance().agents===3);
L.ensure("Jule", { budget: 5, mode: "soft" });
ok("an agent can carry its own budget + mode", L.agents.Jule.budget===5 && L.agents.Jule.mode==="soft");

console.log("\n"+(fail===0?"✅ ALL "+pass+" TESTS PASS":"❌ "+fail+" FAILED ("+pass+" passed)"));
process.exit(fail?1:0);
