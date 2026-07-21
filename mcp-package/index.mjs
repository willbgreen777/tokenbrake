#!/usr/bin/env node
// TokenBrake MCP server — lets any MCP-aware AI tool (Claude Desktop, Cursor, etc.) operate a
// customer's TokenBrake meter directly: check spend, set budgets, set alert thresholds. Zero
// dependencies — a plain JSON-RPC-over-stdio server. It just calls the TokenBrake HTTP API.
//
// Configure via env:  TB_URL (default http://localhost:8788)  ·  TB_KEY (your TokenBrake key)
// Example MCP config entry:
//   { "command": "node", "args": ["server/mcp.mjs"], "env": { "TB_URL": "http://localhost:8788", "TB_KEY": "..." } }
import readline from "node:readline";

const TB_URL = (process.env.TB_URL || "http://localhost:8788").replace(/\/+$/, "");
const TB_KEY = process.env.TB_KEY || "";
const H = { "content-type": "application/json", ...(TB_KEY ? { "x-tokenbrake-key": TB_KEY } : {}) };

const TOOLS = [
  {
    name: "tokenbrake_check_meter",
    description: "Read current AI API spend across every agent/project this month: spend, budget, mode, and call counts.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "tokenbrake_set_budget",
    description: "Set or change an agent's monthly budget and cap mode. mode 'hard' stops calls at the budget (circuit breaker), 'soft' warns but keeps running, 'off' removes the cap. Turn a cap OFF with 'off' and back ON with 'hard'.",
    inputSchema: { type: "object", properties: { name: { type: "string", description: "agent/project name" }, budget: { type: "number", description: "USD per month" }, mode: { type: "string", enum: ["hard", "soft", "off"] } }, required: ["name", "budget"], additionalProperties: false },
  },
  {
    name: "tokenbrake_set_alerts",
    description: "Choose when to be notified for an agent. thresholds are fractions of budget (1.0 = 100%, 1.25 = 125%). Optional webhook URL (applies server-wide) is POSTed when a threshold is crossed.",
    inputSchema: { type: "object", properties: { name: { type: "string" }, thresholds: { type: "array", items: { type: "number" } }, webhook: { type: "string" } }, required: ["name"], additionalProperties: false },
  },
];

const send = msg => process.stdout.write(JSON.stringify(msg) + "\n");
const reply = (id, result) => send({ jsonrpc: "2.0", id, result });
const fail = (id, code, message) => send({ jsonrpc: "2.0", id, error: { code, message } });
const text = t => ({ content: [{ type: "text", text: t }] });

async function callTool(name, args) {
  if (name === "tokenbrake_check_meter") {
    const r = await fetch(TB_URL + "/api/stats", { headers: H });
    if (!r.ok) return text(`Could not read the meter (HTTP ${r.status}). Check TB_URL and TB_KEY.`);
    const d = await r.json();
    const agents = d.agents || [];
    const total = agents.reduce((s, a) => s + (a.spend || 0), 0);
    if (!agents.length) return text(`No spend yet this ${d.period}. Total $0.00.`);
    const lines = agents.map(a => `• ${a.name}: $${(a.spend || 0).toFixed(2)}${a.budget > 0 ? ` / $${a.budget} (${a.mode})` : " (no budget)"} · ${a.calls} calls`);
    const plan = d.plan ? `\nPlan: ${d.plan.tier}, ${d.plan.used}/${d.plan.seats || "∞"} agents${d.plan.over ? " (over plan)" : ""}.` : "";
    return text(`TokenBrake — ${d.period}: total $${total.toFixed(2)} across ${agents.length} agent(s).\n${lines.join("\n")}${plan}`);
  }
  if (name === "tokenbrake_set_budget") {
    const r = await fetch(TB_URL + "/api/budget", { method: "POST", headers: H, body: JSON.stringify({ name: args.name, budget: args.budget, mode: args.mode || "hard" }) });
    if (!r.ok) return text(`Could not set the budget (HTTP ${r.status}).`);
    const d = await r.json();
    return text(`Budget for "${d.name}" set to $${d.budget}/mo, mode "${d.mode}". Spent so far: $${(d.spend || 0).toFixed(2)}.`);
  }
  if (name === "tokenbrake_set_alerts") {
    const r = await fetch(TB_URL + "/api/alerts", { method: "POST", headers: H, body: JSON.stringify({ name: args.name, thresholds: args.thresholds, webhook: args.webhook }) });
    if (!r.ok) return text(`Could not update alerts (HTTP ${r.status}).`);
    const d = await r.json();
    const t = d.agent && d.agent.alerts ? JSON.parse(d.agent.alerts).map(x => Math.round(x * 100) + "%").join(", ") : "default (80%, 100%)";
    return text(`Alerts for "${args.name}" set to: ${t}.${d.webhook ? ` Webhook active.` : ""}`);
  }
  throw new Error("unknown tool: " + name);
}

const rl = readline.createInterface({ input: process.stdin });
rl.on("line", async raw => {
  const line = raw.trim();
  if (!line) return;
  let msg; try { msg = JSON.parse(line); } catch { return; }
  const { id, method, params } = msg;
  try {
    if (method === "initialize") {
      reply(id, { protocolVersion: (params && params.protocolVersion) || "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "tokenbrake", version: "1.0.0" } });
    } else if (method === "tools/list") {
      reply(id, { tools: TOOLS });
    } else if (method === "tools/call") {
      const { name, arguments: args } = params || {};
      try { reply(id, await callTool(name, args || {})); }
      catch (e) { reply(id, { ...text("Error: " + e.message), isError: true }); }
    } else if (method === "ping") {
      reply(id, {});
    } else if (method && method.startsWith("notifications/")) {
      // notifications carry no id and need no response
    } else if (id !== undefined) {
      fail(id, -32601, "Method not found: " + method);
    }
  } catch (e) { if (id !== undefined) fail(id, -32603, String(e && e.message || e)); }
});
