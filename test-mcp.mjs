// End-to-end test of the TokenBrake MCP server.
//
// This talks real JSON-RPC over stdio to server/mcp.mjs, against a real TokenBrake server on a
// scratch HOME, and asserts on what an MCP client would actually receive. We're about to put this
// in front of the MCP community, so "it probably works" isn't good enough — a broken server in a
// public registry costs more than not being listed at all.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const HOME = mkdtempSync(join(tmpdir(), "tb-mcp-"));
const PORT = 8921;
const TB_URL = `http://localhost:${PORT}`;

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name + (extra ? "  → " + extra : "")); }
};

// --- boot a real TokenBrake server on a scratch HOME ---
const srv = spawn(process.execPath, [join(__dir, "server", "app.mjs")], {
  env: { ...process.env, HOME, TB_PORT: String(PORT), TB_KEY: "" },
  stdio: ["ignore", "pipe", "pipe"],
});
await new Promise(r => setTimeout(r, 2500));

// --- start the MCP server, wired at that TokenBrake ---
const mcp = spawn(process.execPath, [join(__dir, "server", "mcp.mjs")], {
  env: { ...process.env, TB_URL, TB_KEY: "" },
  stdio: ["pipe", "pipe", "pipe"],
});

let buf = "";
const waiters = new Map();
mcp.stdout.on("data", d => {
  buf += d.toString();
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
    if (!line) continue;
    let msg; try { msg = JSON.parse(line); } catch { continue; }
    const w = waiters.get(msg.id);
    if (w) { waiters.delete(msg.id); w(msg); }
  }
});

let nextId = 1;
const rpc = (method, params) => new Promise((resolve, reject) => {
  const id = nextId++;
  waiters.set(id, resolve);
  mcp.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  setTimeout(() => { if (waiters.has(id)) { waiters.delete(id); reject(new Error("timeout on " + method)); } }, 8000);
});
const textOf = r => (r.result && r.result.content && r.result.content[0] && r.result.content[0].text) || "";

const cleanup = () => { try { mcp.kill(); } catch {} try { srv.kill(); } catch {} try { rmSync(HOME, { recursive: true, force: true }); } catch {} };

try {
  console.log("HANDSHAKE:");
  {
    const r = await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } });
    ok("initialize returns a protocolVersion", !!r.result?.protocolVersion);
    ok("advertises tools capability", !!r.result?.capabilities?.tools);
    ok("identifies itself as tokenbrake", r.result?.serverInfo?.name === "tokenbrake", JSON.stringify(r.result?.serverInfo));
  }
  {
    const r = await rpc("ping", {});
    ok("responds to ping", !!r.result && !r.error);
  }

  console.log("TOOL DISCOVERY:");
  let tools = [];
  {
    const r = await rpc("tools/list", {});
    tools = r.result?.tools || [];
    ok("lists 3 tools", tools.length === 3, "got " + tools.length);
    ok("every tool has a name, description and inputSchema",
      tools.every(t => t.name && t.description && t.inputSchema && t.inputSchema.type === "object"));
    ok("schemas declare their required fields",
      tools.find(t => t.name === "tokenbrake_set_budget")?.inputSchema?.required?.includes("name"));
  }

  console.log("TOOL CALLS (against a live TokenBrake):");
  {
    const r = await rpc("tools/call", { name: "tokenbrake_check_meter", arguments: {} });
    ok("check_meter succeeds on an empty ledger", textOf(r).length > 0 && !r.result?.isError, textOf(r));
  }
  {
    const r = await rpc("tools/call", { name: "tokenbrake_set_budget", arguments: { name: "test-agent", budget: 25, mode: "hard" } });
    const t = textOf(r);
    ok("set_budget applies the budget", /test-agent/.test(t) && /25/.test(t), t);
    ok("set_budget reports the mode back", /hard/.test(t), t);
  }
  {
    const r = await rpc("tools/call", { name: "tokenbrake_check_meter", arguments: {} });
    ok("the budget persisted and shows in the meter", /test-agent/.test(textOf(r)), textOf(r));
  }
  {
    const r = await rpc("tools/call", { name: "tokenbrake_set_budget", arguments: { name: "test-agent", budget: 25, mode: "off" } });
    ok("a cap can be turned off", /off/.test(textOf(r)), textOf(r));
  }
  {
    const r = await rpc("tools/call", { name: "tokenbrake_set_alerts", arguments: { name: "test-agent", thresholds: [1.0, 1.25] } });
    ok("set_alerts accepts custom thresholds", /125%|100%/.test(textOf(r)), textOf(r));
  }

  console.log("ERROR HANDLING (what a confused model will actually do):");
  {
    const r = await rpc("tools/call", { name: "no_such_tool", arguments: {} });
    ok("unknown tool returns an isError result, not a crash", r.result?.isError === true, JSON.stringify(r).slice(0, 120));
  }
  {
    const r = await rpc("nonsense/method", {});
    ok("unknown method returns JSON-RPC -32601", r.error?.code === -32601, JSON.stringify(r).slice(0, 120));
  }
  {
    mcp.stdin.write("this is not json\n");
    const r = await rpc("ping", {});
    ok("garbage input doesn't kill the server", !!r.result);
  }
  {
    mcp.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
    const r = await rpc("ping", {});
    ok("a notification is accepted silently and the server survives", !!r.result);
  }

  console.log("OFFLINE BEHAVIOUR (TokenBrake not running):");
  {
    const lonely = spawn(process.execPath, [join(__dir, "server", "mcp.mjs")], {
      env: { ...process.env, TB_URL: "http://localhost:59999", TB_KEY: "" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let lbuf = "", got = null;
    lonely.stdout.on("data", d => { lbuf += d.toString(); const i = lbuf.indexOf("\n"); if (i >= 0 && !got) { try { got = JSON.parse(lbuf.slice(0, i)); } catch {} } });
    lonely.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "tokenbrake_check_meter", arguments: {} } }) + "\n");
    await new Promise(r => setTimeout(r, 3000));
    ok("a dead TokenBrake yields a readable error, not a hang or crash",
      !!got && (got.result?.isError === true || /could not|error/i.test(JSON.stringify(got))), JSON.stringify(got).slice(0, 140));
    try { lonely.kill(); } catch {}
  }
} catch (e) {
  fail++; console.log("  ✗ harness error: " + e.message);
}

cleanup();
console.log("");
console.log(fail === 0 ? `✅ ALL ${pass} MCP TESTS PASS` : `❌ ${fail} FAILED (${pass} passed)`);
process.exit(fail === 0 ? 0 : 1);
