// TokenBrake — commercial licence, VERIFY ONLY.
//
// READ THIS BEFORE YOU CHANGE ANYTHING HERE.
//
// A TokenBrake commercial licence is a LEGAL PERMISSION, not a technical unlock. TokenBrake is
// released under PolyForm Small Business: individuals and companies under 100 people / $1M
// revenue may use it freely, and companies above that threshold need a paid licence. The key
// below is how such a company PROVES it holds one — to itself, to its own auditors, to whoever
// asks. It is a receipt you can verify, not a lock.
//
// Consequently this file does exactly one thing: it tells you whether a key is genuine. It does
// not gate a feature, cap an agent, expire anything, or influence a single API call. Nothing in
// TokenBrake reads the result of this check to decide whether to allow traffic, and nothing ever
// should. The product sits in front of your production calls; the day it starts refusing work
// because of a licence question is the day it stops being safe to install. An unlicensed run and
// a licensed run behave identically — the only difference is one line of startup output and one
// field in /health.
//
// That is a deliberate trade. We would rather a company that owes us $249 quietly not pay than
// have one that DID pay get woken at 3am by our licence check.
//
// The verification is genuinely offline. The public key below can only check a signature, never
// create one; the matching private key exists solely in the checkout service and never touches a
// customer machine. So this works with no network, forever, and keeps working if we disappear.
import crypto from "node:crypto";

// Safe to publish: this key can only VERIFY.
const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAkoh38Vt4qL/nwU4zur4ExJZhsm/Rf23OW5kcqdChLT8=
-----END PUBLIC KEY-----`;

// Verify a TokenBrake licence key offline.
// Returns { valid, tier, ref, exp, perpetual } — or { valid:false, reason } and never throws.
export function verifyLicense(key) {
  try {
    const k = String(key || "").trim();
    if (!k) return { valid: false, reason: "empty" };
    if (!k.startsWith("TB-")) return { valid: false, reason: "not a TokenBrake key (should start with TB-)" };

    const [b64, sig] = k.slice(3).split(".");
    if (!b64 || !sig) return { valid: false, reason: "malformed — looks truncated" };

    const body = Buffer.from(b64, "base64url").toString();
    const good = crypto.verify(null, Buffer.from(body), PUBLIC_KEY, Buffer.from(sig, "base64url"));
    if (!good) return { valid: false, reason: "signature does not match — check you copied all of it" };

    const [tier, ref, exp] = body.split(".");
    const expNum = Number(exp) || 0;
    if (expNum > 0 && expNum < Math.floor(Date.now() / 1000)) {
      return { valid: false, expired: true, reason: "expired " + new Date(expNum * 1000).toISOString().slice(0, 10) };
    }
    return { valid: true, tier: tier || "business", ref: ref || "", exp: expNum, perpetual: expNum === 0 };
  } catch {
    // A licence check must never be able to stop TokenBrake starting.
    return { valid: false, reason: "unreadable" };
  }
}

// The startup line and the /health field. Kept here so there is exactly one place that decides
// how a licence is described, and so it is obvious that no caller gets a yes/no gate out of it.
export function licenseStatus(env = process.env) {
  const raw = env.TB_LICENSE || "";
  if (!raw) {
    return {
      licensed: false,
      set: false,
      line: "commercial licence: none set — running under the free small-business terms " +
            "(individuals, and companies under 100 people / $1M revenue)",
    };
  }
  const v = verifyLicense(raw);
  if (!v.valid) {
    return {
      licensed: false,
      set: true,
      reason: v.reason,
      line: `commercial licence: NOT VALID (${v.reason}) — TokenBrake is running normally regardless. ` +
            `Re-paste your Gumroad key at https://tokenbrake.com/get`,
    };
  }
  const term = v.perpetual ? "perpetual" : "expires " + new Date(v.exp * 1000).toISOString().slice(0, 10);
  return {
    licensed: true,
    set: true,
    tier: v.tier,
    ref: v.ref,
    perpetual: v.perpetual,
    exp: v.exp,
    line: `commercial licence: VALID · ${v.tier} · ref ${v.ref} · ${term}`,
  };
}
