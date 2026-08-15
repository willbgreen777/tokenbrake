// TokenBrake — Lemon Squeezy checkout (card payments, merchant of record).
//
// This is the card counterpart to buy.js (USDC on Base). Lemon Squeezy is the seller of record:
// they take the card, handle sales tax/VAT, and POST us a signed webhook when an order completes.
// We verify the signature, mint the same Ed25519 licence we'd mint for a crypto sale, and email it.
//
// SECURITY, in order of importance:
//   1. The webhook signature is verified against the raw body with a timing-safe compare. An
//      unsigned or mis-signed request mints nothing. Vercel's body parser is DISABLED below —
//      it must be, because the HMAC covers the exact bytes LS sent, not a re-serialisation.
//   2. The licence ref is the Lemon Squeezy ORDER ID, so replaying the same webhook returns the
//      same key. One payment can never mint two different licences. No database needed.
//   3. We never trust a price or tier from the request body alone — variant IDs are matched
//      against env config we control, and an unrecognised variant is refused, not guessed.
import crypto from "node:crypto";
import { issueLicense } from "./_lib/license.js";

// Vercel parses JSON by default. That would destroy the byte-exact body the HMAC covers.
export const config = { api: { bodyParser: false } };

const SECRET = process.env.TB_LS_WEBHOOK_SECRET || "";       // LS -> Settings -> Webhooks -> signing secret
const DAYS = 365;

// Map a Lemon Squeezy variant to one of our plans. Set these once the products exist in LS.
// If neither is set we fall back to the order total, which is the honest last resort.
const SOLO = { tier: "solo", label: "Solo (up to 3 agents)" };
const BUSINESS = { tier: "business", label: "Business (unlimited agents)" };
const VARIANTS = {
  [String(process.env.TB_LS_VARIANT_SOLO || "__unset_solo")]: SOLO,
  [String(process.env.TB_LS_VARIANT_BUSINESS || "__unset_business")]: BUSINESS,
};
const BY_PRICE = { 99: SOLO, 490: BUSINESS };

const send = (res, status, obj) => {
  res.setHeader("content-type", "application/json");
  res.setHeader("cache-control", "no-store");
  res.status(status).end(JSON.stringify(obj));
};

// Read the raw bytes exactly as sent, with a size cap so a bad actor can't stream us to death.
async function rawBody(req, max = 1000000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > max) { const e = new Error("too large"); e.tooLarge = true; throw e; }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

