// TokenBrake — crypto checkout. GET returns the public config (wallet, prices) so the static
// page can show the right address; POST verifies a USDC-on-Base payment on-chain and, if it
// paid enough, mints a signed annual license key. No database: the key is deterministic from the
// tx hash (issueLicense ref = txHash), so submitting the same tx always returns the same key —
// idempotent, and one payment can't mint two different keys.
import { verifyUsdcPayment } from "./_lib/payment.js";
import { issueLicense } from "./_lib/license.js";

// annual prices in USDC. Business "unlimited" = seats 0 (set by tier default in license.js).
const PLANS = {
  solo:     { price: 99,  tier: "solo",     label: "Solo (up to 3 agents)" },
  business: { price: 490, tier: "business", label: "Business (unlimited agents)" },
};
const DAYS = 365;                                  // annual — crypto can't auto-renew
const WALLET = process.env.TB_PAYEE || "";         // OUR USDC-on-Base receiving address (set in Vercel)

function send(res, status, obj) {
  res.setHeader("content-type", "application/json");
  res.setHeader("cache-control", "no-store");
  res.status(status).end(JSON.stringify(obj));
}

export default async function handler(req, res) {
  const configured = /^0x[0-9a-fA-F]{40}$/.test(WALLET);

  if (req.method === "GET") {
    // Card checkout (Lemon Squeezy, merchant of record) lights up as soon as the hosted checkout
    // URLs are set in the environment. Until then the page shows crypto only, with no dead buttons.
    const card = {
      solo: process.env.TB_LS_CHECKOUT_SOLO || null,
      business: process.env.TB_LS_CHECKOUT_BUSINESS || null,
    };
    return send(res, 200, {
      network: "Base", asset: "USDC", period: "annual", days: DAYS,
      wallet: configured ? WALLET : null,
      configured,
      card,
      cardConfigured: Boolean(card.solo || card.business),
      plans: Object.fromEntries(Object.entries(PLANS).map(([k, p]) => [k, { price: p.price, label: p.label }])),
    });
  }

  if (req.method !== "POST") return send(res, 405, { ok: false, reason: "POST a { plan, txHash } to buy." });
  if (!configured) return send(res, 503, { ok: false, reason: "Checkout isn't live yet — no receiving wallet configured." });

  // parse body (Vercel may pass it parsed or raw)
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  if (!body || typeof body !== "object") body = {};

  const plan = PLANS[String(body.plan || "").toLowerCase()];
  const txHash = String(body.txHash || "").trim();
  const email = String(body.email || "").trim().slice(0, 200);   // optional
  const emailOk = email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
  if (!plan) return send(res, 400, { ok: false, reason: "Pick a plan: solo or business." });
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) return send(res, 400, { ok: false, reason: "Paste your Base transaction hash (0x…, 64 hex chars)." });

  let result;
  try { result = await verifyUsdcPayment(txHash, WALLET, plan.price); }
  catch { return send(res, 502, { ok: false, reason: "Couldn't reach the network to verify — wait a moment and retry." }); }

  if (!result.paid) return send(res, 402, { ok: false, reason: result.reason || "Payment not verified." });

  // Verified. Mint the annual key, keyed to the tx hash so it's idempotent + non-forgeable.
  const license = issueLicense({ ref: txHash, tier: plan.tier, days: DAYS });
  const expires = new Date(Date.now() + DAYS * 86400 * 1000).toISOString().slice(0, 10);

  // A record of every sale, as a structured log line (queryable via `vercel logs`). No customer
  // content — just what's needed to reconcile a purchase. The tx hash IS the receipt.
  console.log("TOKENBRAKE_SALE " + JSON.stringify({
    at: new Date().toISOString(), tier: plan.tier, paid: result.amount, expires,
    txHash, from: result.from, email: emailOk ? email : null,
  }));

  // Email the key if a mail provider is configured (dormant until RESEND_API_KEY is set).
  let emailed = false;
  if (emailOk) { try { emailed = await sendReceipt(email, { license, plan: plan.label, paid: result.amount, expires }); } catch {} }

  return send(res, 200, { ok: true, license, tier: plan.tier, plan: plan.label, paid: result.amount, expires, emailed });
}

// Send the license by email via Resend. Returns false (silently) unless RESEND_API_KEY + a from
// address are configured, so the checkout works fine with email off and lights up when it's on.
async function sendReceipt(to, { license, plan, paid, expires }) {
  const KEY = process.env.RESEND_API_KEY, FROM = process.env.TB_MAIL_FROM;
  if (!KEY || !FROM) return false;
  const notify = process.env.TB_MAIL_NOTIFY;                 // optional: bcc the owner a sale copy
  const html = `<div style="font-family:system-ui,sans-serif;line-height:1.6;color:#111">
    <h2 style="margin:0 0 10px">Your TokenBrake license</h2>
    <p>Thanks for your purchase. Here's your <b>${plan}</b> license key — keep it somewhere safe.</p>
    <pre style="background:#f4f5f7;border:1px solid #e2e5ea;border-radius:8px;padding:12px;white-space:pre-wrap;word-break:break-all;font-size:13px">${license}</pre>
    <p>Activate it by setting <code>TB_LICENSE</code> on your TokenBrake server and restarting. Full steps: <a href="https://tokenbrake.com/docs">tokenbrake.com/docs</a></p>
    <p style="color:#555;font-size:14px">Paid: $${paid} USDC · Valid through: ${expires}<br>
    Lost this key? Re-enter your payment transaction at <a href="https://tokenbrake.com/pricing">tokenbrake.com/pricing</a> and you'll get the same key back.</p>
    <p style="color:#888;font-size:12px">TokenBrake — a Northjule product.</p></div>`;
  const payload = { from: FROM, to: [to], subject: `Your TokenBrake ${plan} license key`, html };
  if (notify) payload.bcc = [notify];
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { authorization: "Bearer " + KEY, "content-type": "application/json" }, body: JSON.stringify(payload),
  });
  return r.ok;
}
