// TokenBrake — on-chain payment verification. Given a Base transaction hash, confirm it was a
// real, mined, successful USDC transfer to OUR wallet for at least the price. Uses only PUBLIC
// chain data (a public RPC) — no keys, no account, no third party. Receiving is trustless.
const USDC_BASE = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";                 // USDC on Base
const TRANSFER  = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"; // Transfer(address,address,uint256)
const pad = a => "0x" + String(a).toLowerCase().replace(/^0x/, "").padStart(64, "0");

async function rpc(method, params, url) {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message || "rpc error");
  return j.result;
}

// Returns { paid, amount, from, reason }. NOTE: the caller must also record used tx hashes so one
// payment can't be redeemed twice (replay protection lives in the license-issuing endpoint).
export async function verifyUsdcPayment(txHash, payee, minUsdc, opts = {}) {
  const url = opts.rpc || "https://mainnet.base.org";
  const usdc = (opts.token || USDC_BASE).toLowerCase();
  const payTo = pad(payee);
  const minConf = opts.minConfirmations ?? 2;
  if (!/^0x[0-9a-fA-F]{64}$/.test(String(txHash))) return { paid: false, reason: "not a valid transaction hash" };

  let rcpt;
  try { rcpt = await rpc("eth_getTransactionReceipt", [txHash], url); } catch { return { paid: false, reason: "could not reach the network — try again" }; }
  if (!rcpt) return { paid: false, reason: "transaction not found yet (still pending?)" };
  if (rcpt.status !== "0x1") return { paid: false, reason: "that transaction failed on-chain" };

  // require a couple confirmations so a just-broadcast tx can't be spoofed then reorged out
  if (minConf > 0) {
    try {
      const head = parseInt(await rpc("eth_blockNumber", [], url), 16);
      const txBlock = parseInt(rcpt.blockNumber, 16);
      if (head - txBlock < minConf) return { paid: false, reason: `only ${head - txBlock} confirmation(s) — wait a moment and retry` };
    } catch {}
  }

  for (const log of rcpt.logs || []) {
    if ((log.address || "").toLowerCase() !== usdc) continue;             // must be the USDC contract
    if ((log.topics || [])[0]?.toLowerCase() !== TRANSFER) continue;      // must be a Transfer
    if ((log.topics[2] || "").toLowerCase() !== payTo) continue;          // must be TO our wallet
    const usdcAmt = Number(BigInt(log.data)) / 1e6;                       // USDC has 6 decimals
    if (usdcAmt + 1e-9 >= Number(minUsdc)) {
      const from = "0x" + (log.topics[1] || "").slice(-40);
      return { paid: true, amount: Math.round(usdcAmt * 100) / 100, from, txHash };
    }
  }
  return { paid: false, reason: "no USDC payment to our wallet for the required amount was found in that transaction" };
}
