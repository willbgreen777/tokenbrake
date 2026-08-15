// Tests for the Lemon Squeezy webhook. The thing worth proving here is that an attacker who
// knows our endpoint URL and our price list still cannot mint a licence without the signing
// secret — and that a legitimate retry never mints a second, different key.
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

process.env.TB_LS_WEBHOOK_SECRET = "test_signing_secret_do_not_use";
process.env.TB_LS_VARIANT_SOLO = "111111";
process.env.TB_LS_VARIANT_BUSINESS = "222222";
try { process.env.TB_LICENSE_PRIVATE_KEY = readFileSync(join(process.env.HOME, "TokenBrake", ".license-key.pem"), "utf8"); } catch {}

const { default: handler } = await import("./site/api/lemonsqueezy.js");
const { verifyLicense } = await import("./site/api/_lib/license.js");

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log("  ✓ " + name); } else { fail++; console.log("  ✗ " + name); } };

// minimal req/res doubles
function mkReq(bodyObj, { secret = process.env.TB_LS_WEBHOOK_SECRET, sig = null, method = "POST" } = {}) {
  const raw = Buffer.from(JSON.stringify(bodyObj));
  const signature = sig !== null ? sig : crypto.createHmac("sha256", secret).update(raw).digest("hex");
  const req = { method, headers: { "x-signature": signature } };
  req[Symbol.asyncIterator] = async function* () { yield raw; };
  return req;
}
function mkRes() {
  const r = { code: 0, body: null, headers: {} };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = c => { r.code = c; return r; };
  r.end = s => { try { r.body = JSON.parse(s); } catch { r.body = s; } return r; };
  return r;
}
const order = (id, variant, total, extra = {}) => ({
  meta: { event_name: "order_created" },
  data: { id: String(id), attributes: { status: "paid", variant_id: variant, total, user_email: "buyer@example.com", first_order_item: { variant_id: variant, price: total }, ...extra } },
});

const run = async (body, opts) => { const res = mkRes(); await handler(mkReq(body, opts), res); return res; };

console.log("SIGNATURE:");
{
  const res = await run(order(1001, "111111", 9900), { sig: "deadbeef" });
  ok("forged signature is refused with 401", res.code === 401 && res.body.ok === false);
}
{
  const res = await run(order(1001, "111111", 9900), { secret: "wrong_secret" });
  ok("signature from the wrong secret is refused", res.code === 401);
}
{
  const res = await run(order(1001, "111111", 9900), { sig: "" });
  ok("missing signature is refused", res.code === 401);
}
{
  const res = await run(order(1001, "111111", 9900), { method: "GET" });
  ok("GET is rejected (405)", res.code === 405);
}

console.log("MINTING:");
let soloKey;
{
  const res = await run(order(1001, "111111", 9900));
  ok("valid signature + solo variant mints a solo licence", res.code === 200 && res.body.ok === true && res.body.tier === "solo");
}
{
  const res = await run(order(2002, "222222", 49000));
  ok("business variant mints a business licence", res.code === 200 && res.body.tier === "business");
}
{
  const res = await run(order(3003, "999999", 9900));
  ok("unknown variant falls back to price ($99 -> solo)", res.code === 200 && res.body.tier === "solo");
}
{
  const res = await run(order(4004, "999999", 12345));
  ok("unknown variant AND unknown price mints nothing", res.body.ok === false);
}

console.log("IDEMPOTENCY (a webhook retry must not create a second key):");
{
  // mint twice for the same order id and compare the licence bodies
  const { issueLicense } = await import("./site/api/_lib/license.js");
  const a = issueLicense({ ref: "1001", tier: "solo", days: 365 });
  const b = issueLicense({ ref: "1001", tier: "solo", days: 365 });
  const bodyOf = k => k.split(".")[0];
  ok("same order id yields the same licence body", bodyOf(a) === bodyOf(b));
  const v = verifyLicense(a);
  ok("minted licence verifies against the public key", v.valid === true && v.tier === "solo");
  ok("licence carries the order id as its ref", v.ref === "1001");
  soloKey = a;
}
{
  const tampered = soloKey.slice(0, -4) + "AAAA";
  ok("tampered signature fails verification", verifyLicense(tampered).valid !== true);
}

console.log("EVENT FILTERING:");
{
  const body = order(5005, "111111", 9900); body.meta.event_name = "order_refunded";
  const res = await run(body);
  ok("a refund mints nothing but returns 200", res.code === 200 && res.body.ignored === "order_refunded");
}
{
  const body = order(6006, "111111", 9900); body.data.attributes.status = "pending";
  const res = await run(body);
  ok("a pending order mints nothing", res.body.ignored === "status=pending");
}

console.log("");
console.log(fail === 0 ? "✅ ALL " + pass + " LEMON SQUEEZY TESTS PASS" : "❌ " + fail + " FAILED (" + pass + " passed)");
process.exit(fail === 0 ? 0 : 1);
