import { issueLicense, verifyLicense, seatsForTier } from "./lib/license.js";
import { verifyUsdcPayment } from "./lib/payment.js";
let pass=0, fail=0; const ok=(n,c)=>{ if(c){pass++;console.log("  ✓",n);}else{fail++;console.log("  ✗ FAIL:",n);} };

console.log("LICENSE KEYS:");
const key = issueLicense({ ref: "0xabc123deadbeef", tier: "pro" });
ok("issued key looks right (TB-…)", key.startsWith("TB-"));
const v = verifyLicense(key);
ok("valid key verifies", v.valid === true && v.tier === "pro" && v.ref === "0xabc123deadbeef");
ok("tampered key is rejected", verifyLicense(key.slice(0, -3) + "xxx").valid === false);
ok("garbage key is rejected", verifyLicense("TB-not-a-real-key").valid === false);
ok("empty key is rejected", verifyLicense("").valid === false);
ok("perpetual license has no expiry", v.exp === 0);

console.log("SEAT CAPS (two plans — Solo ≤3, Business >3; a seat = a monitored agent, not a device):");
ok("Solo plan = 3 agents", seatsForTier("solo") === 3);
ok("Business plan = 0 (unlimited)", seatsForTier("business") === 0);
ok("unknown tier falls back to Solo (3)", seatsForTier("mystery") === 3);
const soloKey = verifyLicense(issueLicense({ ref: "0xsolo", tier: "solo" }));
ok("Solo key carries 3 seats", soloKey.valid && soloKey.seats === 3);
const bizKey = verifyLicense(issueLicense({ ref: "0xbiz", tier: "business" }));
ok("Business key is unlimited (0)", bizKey.valid && bizKey.seats === 0);
ok("seat count can't be tampered (re-sign fails)", verifyLicense(issueLicense({ref:"0xsolo",tier:"solo"}).replace(/\.[^.]+$/, ".AAAAAAAAAAAAAAAAAAAAAA")).valid === false);
const legacy = verifyLicense("TB-" + Buffer.from("solo.0xold.0").toString("base64url") + "." + "x"); // old-shape body, bad sig → invalid, but seats-parse shouldn't throw
ok("old-shape/garbage key rejected without throwing", legacy.valid === false);

console.log("ON-CHAIN PAYMENT (input guards, no network needed):");
const bad = await verifyUsdcPayment("not-a-hash", "0x3de7b2de531053340cf132d29b837e5a0e924177", 10);
ok("rejects a bad tx hash cleanly", bad.paid === false && /valid transaction hash/.test(bad.reason));

console.log("\n"+(fail===0?"✅ ALL "+pass+" CRYPTO TESTS PASS":"❌ "+fail+" FAILED"));
process.exit(fail?1:0);
