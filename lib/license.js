// TokenBrake — license keys, signed with Ed25519 (asymmetric). We mint keys with a PRIVATE key
// that lives ONLY in our checkout service (env TB_LICENSE_PRIVATE_KEY) — never on a customer
// machine. The customer's self-hosted server verifies with the PUBLIC key baked in below, which
// can only check a key, never forge one. So a customer can run the server, read all its code, and
// still cannot mint themselves a free license. Verification stays fully offline — no phone-home.
import crypto from "node:crypto";

// Safe to ship: this key can only VERIFY. The matching private key is generated once and kept
// off every customer device.
const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAkoh38Vt4qL/nwU4zur4ExJZhsm/Rf23OW5kcqdChLT8=
-----END PUBLIC KEY-----`;

// Present only in the minting service (Vercel checkout function). Absent everywhere else.
const PRIVATE_KEY = process.env.TB_LICENSE_PRIVATE_KEY || "";

// Two plans. A "seat" = one monitored agent (a labeled stream of API traffic routed through
// TokenBrake) — NOT a device. Solo covers up to 3; Business covers more than 3 (no cap).
export const PLAN_SEATS = { solo: 3, business: 0 };   // 0 = unlimited
export function seatsForTier(tier) {
  const s = PLAN_SEATS[String(tier || "").toLowerCase()];
  return s === undefined ? 3 : s;          // unknown tier → most conservative (solo)
}

// issue a license. ref = short purchase reference (e.g. tx hash). days=0 → perpetual.
// seats = max monitored agents; omit to use the tier default. seats 0 = unlimited.
// Throws if called without the private key — minting is only possible in the checkout service.
export function issueLicense({ ref, tier = "solo", days = 0, seats }) {
  if (!PRIVATE_KEY) throw new Error("TB_LICENSE_PRIVATE_KEY not set — licenses can only be minted by the checkout service");
  const exp = days > 0 ? Math.floor(Date.now() / 1000) + days * 86400 : 0;
  const nSeats = seats === undefined ? seatsForTier(tier) : Math.max(0, Math.floor(seats));
  // sanitize ref to a dot-free charset: "." is our field separator, so a ref containing one
  // would misalign verifyLicense's body.split(".") and could mis-read exp/seats. Refs are tx
  // hashes / order ids (hex/alphanumeric) so this strips nothing in practice — pure defense.
  const safeRef = String(ref || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 24);
  const body = `${tier}.${safeRef}.${exp}.${nSeats}`;
  const sig = crypto.sign(null, Buffer.from(body), PRIVATE_KEY).toString("base64url");
  return `TB-${Buffer.from(body).toString("base64url")}.${sig}`;
}

// verify a license key offline with the public key. Returns { valid, tier, ref, exp, seats }.
// Any tamper (body or signature) or expiry → invalid. Forgery requires the private key.
export function verifyLicense(key) {
  try {
    const k = String(key || "").trim();
    if (!k.startsWith("TB-")) return { valid: false };
    const [b64, sig] = k.slice(3).split(".");
    if (!b64 || !sig) return { valid: false };
    const body = Buffer.from(b64, "base64url").toString();
    const good = crypto.verify(null, Buffer.from(body), PUBLIC_KEY, Buffer.from(sig, "base64url"));
    if (!good) return { valid: false };
    const [tier, ref, exp, seats] = body.split(".");
    if (Number(exp) > 0 && Number(exp) < Math.floor(Date.now() / 1000)) return { valid: false, expired: true };
    const nSeats = seats === undefined || seats === "" ? seatsForTier(tier) : Math.max(0, Math.floor(Number(seats)));
    return { valid: true, tier, ref, exp: Number(exp), seats: nSeats };
  } catch { return { valid: false }; }
}
