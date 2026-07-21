#!/usr/bin/env node
// TokenBrake Server — single-file build. Zero dependencies (Node 24+ built-in SQLite).
globalThis.__DASHBOARD_HTML = "<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n<title>TokenBrake Server — dashboard</title>\n<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n<style>\n  :root{--bg:#0c0d10;--panel:#15171c;--edge:#262a33;--ink:#e8eaf0;--dim:#8b93a3;--amber:#f6ad55;--teal:#4fd1c5;--red:#fc6a5d;--green:#68d391}\n  *{box-sizing:border-box;margin:0;padding:0}\n  body{background:var(--bg);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,\"Segoe UI\",system-ui,sans-serif;padding:26px}\n  .wrap{max-width:820px;margin:0 auto}\n  .top{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}\n  .logo{font-weight:800;font-size:20px;letter-spacing:.4px}.logo b{color:var(--amber)}\n  .sub{color:var(--dim);font-size:13px;margin-bottom:22px}\n  .keyrow{display:flex;gap:8px;margin-bottom:18px}\n  input,select{background:#08090c;border:1px solid var(--edge);color:var(--ink);border-radius:8px;padding:9px 11px;font-size:14px;font-family:inherit}\n  button{background:var(--amber);color:#181206;border:0;border-radius:8px;padding:9px 16px;font-weight:800;cursor:pointer;font-size:14px}\n  button.ghost{background:transparent;color:var(--ink);border:1px solid var(--edge)}\n  .total{background:var(--panel);border:1px solid var(--edge);border-radius:12px;padding:16px 18px;margin-bottom:16px}\n  .total b{font-size:30px;color:var(--amber)}.total span{color:var(--dim);font-size:13px}\n  table{width:100%;border-collapse:collapse;background:var(--panel);border:1px solid var(--edge);border-radius:12px;overflow:hidden}\n  th{text-align:left;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--dim);padding:11px 14px;border-bottom:1px solid var(--edge)}\n  td{padding:11px 14px;border-bottom:1px solid var(--edge);font-size:14px}\n  tr:last-child td{border-bottom:0}\n  .bar{height:6px;background:#0a0b0e;border-radius:4px;overflow:hidden;margin-top:5px;min-width:120px}\n  .bar i{display:block;height:100%;background:var(--green)}\n  .bar i.warn{background:var(--amber)} .bar i.over{background:var(--red)}\n  .pill{font-size:11px;font-weight:800;padding:2px 8px;border-radius:20px}\n  .pill.hard{background:rgba(252,106,93,.15);color:var(--red)} .pill.soft{background:rgba(246,173,85,.15);color:var(--amber)}\n  .pill.off{background:rgba(139,147,163,.15);color:var(--dim)}\n  .notify{color:var(--teal);font-size:12px;font-weight:700}\n  .chart{background:var(--panel);border:1px solid var(--edge);border-radius:12px;padding:14px 16px;margin-bottom:16px}\n  .chead{display:flex;justify-content:space-between;align-items:baseline;font-size:12px;color:var(--dim);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px}\n  .chead .cmax{color:var(--amber);font-weight:800;text-transform:none;letter-spacing:0;font-size:13px}\n  .cfoot{display:flex;justify-content:space-between;font-size:11px;color:var(--dim);margin-top:4px}\n  .cap{color:var(--red);font-weight:700;font-size:12px}\n  .form{background:var(--panel);border:1px solid var(--edge);border-radius:12px;padding:16px 18px;margin-top:16px;display:flex;gap:8px;flex-wrap:wrap;align-items:center}\n  .form label{color:var(--dim);font-size:13px}\n  .empty{color:var(--dim);padding:20px;text-align:center}\n  .foot{color:var(--dim);font-size:12px;margin-top:20px;line-height:1.5}\n</style>\n</head>\n<body><div class=\"wrap\">\n  <div class=\"top\"><div class=\"logo\">TOKEN<b>BRAKE</b> <span style=\"font-weight:400;color:var(--dim);font-size:14px\">Server</span></div><div class=\"sub\" id=\"period\"></div></div>\n  <div class=\"sub\">Live API spend across your team — metered in real time, capped at your budget.</div>\n\n  <div class=\"keyrow\" id=\"keyrow\" style=\"display:none\">\n    <input id=\"key\" type=\"password\" placeholder=\"your TokenBrake key (TB_KEY)\" style=\"flex:1\">\n    <button onclick=\"saveKey()\">Connect</button>\n  </div>\n\n  <div class=\"total\"><b id=\"total\">$0.00</b> <span>total this month across all agents</span>\n    <div id=\"plan\" style=\"margin-top:10px;font-size:13px;color:var(--dim)\"></div>\n  </div>\n\n  <div class=\"chart\">\n    <div class=\"chead\"><span id=\"chTitle\">Daily spend · last 30 days</span><span><span id=\"chMax\" class=\"cmax\"></span><button onclick=\"exportCsv()\" title=\"Download full daily history as CSV\" style=\"background:transparent;border:1px solid var(--edge);color:var(--dim);border-radius:6px;padding:2px 9px;font-size:11px;cursor:pointer;font-family:inherit;margin-left:10px\">⬇ CSV</button></span></div>\n    <svg id=\"chart\" viewBox=\"0 0 600 130\" preserveAspectRatio=\"none\" style=\"width:100%;height:130px\"></svg>\n    <div class=\"cfoot\"><span id=\"chStart\"></span><span id=\"chEnd\"></span></div>\n  </div>\n\n  <table><thead><tr><th>Agent / project</th><th>Spend / budget</th><th>Mode</th><th>Notify at</th><th>Calls</th></tr></thead>\n    <tbody id=\"rows\"><tr><td colspan=\"5\" class=\"empty\">connecting…</td></tr></tbody>\n  </table>\n\n  <div class=\"form\">\n    <label>Set budget:</label>\n    <input id=\"bn\" placeholder=\"agent name (e.g. openai)\" style=\"width:170px\">\n    <label>$</label><input id=\"bv\" type=\"number\" placeholder=\"20\" style=\"width:80px\"><label>/mo</label>\n    <select id=\"bm\">\n      <option value=\"hard\">hard — stop at limit</option>\n      <option value=\"soft\">soft — warn, keep running</option>\n      <option value=\"off\">off — no cap</option>\n    </select>\n    <label>notify at</label><input id=\"ba\" type=\"number\" placeholder=\"100\" style=\"width:70px\"><label>%</label>\n    <button onclick=\"saveBudget()\">Save</button>\n  </div>\n  <div class=\"form\">\n    <label>Alert webhook (optional):</label>\n    <input id=\"wh\" placeholder=\"https://hooks.slack.com/…  — we POST here when a threshold is crossed\" style=\"flex:1;min-width:220px\">\n    <button class=\"ghost\" onclick=\"saveWebhook()\">Save webhook</button>\n  </div>\n\n  <div class=\"foot\">Self-hosted — your API keys and prompts never leave this server. TokenBrake meters spend and stops calls at the budget; it's a safety brake, not a warranty.<br>\n  <b>Notify at</b> is your call — set it to 125% if you don't want a peep until you're well over. Leave the webhook blank to stay silent. Any AI agent can run all of this via <code>/agent.json</code>.</div>\n</div>\n<script>\nlet KEY = localStorage.getItem(\"tb_key\") || \"\";\nlet selectedAgent = null;   // when set, the chart shows just this agent's trend\nconst el = id => document.getElementById(id);\nconst money = n => \"$\" + (Number(n)||0).toFixed(2);\nfunction saveKey(){ KEY = el(\"key\").value.trim(); localStorage.setItem(\"tb_key\", KEY); load(); }\nasync function saveBudget(){\n  const name = el(\"bn\").value.trim(); if(!name) return;\n  const h = {\"content-type\":\"application/json\",\"x-tokenbrake-key\":KEY};\n  await fetch(\"/api/budget\",{method:\"POST\",headers:h,body:JSON.stringify({name,budget:Number(el(\"bv\").value)||0,mode:el(\"bm\").value})});\n  const pctVal = Number(el(\"ba\").value);   // \"notify at %\" → fraction, e.g. 125 → 1.25\n  if(pctVal>0) await fetch(\"/api/alerts\",{method:\"POST\",headers:h,body:JSON.stringify({name,thresholds:[pctVal/100]})});\n  el(\"bn\").value=\"\"; el(\"bv\").value=\"\"; el(\"ba\").value=\"\"; load();\n}\nasync function saveWebhook(){\n  await fetch(\"/api/alerts\",{method:\"POST\",headers:{\"content-type\":\"application/json\",\"x-tokenbrake-key\":KEY},body:JSON.stringify({webhook:el(\"wh\").value.trim()})});\n  load();\n}\nasync function load(){\n  let j;\n  try{ const r = await fetch(\"/api/stats\",{headers:{\"x-tokenbrake-key\":KEY}}); if(r.status===401){ el(\"keyrow\").style.display=\"flex\"; el(\"rows\").innerHTML='<tr><td colspan=5 class=empty>enter your TokenBrake key to connect</td></tr>'; return; } j = await r.json(); }\n  catch{ return; }\n  el(\"keyrow\").style.display=\"none\";\n  el(\"period\").textContent = j.period;\n  loadHistory();\n  if(document.activeElement!==el(\"wh\")) el(\"wh\").value = j.webhook || \"\";\n  const total = j.agents.reduce((s,a)=>s+(a.spend||0),0);\n  el(\"total\").textContent = money(total);\n  const p = j.plan;\n  if(p){\n    const cap = p.seats>0 ? p.seats+\" agents\" : \"unlimited agents\";\n    if(p.over) el(\"plan\").innerHTML = `<span style=\"color:var(--amber);font-weight:700\">Solo plan · ${p.used}/${p.seats} agents — over your plan.</span> Everything keeps running; <a href=\"https://tokenbrake.com/pricing\" style=\"color:var(--teal)\">upgrade to Business →</a>`;\n    else el(\"plan\").innerHTML = `<b style=\"color:var(--ink)\">${esc(p.tier)}</b> plan · monitoring ${p.used} of ${cap}${p.licensed?\"\":' <span style=\"color:var(--dim)\">(free)</span>'}`;\n  }\n  el(\"rows\").innerHTML = j.agents.length ? j.agents.map(a=>{\n    const pct = a.budget>0 ? Math.min(100, a.spend/a.budget*100) : 0;\n    const cls = a.budget>0 && a.spend>=a.budget ? \"over\" : (a.budget>0 && a.spend>=a.budget*0.8 ? \"warn\":\"\");\n    const capped = a.mode===\"hard\" && a.budget>0 && a.spend>=a.budget ? ' <span class=\"cap\">⛔ capped</span>' : \"\";\n    const bud = a.budget>0 ? money(a.spend)+\" / \"+money(a.budget) : money(a.spend)+\" <span style='color:var(--dim)'>· no budget</span>\";\n    let notify = '<span style=\"color:var(--dim)\">80% / 100%</span>';   // the default when unset\n    try{ const m=a.alerts?JSON.parse(a.alerts):null; if(m&&m.length) notify='<span class=\"notify\">'+m.map(x=>Math.round(x*100)+'%').join(' / ')+'</span>'; }catch{}\n    const sel = selectedAgent===a.name ? ' style=\"cursor:pointer;background:rgba(246,173,85,.06)\"' : ' style=\"cursor:pointer\"';\n    return `<tr data-agent=\"${att(a.name)}\"${sel} title=\"Click for this agent's 30-day trend\"><td><b>${esc(a.name)}</b></td><td>${bud}${capped}<div class=\"bar\"><i class=\"${cls}\" style=\"width:${pct}%\"></i></div></td><td><span class=\"pill ${a.mode}\">${a.mode}</span></td><td>${notify}</td><td>${a.calls}</td></tr>`;\n  }).join(\"\") : '<tr><td colspan=5 class=empty>no spend yet — point an AI at /openai or /anthropic</td></tr>';\n}\nasync function loadHistory(){\n  const q = selectedAgent ? \"?agent=\"+encodeURIComponent(selectedAgent) : \"\";\n  let j; try{ const r=await fetch(\"/api/history\"+q,{headers:{\"x-tokenbrake-key\":KEY}}); if(!r.ok) return; j=await r.json(); }catch{ return; }\n  const days=j.days||[]; if(!days.length) return;\n  el(\"chTitle\").innerHTML = selectedAgent\n    ? esc(selectedAgent)+' · 30 days &nbsp;<a href=\"#\" onclick=\"clearAgent();return false\" style=\"color:var(--teal);text-transform:none;letter-spacing:0;font-weight:400\">← all agents</a>'\n    : \"Daily spend · last 30 days\";\n  const total=days.reduce((s,d)=>s+d.spend,0);\n  const max=Math.max(...days.map(d=>d.spend),1e-9);\n  const W=600,H=130,pad=8,n=days.length;\n  const X=i=> n>1 ? (i/(n-1))*W : W/2;\n  const Y=v=> H-pad-(v/max)*(H-2*pad);\n  const line=days.map((d,i)=>`${i?'L':'M'}${X(i).toFixed(1)},${Y(d.spend).toFixed(1)}`).join(' ');\n  const area=`${line} L${W},${H} L0,${H} Z`;\n  el(\"chart\").innerHTML=\n    '<defs><linearGradient id=\"g\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#f6ad55\" stop-opacity=\".35\"/><stop offset=\"1\" stop-color=\"#f6ad55\" stop-opacity=\"0\"/></linearGradient></defs>'+\n    `<path d=\"${area}\" fill=\"url(#g)\"/><path d=\"${line}\" fill=\"none\" stroke=\"#f6ad55\" stroke-width=\"2\" vector-effect=\"non-scaling-stroke\" stroke-linejoin=\"round\"/>`;\n  el(\"chMax\").textContent = total>0 ? \"peak \"+money(max)+\"/day · \"+money(total)+\" in 30d\" : \"no spend in the last 30 days yet\";\n  el(\"chStart\").textContent=days[0].day;\n  el(\"chEnd\").textContent=days[n-1].day;\n}\nfunction esc(s){return String(s||\"\").replace(/[<>&]/g,c=>({\"<\":\"&lt;\",\">\":\"&gt;\",\"&\":\"&amp;\"}[c]));}\nfunction att(s){return esc(s).replace(/\"/g,\"&quot;\");}\nasync function exportCsv(){\n  try{ const r=await fetch(\"/api/export.csv\",{headers:{\"x-tokenbrake-key\":KEY}}); if(!r.ok) return;\n    const blob=await r.blob(), url=URL.createObjectURL(blob), a=document.createElement(\"a\");\n    a.href=url; a.download=\"tokenbrake-history.csv\"; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);\n  }catch{}\n}\nfunction pickAgent(name){ selectedAgent = (selectedAgent===name ? null : name); loadHistory(); load(); }\nfunction clearAgent(){ selectedAgent = null; loadHistory(); load(); }\nel(\"rows\").addEventListener(\"click\", e=>{ const tr=e.target.closest(\"tr[data-agent]\"); if(tr) pickAgent(tr.getAttribute(\"data-agent\")); });\nload(); setInterval(load, 6000);\n</script>\n</body>\n</html>\n";

