// TokenBrake — read sales straight off the Base chain. Every purchase is a USDC transfer to our
// wallet, so the blockchain IS our durable sales ledger — no database to run or lose. We list
// recent transfers via a public RPC (best-effort window), or the FULL history if an Alchemy URL
// is configured (ALCHEMY_URL). Either way we never store anything ourselves.
const USDC_BASE = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const TRANSFER  = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const pad = a => "0x" + String(a).toLowerCase().replace(/^0x/, "").padStart(64, "0");

async function rpc(url, method, params) {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message || "rpc error");
  return j.result;
}

// Full history via Alchemy's asset-transfers index (one paginated call). Dormant unless ALCHEMY_URL set.
async function viaAlchemy(url, wallet) {
  const out = []; let pageKey;
  do {
    const params = [{ toAddress: wallet, contractAddresses: [USDC_BASE], category: ["erc20"], withMetadata: true, maxCount: "0x3e8", order: "desc", ...(pageKey ? { pageKey } : {}) }];
    const res = await rpc(url, "alchemy_getAssetTransfers", params);
    for (const t of res.transfers || []) {
      out.push({ txHash: t.hash, from: t.from, amount: Number(t.value) || 0, at: t.metadata && t.metadata.blockTimestamp });
    }
    pageKey = res.pageKey;
  } while (pageKey && out.length < 2000);
  return { sales: out, full: true };
}

// Best-effort recent window via a public RPC's eth_getLogs, chunked to fit a serverless timeout.
async function viaPublicRpc(url, wallet, lookbackBlocks) {
  const latest = parseInt(await rpc(url, "eth_blockNumber", []), 16);
  const CHUNK = 9000, MAX_CHUNKS = 20;                       // ~180k blocks ≈ a few days on Base
  const span = Math.min(lookbackBlocks, CHUNK * MAX_CHUNKS);
  const start = Math.max(0, latest - span);
  const out = [];
  for (let from = start; from <= latest; from += CHUNK + 1) {
    const to = Math.min(from + CHUNK, latest);
    let logs;
    try { logs = await rpc(url, "eth_getLogs", [{ address: USDC_BASE, topics: [TRANSFER, null, pad(wallet)], fromBlock: "0x" + from.toString(16), toBlock: "0x" + to.toString(16) }]); }
    catch { continue; }
    for (const lg of logs || []) {
      out.push({ txHash: lg.transactionHash, from: "0x" + (lg.topics[1] || "").slice(-40), amount: Number(BigInt(lg.data)) / 1e6, block: parseInt(lg.blockNumber, 16) });
    }
  }
  out.sort((a, b) => (b.block || 0) - (a.block || 0));
  return { sales: out, full: false, scannedFromBlock: start };
}

export async function getSales({ wallet, lookbackBlocks = 180000 } = {}) {
  const alchemy = process.env.ALCHEMY_URL;
  const publicRpc = process.env.TB_RPC || "https://mainnet.base.org";
  if (alchemy) return viaAlchemy(alchemy, wallet);
  return viaPublicRpc(publicRpc, wallet, lookbackBlocks);
}
