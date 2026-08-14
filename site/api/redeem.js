// TokenBrake — redeem a Gumroad purchase for a TokenBrake commercial licence key.
//
// The flow, end to end:
//   1. Customer buys the commercial licence on Gumroad (card, normal checkout, any country).
//   2. Gumroad shows them a licence key on the receipt and emails it to them.
//   3. They paste that key here.
//   4. We check it with Gumroad's public verify endpoint.
//   5. If it's a real, un-refunded purchase, we mint a signed TokenBrake key and show it.
//
// Nobody has to do anything by hand. There is no database, no email service to configure, and
// no webhook secret: the TokenBrake key is derived deterministically from the Gumroad key, so
// redeeming the same purchase always returns the same licence. That makes this idempotent and
// makes "I lost my key" a self-service problem — they just paste the Gumroad key again.
//
// Why keep our own Ed25519 key format instead of just using Gumroad's? Because ours verifies
// OFFLINE. A customer's TokenBrake install never phones home, never needs network at start-up,
// and keeps working if Gumroad is down or we disappear. Gumroad is the till, not the lock.

import crypto from "node:crypto";
import { verifyGumroadLicense } from "./_lib/gumroad.js";
import { issueLicense } from "./_lib/license.js";

const PRODUCT_ID = process.env.TB_GUMROAD_PRODUCT_ID || "";
const BUY_URL    = process.env.TB_GUMROAD_URL || "";

function send(res, status, obj) {
  res.setHeader("content-type", "application/json");
  res.setHeader("cache-control", "no-store");
  res.status(status).end(JSON.stringify(obj));
}

export default async function handler(req, res) {
  const configured = Boolean(PRODUCT_ID);

  // GET → what the static page needs to render itself. No secrets here.
  if (req.method === "GET") {
    return send(res, 200, {
      configured,
      buyUrl: BUY_URL || null,
      price: 249,
      currency: "USD",
      term: "one-time",
      what: "Commercial licence — one company, unlimited machines and agents, no renewal.",
    });
  }

  if (req.method !== "POST") {
    return send(res, 405, { ok: false, reason: "POST { key } to redeem a Gumroad purchase." });
  }
  if (!configured) {
    return send(res, 503, { ok: false, reason: "Checkout isn't live yet." });
  }

  // Vercel may hand us the body parsed or raw.
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  if (!body || typeof body !== "object") body = {};

  const gumroadKey = String(body.key || "").trim();
  if (!gumroadKey) {
    return send(res, 400, { ok: false, reason: "Paste the licence key from your Gumroad receipt." });
  }

  const check = await verifyGumroadLicense(gumroadKey, PRODUCT_ID);
  if (!check.valid) {
    // 402 for "we understood you, you just haven't got a valid purchase"; 400 for malformed.
    const status = check.refunded ? 403 : 402;
    return send(res, status, { ok: false, reason: check.reason });
  }

  // Derive our licence reference from the Gumroad key. Hashing (rather than embedding the key)
  // means the TokenBrake licence can be pasted into a support thread or a config file without
  // exposing the customer's Gumroad key — and it still collides only if the Gumroad key repeats.
  // 24 hex chars is what issueLicense keeps, and is far beyond collision risk at this volume.
  const ref = crypto.createHash("sha256").update(gumroadKey).digest("hex").slice(0, 24);

  // Perpetual (days: 0) because this is a one-time purchase, not a subscription. That's a
  // deliberate choice: subscriptions mean renewal emails, failed cards and cancellation
  // handling — ongoing admin this product has no one to staff. One payment, one key, forever.
  // tier "business" = unlimited monitored agents (see PLAN_SEATS in license.js).
  const license = issueLicense({ ref, tier: "business", days: 0 });

  // Structured sale log — readable with `vercel logs`, no customer content beyond what's needed
  // to reconcile a purchase against Gumroad. The Gumroad order id is the receipt.
  console.log("TOKENBRAKE_SALE " + JSON.stringify({
    at: new Date().toISOString(),
    via: "gumroad",
    order: check.orderId || null,
    test: check.test || false,
  }));

  return send(res, 200, {
    ok: true,
    license,
    tier: "business",
    plan: "Commercial licence — one company, unlimited agents",
    perpetual: true,
    test: check.test || false,
  });
}