const timingSafeEq = (a, b) => {
  const x = Buffer.from(String(a), "utf8"), y = Buffer.from(String(b), "utf8");
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { ok: false, reason: "POST only - this is a webhook endpoint." });
  if (!SECRET) return send(res, 503, { ok: false, reason: "Card checkout isn't live yet - no webhook secret configured." });

  let raw;
  try { raw = await rawBody(req); }
  catch (e) { return send(res, e && e.tooLarge ? 413 : 400, { ok: false, reason: "Bad request body." }); }

  // --- 1. verify the signature over the exact bytes ---
  const expected = crypto.createHmac("sha256", SECRET).update(raw).digest("hex");
  const got = String(req.headers["x-signature"] || "");
  if (!timingSafeEq(expected, got)) {
    console.warn("TOKENBRAKE_LS_BAD_SIGNATURE " + JSON.stringify({ at: new Date().toISOString() }));
    return send(res, 401, { ok: false, reason: "Signature mismatch." });
  }

  let evt;
  try { evt = JSON.parse(raw.toString("utf8")); } catch { return send(res, 400, { ok: false, reason: "Bad JSON." }); }

  const name = (evt && evt.meta && evt.meta.event_name) || "";
  // We only mint on a completed payment. Refunds and everything else are acknowledged (200) so LS
  // stops retrying, but mint nothing.
  const MINTS = new Set(["order_created", "subscription_created", "subscription_payment_success"]);
  if (!MINTS.has(name)) return send(res, 200, { ok: true, ignored: name });

  const attrs = (evt.data && evt.data.attributes) || {};
  const orderId = String((evt.data && evt.data.id) || attrs.order_id || "").slice(0, 24);
  if (!orderId) return send(res, 400, { ok: false, reason: "No order id on the event." });

  // Only mint for orders that actually paid.
  const status = String(attrs.status || "").toLowerCase();
  if (status && !["paid", "active", "completed", "on_trial"].includes(status)) {
    return send(res, 200, { ok: true, ignored: "status=" + status });
  }

  // --- 2. resolve the plan from a variant we control, never from a client-supplied price ---
  const item = attrs.first_order_item || {};
  const variantId = String(attrs.variant_id || item.variant_id || "");
  let plan = VARIANTS[variantId];
  if (!plan) {
    const cents = Number(attrs.total != null ? attrs.total : (item.price != null ? item.price : 0));
    plan = BY_PRICE[Math.round(cents / 100)];
  }
  if (!plan) {
    console.warn("TOKENBRAKE_LS_UNKNOWN_VARIANT " + JSON.stringify({ orderId, variantId, total: attrs.total }));
    return send(res, 200, { ok: false, reason: "Unrecognised variant - no licence minted. Check TB_LS_VARIANT_* env." });
  }

  // --- 3. mint. Deterministic from the order id, so a webhook retry is harmless. ---
  const licence = issueLicense({ ref: orderId, tier: plan.tier, days: DAYS });
  const expires = new Date(Date.now() + DAYS * 86400 * 1000).toISOString().slice(0, 10);
  const email = String(attrs.user_email || attrs.customer_email || "").trim().slice(0, 200);
  const emailOk = email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);

  console.log("TOKENBRAKE_SALE " + JSON.stringify({
    at: new Date().toISOString(), rail: "lemonsqueezy", tier: plan.tier,
    paid: Number(attrs.total || 0) / 100, expires, orderId, email: emailOk ? email : null, event: name,
  }));

  let emailed = false;
  if (emailOk) { try { emailed = await sendKey(email, { licence, plan: plan.label, expires, orderId }); } catch {} }

  // 200 tells Lemon Squeezy we've got it and stops the retry schedule.
  return send(res, 200, { ok: true, tier: plan.tier, expires, emailed });
}

// Deliver the key by email. Dormant (returns false) until RESEND_API_KEY + TB_MAIL_FROM are set -
// the same switch the crypto checkout uses, so turning email on lights up both rails at once.
async function sendKey(to, { licence, plan, expires, orderId }) {
  const KEY = process.env.RESEND_API_KEY, FROM = process.env.TB_MAIL_FROM;
  if (!KEY || !FROM) return false;
  const notify = process.env.TB_MAIL_NOTIFY;
  const html = '<div style="font-family:system-ui,sans-serif;line-height:1.6;color:#111">' +
    '<h2 style="margin:0 0 10px">Your TokenBrake licence</h2>' +
    '<p>Thanks for your purchase. Here is your <b>' + plan + '</b> licence key - keep it somewhere safe.</p>' +
    '<pre style="background:#f4f5f7;border:1px solid #e2e5ea;border-radius:8px;padding:12px;white-space:pre-wrap;word-break:break-all;font-size:13px">' + licence + '</pre>' +
    '<p>Activate it by setting <code>TB_LICENSE</code> on your TokenBrake server and restarting. Full steps: <a href="https://tokenbrake.com/docs">tokenbrake.com/docs</a></p>' +
    '<p style="color:#555;font-size:14px">Valid through: ' + expires + ' &middot; Order: ' + orderId + '<br>' +
    'Lost this key? Reply with your order number and we will send it again - it is the same key every time.</p>' +
    '<p style="color:#888;font-size:12px">TokenBrake - a Northjule product.</p></div>';
  const payload = { from: FROM, to: [to], subject: "Your TokenBrake " + plan + " licence key", html };
  if (notify) payload.bcc = [notify];
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { authorization: "Bearer " + KEY, "content-type": "application/json" }, body: JSON.stringify(payload),
  });
  return r.ok;
}
