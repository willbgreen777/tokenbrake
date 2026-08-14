// TokenBrake — Gumroad license verification.
//
// Why Gumroad: it is a *merchant of record*. Gumroad is the legal seller, so Gumroad calculates,
// collects and remits sales tax / VAT / GST worldwide, and Gumroad — not us — carries chargeback
// and fraud risk. That means no Stripe account, no business entity, no tax registration, and no
// crypto. The customer pays with a normal card.
//
// Gumroad's verify endpoint is PUBLIC — it needs no API key and no secret. So this file is safe
// to publish, and the whole redeem flow works with exactly one piece of configuration
// (TB_GUMROAD_PRODUCT_ID). Nothing here can mint a licence; minting still requires the Ed25519
// private key that lives only in the checkout function.

const VERIFY_URL = "https://api.gumroad.com/v2/licenses/verify";

// Verify a Gumroad licence key against our product.
// Returns { valid, reason, uses, email, orderId, refunded }.
//
// increment: Gumroad keeps a per-key "uses" counter. We deliberately DON'T increment it — a
// customer re-redeeming to recover a lost key is a normal, legitimate thing to do, and we don't
// want that to look like abuse or hit a cap. The counter is Gumroad's, not our source of truth.
export async function verifyGumroadLicense(licenseKey, productId, { increment = false, fetchImpl = fetch } = {}) {
  const key = String(licenseKey || "").trim();
  const pid = String(productId || "").trim();

  if (!pid) return { valid: false, reason: "Checkout isn't configured yet." };
  // Gumroad keys look like XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX. Be permissive about format but
  // reject obvious junk early so we don't make a pointless network call.
  if (key.length < 8 || key.length > 128) {
    return { valid: false, reason: "That doesn't look like a licence key. Check your Gumroad receipt." };
  }

  const body = new URLSearchParams();
  body.append("product_id", pid);
  body.append("license_key", key);
  body.append("increment_uses_count", increment ? "true" : "false");

  let res, json;
  try {
    res = await fetchImpl(VERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    json = await res.json();
  } catch {
    return { valid: false, reason: "Couldn't reach Gumroad to check that key — try again in a moment." };
  }

  // Gumroad returns 404 + { success:false } for a key that isn't ours or doesn't exist.
  if (!json || json.success !== true) {
    return { valid: false, reason: "That licence key wasn't recognised. Make sure you copied all of it." };
  }

  const p = json.purchase || {};

  // A refunded, disputed or chargebacked purchase must not keep a working licence. Gumroad
  // exposes these on the purchase object; treat any of them as void. `?? false` matters —
  // a missing field is not a truthy value, but we also don't want undefined leaking out.
  const refunded = Boolean(p.refunded ?? false);
  const disputed = Boolean(p.disputed ?? false) || Boolean(p.chargebacked ?? false);
  if (refunded) return { valid: false, refunded: true, reason: "That purchase was refunded, so the licence is no longer active." };
  if (disputed) return { valid: false, refunded: true, reason: "That purchase is disputed, so the licence is on hold." };

  // Gumroad flags test purchases made from the seller's own dashboard. Allow them (they're how
  // Chad checks the flow works end to end) but pass the flag through so callers can tell.
  return {
    valid: true,
    uses: Number(json.uses || 0),
    email: typeof p.email === "string" ? p.email : null,
    orderId: String(p.order_number || p.sale_id || p.id || ""),
    test: Boolean(p.test ?? false),
  };
}
