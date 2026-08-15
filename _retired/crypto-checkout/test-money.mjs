// TokenBrake — money-path guard tests for the checkout (buy.js) and admin sales (sales.js).
// Covers the security-critical surface offline (no chain calls): config gating, auth, input
// validation, no-secret-leak, and deterministic key minting. Run from site/: node test-money.mjs
// Requires TB_LICENSE_PRIVATE_KEY in env (the tests set a dummy is not enough — issueLicense needs it).
const mkRes = () => { const r = { _s: 0, _b: "", headers: {} };
  r.setHeader = (k, v) => { r.headers[k] = v; }; r.status = s => { r._s = s; return r; }; r.end = b => { r._b = b; }; return r; };
const call = async (mod, req) => { const res = mkRes(); const { default: h } = await import(mod + "?" + Math.random()); await h(req, res); return { s: res._s, b: JSON.parse(res._b || "{}") }; };
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log("  ✓", n); } else { fail++; console.log("  ✗ FAIL:", n); } };

console.log("CHECKOUT (buy.js) — unconfigured:");
delete process.env.TB_PAYEE;
let r = await call("./api/buy.js", { method: "GET" });
ok("GET reports not configured", r.b.configured === false && r.b.wallet === null);
ok("GET still lists both plans", r.b.plans.solo.price === 99 && r.b.plans.business.price === 490);
r = await call("./api/buy.js", { method: "POST", body: { plan: "solo", txHash: "0x" + "a".repeat(64) } });
ok("POST refused (503) until a wallet is set", r.s === 503 && r.b.ok === false);

console.log("CHECKOUT (buy.js) — configured:");
process.env.TB_PAYEE = "0x3de7b2de531053340cf132d29b837e5a0e924177";
r = await call("./api/buy.js", { method: "GET" });
ok("GET returns wallet + configured", r.b.configured === true && /^0x[0-9a-f]{40}$/.test(r.b.wallet));
ok("GET leaks NO secret", !JSON.stringify(r.b).toLowerCase().includes("private") && !JSON.stringify(r.b).includes("BEGIN"));
r = await call("./api/buy.js", { method: "POST", body: { plan: "gold", txHash: "0x" + "a".repeat(64) } });
ok("unknown plan → 400", r.s === 400);
r = await call("./api/buy.js", { method: "POST", body: { plan: "solo", txHash: "not-hex" } });
ok("bad tx hash → 400 (never reaches minting)", r.s === 400 && !r.b.license);
r = await call("./api/buy.js", { method: "POST", body: { plan: "solo", txHash: "0x" + "a".repeat(64), email: "not-an-email" } });
ok("bad email doesn't crash (verifies then fails, no license)", r.b.ok === false && !r.b.license);

console.log("DETERMINISTIC KEYS:");
const { issueLicense } = await import("./api/_lib/license.js");
ok("same tx → identical key (idempotent)", issueLicense({ ref: "0xabc", tier: "solo", days: 365 }) === issueLicense({ ref: "0xabc", tier: "solo", days: 365 }));
ok("different tx → different key", issueLicense({ ref: "0xabc", tier: "solo", days: 365 }) !== issueLicense({ ref: "0xdef", tier: "solo", days: 365 }));

console.log("ADMIN SALES (sales.js) — auth gating:");
delete process.env.TB_ADMIN_KEY;
r = await call("./api/sales.js", { url: "/api/sales", headers: {} });
ok("no TB_ADMIN_KEY → 503 (disabled)", r.s === 503);
process.env.TB_ADMIN_KEY = "adminsecret";
r = await call("./api/sales.js", { url: "/api/sales", headers: {} });
ok("missing admin key → 401", r.s === 401);
r = await call("./api/sales.js", { url: "/api/sales?key=wrong", headers: {} });
ok("wrong admin key → 401", r.s === 401);
r = await call("./api/sales.js", { url: "/api/sales?tx=nothex", headers: { "x-tb-admin": "adminsecret" } });
ok("authorized but bad tx → 400", r.s === 400);

console.log("\n" + (fail === 0 ? "✅ ALL " + pass + " MONEY-PATH TESTS PASS" : "❌ " + fail + " FAILED (" + pass + " passed)"));
process.exit(fail ? 1 : 0);
