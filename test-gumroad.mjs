// Tests for the Gumroad redeem path. The things worth proving:
//   1. A refunded or disputed purchase cannot hold a working licence.
//   2. A key we don't recognise mints nothing.
//   3. Redeeming the SAME purchase twice returns the SAME licence key (idempotent) — so
//      "I lost my key" is self-service and one payment can never become two licences.
//   4. Gumroad being down fails closed, with a retryable message — never with a free licence.
import { readFileSync } from "node:fs";
import { join } from "node:path";

process.env.TB_GUMROAD_PRODUCT_ID = "test_product_id";
try {
  process.env.TB_LICENSE_PRIVATE_KEY = readFileSync(join(process.env.HOME, "TokenBrake", ".license-key.pem"), "utf8");
} catch {
  console.log("!! .license-key.pem not found — minting tests will be skipped");
}

const { verifyGumroadLicense } = await import("./site/api/_lib/gumroad.js");
const { verifyLicense } = await import("./site/api/_lib/license.js");
const { default: handler } = await import("./site/api/redeem.js");

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log("  ✓ " + name); } else { fail++; console.log("  ✗ " + name); } };

// ---- fake Gumroad -----------------------------------------------------------------
const gumroad = (payload, { throws = false } = {}) => async () => {
  if (throws) throw new Error("network down");
  return { json: async () => payload };
};
const goodPurchase = { success: true, uses: 1, purchase: { email: "a@b.com", order_number: 12345, refunded: false, disputed: false, chargebacked: false } };

// ---- req/res doubles --------------------------------------------------------------
function mkRes() {
  const r = { statusCode: 0, headers: {}, body: null };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = (c) => { r.statusCode = c; return r; };
  r.end = (b) => { r.body = b ? JSON.parse(b) : null; return r; };
  return r;
}
const mkReq = (body, method = "POST") => ({ method, body });

console.log("\nGumroad verification");

{
  const r = await verifyGumroadLicense("KEY-1234-5678-ABCD", "test_product_id", { fetchImpl: gumroad(goodPurchase) });
  ok("a real purchase verifies", r.valid === true && r.orderId === "12345");
}
{
  const refunded = { ...goodPurchase, purchase: { ...goodPurchase.purchase, refunded: true } };
  const r = await verifyGumroadLicense("KEY-1234-5678-ABCD", "test_product_id", { fetchImpl: gumroad(refunded) });
  ok("a REFUNDED purchase is rejected", r.valid === false && r.refunded === true);
}
{
  const disputed = { ...goodPurchase, purchase: { ...goodPurchase.purchase, chargebacked: true } };
  const r = await verifyGumroadLicense("KEY-1234-5678-ABCD", "test_product_id", { fetchImpl: gumroad(disputed) });
  ok("a CHARGEBACKED purchase is rejected", r.valid === false && r.refunded === true);
}
{
  const r = await verifyGumroadLicense("KEY-1234-5678-ABCD", "test_product_id", { fetchImpl: gumroad({ success: false }) });
  ok("an unknown key is rejected", r.valid === false);
}
{
  const r = await verifyGumroadLicense("KEY-1234-5678-ABCD", "test_product_id", { fetchImpl: gumroad(null, { throws: true }) });
  ok("Gumroad being unreachable fails CLOSED (no licence)", r.valid === false && /try again/i.test(r.reason));
}
{
  const r = await verifyGumroadLicense("x", "test_product_id", { fetchImpl: gumroad(goodPurchase) });
  ok("obvious junk is rejected without a network call", r.valid === false);
}
{
  const r = await verifyGumroadLicense("KEY-1234-5678-ABCD", "", { fetchImpl: gumroad(goodPurchase) });
  ok("unconfigured product id mints nothing", r.valid === false);
}

console.log("\nRedeem endpoint");

if (process.env.TB_LICENSE_PRIVATE_KEY) {
  // Point the endpoint's Gumroad call at our fake by swapping global fetch for these tests.
  const realFetch = globalThis.fetch;
  globalThis.fetch = gumroad(goodPurchase);

  const r1 = mkRes(); await handler(mkReq({ key: "KEY-1234-5678-ABCD" }), r1);
  ok("valid purchase mints a licence", r1.statusCode === 200 && r1.body.ok === true);
  ok("minted licence actually verifies", verifyLicense(r1.body.license).valid === true);
  ok("licence is unlimited-agent (business tier)", verifyLicense(r1.body.license).seats === 0);
  ok("licence is perpetual (no expiry)", verifyLicense(r1.body.license).exp === 0);

  const r2 = mkRes(); await handler(mkReq({ key: "KEY-1234-5678-ABCD" }), r2);
  ok("redeeming the SAME purchase returns the SAME key (idempotent)", r2.body.license === r1.body.license);

  const r3 = mkRes(); await handler(mkReq({ key: "DIFFERENT-KEY-9999" }), r3);
  ok("a different purchase gets a different key", r3.body.license !== r1.body.license);

  globalThis.fetch = gumroad({ ...goodPurchase, purchase: { ...goodPurchase.purchase, refunded: true } });
  const r4 = mkRes(); await handler(mkReq({ key: "KEY-1234-5678-ABCD" }), r4);
  ok("refunded purchase mints NOTHING", r4.statusCode === 403 && !r4.body.license);

  globalThis.fetch = gumroad(goodPurchase);
  const r5 = mkRes(); await handler(mkReq({}), r5);
  ok("empty body is a clean 400, not a crash", r5.statusCode === 400);

  const r6 = mkRes(); await handler(mkReq(null, "GET"), r6);
  ok("GET returns public config with no secrets", r6.statusCode === 200 && !JSON.stringify(r6.body).includes("PRIVATE"));

  globalThis.fetch = realFetch;
} else {
  console.log("  (skipped — no signing key on this machine)");
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
