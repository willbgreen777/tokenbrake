// TokenBrake — admin sales view. Reads every USDC payment to our wallet from the Base chain and
// re-derives each buyer's license key (keys are deterministic from the tx hash). Admin-only: set
// TB_ADMIN_KEY and pass it as ?key= or the x-tb-admin header. Two modes:
//   GET /api/sales            -> list recent sales (full history if ALCHEMY_URL is set)
//   GET /api/sales?tx=0x...    -> look up ONE payment and re-issue its key (to resend to a buyer)
import crypto from "node:crypto";
import { getSales } from "./_lib/sales.js";
import { issueLicense } from "./_lib/license.js";
import { verifyUsdcPayment } from "./_lib/payment.js";

const WALLET = process.env.TB_PAYEE || "";
const ADMIN = process.env.TB_ADMIN_KEY || "";
const PLANS = [ { min: 490, tier: "business", label: "Business" }, { min: 99, tier: "solo", label: "Solo" } ];
const DAYS = 365;

const send = (res, s, o) => { res.setHeader("content-type", "application/json"); res.setHeader("cache-control", "no-store"); res.status(s).end(JSON.stringify(o)); };
const planFor = amt => PLANS.find(p => amt + 1e-9 >= p.min) || { tier: null, label: "underpaid" };
const timingEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

function decorate(sale) {
  const p = planFor(sale.amount);
  const license = p.tier ? issueLicense({ ref: sale.txHash, tier: p.tier, days: DAYS }) : null;
  return { txHash: sale.txHash, from: sale.from, amount: sale.amount, plan: p.label, tier: p.tier, license, at: sale.at || null, block: sale.block || null };
}

export default async function handler(req, res) {
  if (!ADMIN) return send(res, 503, { ok: false, reason: "Sales view not enabled — set TB_ADMIN_KEY." });
  if (!/^0x[0-9a-fA-F]{40}$/.test(WALLET)) return send(res, 503, { ok: false, reason: "No receiving wallet configured." });

  const url = new URL(req.url, "http://x");
  const key = req.headers["x-tb-admin"] || url.searchParams.get("key") || "";
  if (!timingEq(key, ADMIN)) return send(res, 401, { ok: false, reason: "Bad admin key." });

  // single-transaction lookup — the "resend a buyer's key" tool
  const tx = url.searchParams.get("tx");
  if (tx) {
    if (!/^0x[0-9a-fA-F]{64}$/.test(tx)) return send(res, 400, { ok: false, reason: "Not a valid transaction hash." });
    let r; try { r = await verifyUsdcPayment(tx, WALLET, 99); } catch { return send(res, 502, { ok: false, reason: "Couldn't reach the chain — retry." }); }
    if (!r.paid) return send(res, 404, { ok: false, reason: r.reason || "No qualifying payment found in that transaction." });
    return send(res, 200, { ok: true, sale: decorate({ txHash: tx, from: r.from, amount: r.amount }) });
  }

  // list mode
  try {
    const { sales, full, scannedFromBlock } = await getSales({ wallet: WALLET });
    const decorated = sales.map(decorate);
    const revenue = Math.round(decorated.reduce((s, d) => s + (d.amount || 0), 0) * 100) / 100;
    return send(res, 200, { ok: true, count: decorated.length, revenue, full: !!full, scannedFromBlock: scannedFromBlock ?? null, sales: decorated });
  } catch (e) {
    return send(res, 502, { ok: false, reason: "Couldn't read sales from the chain — retry, or set ALCHEMY_URL for full history." });
  }
}