// server/app.mjs
import http from "node:http";
import crypto2 from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// lib/proxy-core.js
var PROVIDERS = {
  openai: "https://api.openai.com",
  anthropic: "https://api.anthropic.com",
  xai: "https://api.x.ai",
  grok: "https://api.x.ai",
  groq: "https://api.groq.com/openai",
  // Groq's OpenAI-compatible endpoint lives under /openai
  deepseek: "https://api.deepseek.com",
  mistral: "https://api.mistral.ai",
  gemini: "https://generativelanguage.googleapis.com",
  // Google Gemini (its own wire format)
  google: "https://generativelanguage.googleapis.com",
  openrouter: "https://openrouter.ai/api"
  // aggregator; OpenAI-compatible wire format
};
var OPENAI_COMPATIBLE = /* @__PURE__ */ new Set(["openai", "xai", "grok", "groq", "deepseek", "mistral", "openrouter"]);
function resolveUpstream(pathname) {
  const parts = String(pathname || "").replace(/^\/+/, "").split("/");
  const provider = (parts.shift() || "").toLowerCase();
  const base = PROVIDERS[provider];
  if (!base) return null;
  const rest = "/" + parts.join("/").replace(/^https?:\/*/i, "");
  const target = base + rest;
  if (!target.startsWith(base + "/") && target !== base) return null;
  return { provider, base, target };
}
function transformRequest(provider, bodyObj, pathname = "") {
  if (provider === "gemini" || provider === "google") {
    const mm = /\/models\/([^:/?]+):(\w+)/.exec(pathname || "");
    return { body: bodyObj, isStream: /:streamGenerateContent/.test(pathname || ""), model: mm ? mm[1] : void 0 };
  }
  if (!bodyObj || typeof bodyObj !== "object") return { body: bodyObj, isStream: false, model: void 0 };
  const isStream = bodyObj.stream === true;
  if (OPENAI_COMPATIBLE.has(provider) && isStream) {
    bodyObj.stream_options = { ...bodyObj.stream_options || {}, include_usage: true };
  }
  return { body: bodyObj, isStream, model: bodyObj.model };
}
var DROP = /* @__PURE__ */ new Set(["host", "content-length", "connection", "x-tokenbrake-key", "x-tokenbrake-budget", "x-tokenbrake-agent"]);
function forwardHeaders(incoming) {
  const out = {};
  for (const [k, v] of Object.entries(incoming || {})) {
    if (!DROP.has(k.toLowerCase())) out[k] = v;
  }
  return out;
}
function capResponse(remaining, budget) {
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

// lib/pricing.js
var PRICES = {
  // ---- OpenAI (cached input ≈ 0.5× input) ----
  "gpt-4o-mini": { in: 0.15, out: 0.6, cachedIn: 0.075 },
  "gpt-4o": { in: 2.5, out: 10, cachedIn: 1.25 },
  "gpt-4.1-mini": { in: 0.4, out: 1.6, cachedIn: 0.1 },
  "gpt-4.1-nano": { in: 0.1, out: 0.4, cachedIn: 0.025 },
  "gpt-4.1": { in: 2, out: 8, cachedIn: 0.5 },
  "gpt-4-turbo": { in: 10, out: 30 },
  "gpt-4": { in: 30, out: 60 },
  "gpt-3.5-turbo": { in: 0.5, out: 1.5 },
  "o4-mini": { in: 1.1, out: 4.4, cachedIn: 0.275 },
  "o3-mini": { in: 1.1, out: 4.4, cachedIn: 0.55 },
  "o3": { in: 2, out: 8, cachedIn: 0.5 },
  "o1-mini": { in: 1.1, out: 4.4, cachedIn: 0.55 },
  "o1": { in: 15, out: 60, cachedIn: 7.5 },
  "text-embedding-3-small": { in: 0.02, out: 0 },
  "text-embedding-3-large": { in: 0.13, out: 0 },
  // ---- Anthropic (cache read ≈ 0.1× input, cache write ≈ 1.25× input) ----
  "claude-3-5-haiku": { in: 0.8, out: 4, cachedIn: 0.08, cacheWrite: 1 },
  "claude-3-haiku": { in: 0.25, out: 1.25, cachedIn: 0.03, cacheWrite: 0.3 },
  "claude-3-5-sonnet": { in: 3, out: 15, cachedIn: 0.3, cacheWrite: 3.75 },
  "claude-3-7-sonnet": { in: 3, out: 15, cachedIn: 0.3, cacheWrite: 3.75 },
  "claude-sonnet-4": { in: 3, out: 15, cachedIn: 0.3, cacheWrite: 3.75 },
  "claude-3-opus": { in: 15, out: 75, cachedIn: 1.5, cacheWrite: 18.75 },
  "claude-opus-4": { in: 15, out: 75, cachedIn: 1.5, cacheWrite: 18.75 },
  "claude": { in: 3, out: 15, cachedIn: 0.3, cacheWrite: 3.75 },
  // catch-all (e.g. OpenRouter's dotted names) → sonnet rate
  // ---- xAI / Grok (OpenAI-compatible). Standard real-time, short-context rates. NOTE: xAI
  // doubles rates once a prompt crosses its long-context threshold and for Priority tier —
  // TokenBrake meters the standard rate, so very-large-context calls may under-estimate. ----
  "grok-4.5": { in: 2, out: 6, cachedIn: 0.3 },
  "grok-4.3": { in: 1.25, out: 2.5, cachedIn: 0.2 },
  "grok-4.20": { in: 1.25, out: 2.5, cachedIn: 0.2 },
  // covers grok-4.20-* variants
  "grok-build": { in: 1, out: 2, cachedIn: 0.2 },
  "grok": { in: 2, out: 6, cachedIn: 0.3 },
  // catch-all → flagship rate
  // ---- Groq (LPU host for open models; OpenAI-compatible). Rates from groq.com/pricing. ----
  "gpt-oss-120b": { in: 0.15, out: 0.6, cachedIn: 0.075 },
  "gpt-oss-20b": { in: 0.075, out: 0.3, cachedIn: 0.0375 },
  "llama-3.3-70b": { in: 0.59, out: 0.79 },
  "llama-3.1-8b": { in: 0.05, out: 0.08 },
  "kimi-k2": { in: 1, out: 3, cachedIn: 0.5 },
  "qwen3.6-27b": { in: 0.6, out: 3 },
  // ---- DeepSeek (OpenAI-compatible). chat/reasoner are compat aliases for v4-flash modes. ----
  "deepseek-v4-pro": { in: 0.435, out: 0.87, cachedIn: 3625e-6 },
  "deepseek-v4-flash": { in: 0.14, out: 0.28, cachedIn: 28e-4 },
  "deepseek-reasoner": { in: 0.14, out: 0.28 },
  "deepseek-chat": { in: 0.14, out: 0.28 },
  "deepseek": { in: 0.435, out: 0.87 },
  // catch-all → pro (safe-higher)
  // ---- Mistral (OpenAI-compatible). Large $2/$6 per mistral.ai. ----
  "mistral-large": { in: 2, out: 6 },
  "mistral-small": { in: 0.1, out: 0.3 },
  "codestral": { in: 0.3, out: 0.9 },
  "mistral": { in: 2, out: 6 },
  // catch-all → large (safe-higher)
  // ---- Google Gemini (NOT OpenAI-shaped — usageMetadata, model-in-URL). Standard-tier,
  // short-context (<=200k) rates from ai.google.dev/gemini-api/docs/pricing. Gemini doubles
  // rates above 200k tokens, so very-large-context calls may under-estimate. ----
  "gemini-3.5-flash": { in: 1.5, out: 9, cachedIn: 0.15 },
  "gemini-3.1-pro": { in: 2, out: 12, cachedIn: 0.2 },
  "gemini-3.1-flash-lite": { in: 0.25, out: 1.5, cachedIn: 0.025 },
  "gemini-2.5-pro": { in: 1.25, out: 10, cachedIn: 0.125 },
  "gemini-2.5-flash-lite": { in: 0.1, out: 0.4, cachedIn: 0.01 },
  "gemini-2.5-flash": { in: 0.3, out: 2.5, cachedIn: 0.03 },
  "gemini": { in: 2, out: 12, cachedIn: 0.2 }
  // catch-all → flagship (safe-higher)
};
var UNKNOWN = { in: 5, out: 15 };
function priceFor(model) {
  const m = String(model || "").toLowerCase();
  let best = null, bestLen = -1;
  for (const key of Object.keys(PRICES)) {
    if (m.includes(key) && key.length > bestLen) {
      best = PRICES[key];
      bestLen = key.length;
    }
  }
  return best || UNKNOWN;
}
function costDetailed(model, usage = {}) {
  const p = priceFor(model);
  const inT = Number(usage.inTokens) || 0;
  const outT = Number(usage.outTokens) || 0;
  const cachedT = Number(usage.cachedInTokens) || 0;
  const writeT = Number(usage.cacheWriteTokens) || 0;
  const plainIn = Math.max(0, inT - cachedT);
  const cachedRate = p.cachedIn != null ? p.cachedIn : p.in;
  const writeRate = p.cacheWrite != null ? p.cacheWrite : p.in;
  return (plainIn * p.in + cachedT * cachedRate + writeT * writeRate + outT * p.out) / 1e6;
}

// lib/meter.js
var num = (x) => Number(x) || 0;
function usageFrom(body) {
  const gm = body && body.usageMetadata;
  if (gm && (gm.promptTokenCount != null || gm.candidatesTokenCount != null)) {
    const cached = num(gm.cachedContentTokenCount);
    return { inTokens: num(gm.promptTokenCount), outTokens: num(gm.candidatesTokenCount) + num(gm.thoughtsTokenCount), cachedInTokens: cached, cacheWriteTokens: 0 };
  }
  const u = body && body.usage || {};
  if (u.prompt_tokens != null || u.completion_tokens != null) {
    const cached = u.prompt_tokens_details && u.prompt_tokens_details.cached_tokens || 0;
    return { inTokens: num(u.prompt_tokens), outTokens: num(u.completion_tokens), cachedInTokens: num(cached), cacheWriteTokens: 0 };
  }
  if (u.input_tokens != null || u.output_tokens != null) {
    const read = num(u.cache_read_input_tokens), write = num(u.cache_creation_input_tokens);
    return { inTokens: num(u.input_tokens) + read, outTokens: num(u.output_tokens), cachedInTokens: read, cacheWriteTokens: write };
  }
  return { inTokens: 0, outTokens: 0, cachedInTokens: 0, cacheWriteTokens: 0 };
}
function costFromResponse(model, body) {
  const usage = usageFrom(body);
  const model2 = model || body && body.model;
  return { cost: costDetailed(model2, usage), ...usage };
}
function gate(spent, budget, opts = {}) {
  const s = num(spent), b = num(budget);
  const mode = opts.mode === "soft" ? "soft" : opts.mode === "off" ? "off" : "hard";
  if (b <= 0 || mode === "off") return { allow: true, over: b > 0 && s >= b, capped: false, mode, pct: b > 0 ? s / b : 0, remaining: b > 0 ? Math.max(0, b - s) : Infinity };
  const over = s >= b;
  return {
    allow: mode === "hard" ? !over : true,
    // only hard blocks; soft & off keep running (their choice)
    over,
    // true once past budget (drives the alert)
    capped: over && mode === "hard",
    // true only when we actually stopped a call
    mode,
    pct: s / b,
    remaining: Math.max(0, b - s)
  };
}
function thresholdsCrossed(prevSpent, newSpent, budget, marks = [0.8, 1]) {
  const b = num(budget);
  if (b <= 0 || !Array.isArray(marks) || !marks.length) return [];
  const prev = num(prevSpent) / b, now = num(newSpent) / b;
  return marks.filter((m) => prev < m && now >= m);
}

// lib/stream.js
var num2 = (x) => Number(x) || 0;
function usageFromStream(sseText) {
  const lines = String(sseText || "").split(/\r?\n/);
  let openaiUsage = null;
  let geminiUsage = null;
  let sawAnthropic = false, aIn = 0, aOut = 0, aRead = 0, aWrite = 0;
  for (const line of lines) {
    const m = line.match(/^data:\s*(.+)$/);
    if (!m) continue;
    const payload = m[1].trim();
    if (payload === "[DONE]") continue;
    let o;
    try {
      o = JSON.parse(payload);
    } catch {
      continue;
    }
    if (!o || typeof o !== "object") continue;
    if (o.usage && (o.usage.prompt_tokens != null || o.usage.completion_tokens != null)) {
      openaiUsage = o.usage;
    }
    if (o.usageMetadata && (o.usageMetadata.promptTokenCount != null || o.usageMetadata.candidatesTokenCount != null)) {
      geminiUsage = o.usageMetadata;
    }
    if (o.type === "message_start" && o.message && o.message.usage) {
      sawAnthropic = true;
      const u = o.message.usage;
      aIn = num2(u.input_tokens);
      aRead = num2(u.cache_read_input_tokens);
      aWrite = num2(u.cache_creation_input_tokens);
    }
    if (o.type === "message_delta" && o.usage) {
      sawAnthropic = true;
      if (o.usage.output_tokens != null) aOut = num2(o.usage.output_tokens);
    }
  }
  if (openaiUsage) return { usage: openaiUsage };
  if (geminiUsage) return { usageMetadata: geminiUsage };
  if (sawAnthropic) return { usage: { input_tokens: aIn, output_tokens: aOut, cache_read_input_tokens: aRead, cache_creation_input_tokens: aWrite } };
  return { usage: {} };
}

// server/db.mjs
import { DatabaseSync } from "node:sqlite";
import { homedir } from "node:os";
var PATH = process.env.TB_DB || homedir() + "/.tokenbrake-server.db";
var db = new DatabaseSync(PATH);
db.exec(`CREATE TABLE IF NOT EXISTS agents(
  name TEXT PRIMARY KEY, budget REAL DEFAULT 0, mode TEXT DEFAULT 'hard',
  spend REAL DEFAULT 0, calls INTEGER DEFAULT 0, in_tok INTEGER DEFAULT 0, out_tok INTEGER DEFAULT 0,
  period TEXT, alerts TEXT )`);
db.exec(`CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY, v TEXT)`);
db.exec(`CREATE TABLE IF NOT EXISTS history(
  name TEXT, day TEXT, spend REAL DEFAULT 0, calls INTEGER DEFAULT 0,
  PRIMARY KEY(name, day) )`);
try {
  db.exec("ALTER TABLE agents ADD COLUMN alerts TEXT");
} catch {
}
var period = () => (/* @__PURE__ */ new Date()).toISOString().slice(0, 7);
var today = () => (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
function getAgent(name) {
  const n = String(name || "unlabeled"), p = period();
  let r = db.prepare("SELECT * FROM agents WHERE name=?").get(n);
  if (!r) {
    db.prepare("INSERT INTO agents(name,period) VALUES(?,?)").run(n, p);
    return db.prepare("SELECT * FROM agents WHERE name=?").get(n);
  }
  if (r.period !== p) {
    db.prepare("UPDATE agents SET spend=0,calls=0,in_tok=0,out_tok=0,period=? WHERE name=?").run(p, n);
    r = db.prepare("SELECT * FROM agents WHERE name=?").get(n);
  }
  return r;
}
function record(name, cost, usage = {}) {
  const a = getAgent(name);
  const before = a.spend, after = before + (Number(cost) || 0);
  db.prepare("UPDATE agents SET spend=spend+?, calls=calls+1, in_tok=in_tok+?, out_tok=out_tok+? WHERE name=?").run(Number(cost) || 0, Number(usage.inTokens) || 0, Number(usage.outTokens) || 0, String(name || "unlabeled"));
  db.prepare("INSERT INTO history(name,day,spend,calls) VALUES(?,?,?,1) ON CONFLICT(name,day) DO UPDATE SET spend=spend+?, calls=calls+1").run(a.name, today(), Number(cost) || 0, Number(cost) || 0);
  try {
    if (a.budget > 0 && a.mode !== "off") {
      const marks = a.alerts ? JSON.parse(a.alerts) : void 0;
      const crossed = thresholdsCrossed(before, after, a.budget, marks);
      if (crossed.length) fireAlert(a.name, after, a.budget, crossed);
    }
  } catch {
  }
}
function fireAlert(name, spend, budget, crossed) {
  const url = meta("webhook");
  if (!url) return;
  const pct = Math.round(spend / budget * 100);
  const payload = {
    event: "tokenbrake.budget_alert",
    agent: name,
    spend: Math.round(spend * 100) / 100,
    budget,
    pct,
    threshold_pct: Math.round(Math.max(...crossed) * 100),
    at: (/* @__PURE__ */ new Date()).toISOString(),
    message: `${name} reached ${pct}% of its $${budget}/mo budget.`
  };
  try {
    fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }).catch(() => {
    });
  } catch {
  }
}
function setAlerts(name, thresholds) {
  const n = String(name || "unlabeled");
  getAgent(n);
  const arr = Array.isArray(thresholds) ? thresholds.map(Number).filter((x) => x > 0) : null;
  db.prepare("UPDATE agents SET alerts=? WHERE name=?").run(arr && arr.length ? JSON.stringify(arr) : null, n);
  return db.prepare("SELECT * FROM agents WHERE name=?").get(n);
}
function setWebhook(url) {
  meta("webhook", String(url || ""));
  return meta("webhook");
}
function getWebhook() {
  return meta("webhook") || "";
}
function setBudget(name, budget, mode = "hard") {
  const n = String(name || "unlabeled");
  getAgent(n);
  const m = mode === "soft" ? "soft" : mode === "off" ? "off" : "hard";
  db.prepare("UPDATE agents SET budget=?, mode=? WHERE name=?").run(Number(budget) || 0, m, n);
  return db.prepare("SELECT * FROM agents WHERE name=?").get(n);
}
function allAgents() {
  const p = period();
  for (const r of db.prepare("SELECT name FROM agents WHERE period IS NOT ?").all(p)) getAgent(r.name);
  return db.prepare("SELECT * FROM agents ORDER BY spend DESC").all();
}
function historyFor(days = 30, name = null) {
  const n = Math.max(1, Math.min(365, Number(days) || 30));
  const rows = name ? db.prepare("SELECT day, spend, calls FROM history WHERE name=?").all(String(name)) : db.prepare("SELECT day, SUM(spend) AS spend, SUM(calls) AS calls FROM history GROUP BY day").all();
  const byDay = Object.fromEntries(rows.map((r) => [r.day, r]));
  const out = [];
  const d = /* @__PURE__ */ new Date();
  for (let i = n - 1; i >= 0; i--) {
    const day = new Date(d.getTime() - i * 864e5).toISOString().slice(0, 10);
    const r = byDay[day];
    out.push({ day, spend: r ? Math.round(r.spend * 1e6) / 1e6 : 0, calls: r ? r.calls : 0 });
  }
  return out;
}
function exportHistory() {
  return db.prepare("SELECT name, day, spend, calls FROM history ORDER BY day DESC, name ASC").all();
}
function meta(k, v) {
  if (v === void 0) {
    const r = db.prepare("SELECT v FROM meta WHERE k=?").get(k);
    return r ? r.v : null;
  }
  db.prepare("INSERT INTO meta(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=?").run(k, String(v), String(v));
}

// lib/license.js
import crypto from "node:crypto";
var PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAkoh38Vt4qL/nwU4zur4ExJZhsm/Rf23OW5kcqdChLT8=
-----END PUBLIC KEY-----`;
var PRIVATE_KEY = process.env.TB_LICENSE_PRIVATE_KEY || "";
var PLAN_SEATS = { solo: 3, business: 0 };
function seatsForTier(tier) {
  const s = PLAN_SEATS[String(tier || "").toLowerCase()];
  return s === void 0 ? 3 : s;
}
function verifyLicense(key) {
  try {
    const k = String(key || "").trim();
    if (!k.startsWith("TB-")) return { valid: false };
    const [b64, sig] = k.slice(3).split(".");
    if (!b64 || !sig) return { valid: false };
    const body = Buffer.from(b64, "base64url").toString();
    const good = crypto.verify(null, Buffer.from(body), PUBLIC_KEY, Buffer.from(sig, "base64url"));
    if (!good) return { valid: false };
    const [tier, ref, exp, seats] = body.split(".");
    if (Number(exp) > 0 && Number(exp) < Math.floor(Date.now() / 1e3)) return { valid: false, expired: true };
    const nSeats = seats === void 0 || seats === "" ? seatsForTier(tier) : Math.max(0, Math.floor(Number(seats)));
    return { valid: true, tier, ref, exp: Number(exp), seats: nSeats };
  } catch {
    return { valid: false };
  }
}

// server/app.mjs
var __dir = dirname(fileURLToPath(import.meta.url));
var PORT = Number(process.env.TB_PORT) || 8788;
var KEY = process.env.TB_KEY || "";
var DASH = globalThis.__DASHBOARD_HTML || readFileSync(join(__dir, "dashboard.html"), "utf8");
var LIC = process.env.TB_LICENSE ? verifyLicense(process.env.TB_LICENSE) : null;
var PLAN = LIC && LIC.valid ? { tier: LIC.tier, seats: LIC.seats, licensed: true } : { tier: "solo", seats: seatsForTier("solo"), licensed: false };
function planStatus() {
  const used = allAgents().length;
  const over = PLAN.seats > 0 && used > PLAN.seats;
  return { tier: PLAN.tier, seats: PLAN.seats, used, over, licensed: PLAN.licensed };
}
var json = (res, s, o) => {
  res.writeHead(s, { "content-type": "application/json" });
  res.end(JSON.stringify(o));
};
var safeEq = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto2.timingSafeEqual(x, y);
};
var authed = (req) => !KEY || safeEq(req.headers["x-tokenbrake-key"] || "", KEY) || safeEq(req.headers["authorization"] || "", "Bearer " + KEY);
var meterAndRecord = (agent, model, body) => {
  try {
    const { cost, ...u } = costFromResponse(model, body);
    if (cost > 0) record(agent, cost, u);
  } catch {
  }
};
async function readBody(req, maxBytes) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > maxBytes) {
      const e = new Error("body too large");
      e.tooLarge = true;
      throw e;
    }
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}
var CTRL_MAX = 256 * 1024;
var PROXY_MAX = 25 * 1024 * 1024;
var server = http.createServer(async (req, res) => {
  try {
    const path = req.url.split("?")[0];
    if (req.method === "GET" && (path === "/" || path === "/dashboard")) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return res.end(DASH);
    }
    if (path === "/health") return json(res, 200, { ok: true, service: "TokenBrake Server", secured: !!KEY });
    if (req.method === "GET" && (path === "/agent.json" || path === "/.well-known/agent.json")) {
      const base = `http://${req.headers.host || "localhost:" + PORT}`;
      return json(res, 200, {
        name: "TokenBrake",
        description: "Circuit breaker for AI API bills. Meters every call, caps runaway spend, alerts at your own thresholds.",
        instructions: "You are operating a customer's TokenBrake meter. Send the header 'x-tokenbrake-key: <TB_KEY>' on every write call. Budgets and alerts are per agent/project name. 'mode' is hard (stop at budget), soft (warn, keep running), or off (no cap). Alert thresholds are fractions of budget: 1.0 = 100%, 1.25 = 125%.",
        auth: { type: "apiKey", header: "x-tokenbrake-key", note: KEY ? "required" : "server is open (no key set)" },
        actions: {
          check_meter: { method: "GET", path: "/api/stats", auth: true, description: "Read every agent's spend, budget, mode, and call count for this month." },
          set_budget: { method: "POST", path: "/api/budget", auth: true, body: { name: "string", budget: "number (USD/month)", mode: "hard|soft|off" }, description: "Set or change a budget. Turn the cap OFF with mode 'off'; turn it back ON with 'hard'." },
          set_alerts: { method: "POST", path: "/api/alerts", auth: true, body: { name: "string", thresholds: "number[] fractions of budget e.g. [1.25]", webhook: "string URL (optional, applies server-wide)" }, description: "Choose when to be notified. e.g. thresholds [1.25] = only alert at 125% of budget." }
        },
        examples: [
          `curl -H "x-tokenbrake-key: TB_KEY" ${base}/api/stats`,
          `curl -X POST -H "x-tokenbrake-key: TB_KEY" -H "content-type: application/json" -d '{"name":"support-bot","budget":200,"mode":"hard"}' ${base}/api/budget`,
          `curl -X POST -H "x-tokenbrake-key: TB_KEY" -H "content-type: application/json" -d '{"name":"support-bot","thresholds":[1.25]}' ${base}/api/alerts`
        ],
        proxy: { openai: `${base}/openai`, anthropic: `${base}/anthropic`, xai: `${base}/xai`, groq: `${base}/groq`, deepseek: `${base}/deepseek`, mistral: `${base}/mistral`, gemini: `${base}/gemini`, openrouter: `${base}/openrouter`, note: "Point your AI base_url here to start metering. /xai /groq /deepseek /mistral /openrouter are OpenAI-compatible (use the OpenAI SDK); /gemini uses Google's native format. Tag calls with header 'x-tokenbrake-agent: <name>'." },
        plan: planStatus()
      });
    }
    if (path === "/api/stats") {
      if (!authed(req)) return json(res, 401, { error: "bad key" });
      return json(res, 200, { agents: allAgents(), webhook: getWebhook(), plan: planStatus(), period: (/* @__PURE__ */ new Date()).toISOString().slice(0, 7) });
    }
    if (path === "/api/history") {
      if (!authed(req)) return json(res, 401, { error: "bad key" });
      const u = new URL(req.url, "http://x");
      const days = Number(u.searchParams.get("days")) || 30;
      const agent2 = u.searchParams.get("agent") || null;
      return json(res, 200, { days: historyFor(days, agent2), agent: agent2 });
    }
    if (path === "/api/export.csv") {
      if (!authed(req)) return json(res, 401, { error: "bad key" });
      const q = (v) => {
        const s = String(v == null ? "" : v);
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      };
      let csv = "agent,day,spend_usd,calls\n";
      for (const r of exportHistory()) csv += [q(r.name), q(r.day), (Number(r.spend) || 0).toFixed(6), Number(r.calls) || 0].join(",") + "\n";
      res.writeHead(200, { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="tokenbrake-history.csv"' });
      return res.end(csv);
    }
    if (path === "/api/budget" && req.method === "POST") {
      if (!authed(req)) return json(res, 401, { error: "bad key" });
      const raw = await readBody(req, CTRL_MAX);
      let b = {};
      try {
        b = JSON.parse(raw.toString());
      } catch {
      }
      return json(res, 200, setBudget(b.name, b.budget, b.mode));
    }
    if (path === "/api/alerts" && req.method === "POST") {
      if (!authed(req)) return json(res, 401, { error: "bad key" });
      const raw = await readBody(req, CTRL_MAX);
      let b = {};
      try {
        b = JSON.parse(raw.toString());
      } catch {
      }
      if (typeof b.webhook === "string") setWebhook(b.webhook);
      const agent2 = b.name ? setAlerts(b.name, b.thresholds) : null;
      return json(res, 200, { ok: true, agent: agent2, webhook: getWebhook() });
    }
    const upstream = resolveUpstream(path);
    if (!upstream) return json(res, 404, { error: { message: "TokenBrake Server: use /openai/... or /anthropic/... (or open / for the dashboard)" } });
    if (!authed(req)) return json(res, 401, { error: { message: "TokenBrake: missing or bad x-tokenbrake-key" } });
    const agent = String(req.headers["x-tokenbrake-agent"] || upstream.provider);
    const rawBody = await readBody(req, PROXY_MAX);
    const a = getAgent(agent);
    const g = gate(a.spend, a.budget, { mode: a.mode });
    if (!g.allow) {
      const cap = capResponse(g.remaining, a.budget);
      return json(res, cap.status, cap.body);
    }
    let sendBody = rawBody, isStream = false, model, parsed;
    try {
      parsed = JSON.parse(rawBody.toString());
    } catch {
    }
    try {
      const t = transformRequest(upstream.provider, parsed ?? {}, path);
      isStream = t.isStream;
      model = t.model;
      if (parsed !== void 0) sendBody = Buffer.from(JSON.stringify(t.body));
    } catch {
    }
    const headers = forwardHeaders(req.headers);
    if (req.method !== "GET" && req.method !== "HEAD") headers["content-length"] = Buffer.byteLength(sendBody);
    const qs = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
    let up;
    try {
      up = await fetch(upstream.target + qs, { method: req.method, headers, body: req.method === "GET" || req.method === "HEAD" ? void 0 : sendBody });
    } catch {
      return json(res, 502, { error: { message: "TokenBrake could not reach the provider (not charged)." } });
    }
    const outHeaders = {};
    up.headers.forEach((v, k) => {
      if (!/^(content-encoding|content-length|transfer-encoding)$/i.test(k)) outHeaders[k] = v;
    });
    res.writeHead(up.status, outHeaders);
    if (isStream && up.body) {
      let acc = "";
      const dec = new TextDecoder();
      const reader = up.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
        acc += dec.decode(value, { stream: true });
      }
      res.end();
      meterAndRecord(agent, model, usageFromStream(acc));
    } else {
      const buf = Buffer.from(await up.arrayBuffer());
      res.end(buf);
      try {
        meterAndRecord(agent, model, JSON.parse(buf.toString()));
      } catch {
      }
    }
  } catch (e) {
    if (e && e.tooLarge) {
      if (!res.headersSent) {
        try {
          json(res, 413, { error: { message: "TokenBrake: request body too large" } });
        } catch {
        }
      }
      try {
        req.destroy();
      } catch {
      }
      return;
    }
    if (!res.headersSent) {
      try {
        json(res, 500, { error: { message: "TokenBrake: internal error" } });
      } catch {
      }
    }
    try {
      res.end();
    } catch {
    }
  }
});
server.listen(PORT, () => {
  console.log(`TokenBrake Server \u2192 http://localhost:${PORT}`);
  console.log(`  dashboard: http://localhost:${PORT}/   \xB7   proxy: /openai /anthropic /xai /groq /deepseek /mistral /gemini /openrouter`);
  console.log(KEY ? "  secured with TB_KEY \u2713" : "  \u26A0 TB_KEY not set \u2014 open to anyone. Set TB_KEY before exposing this.");
  const seatTxt = PLAN.seats > 0 ? `${PLAN.seats} agents` : "unlimited agents";
  console.log(`  plan: ${PLAN.tier} (${seatTxt})${PLAN.licensed ? " \xB7 licensed \u2713" : " \xB7 free/unlicensed \u2014 set TB_LICENSE to unlock more seats"}`);
});
