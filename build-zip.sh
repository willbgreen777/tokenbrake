#!/bin/bash
# Builds site/tokenbrake-beta.zip from a clean staging directory, then PROVES the result works
# by unpacking it somewhere else and actually running it.
#
# WHY THIS EXISTS. Three separate near-misses, all of the same shape — the thing on disk was
# fine, the thing the customer downloads was not:
#
#   1. The zip was twice rebuilt by ADDING files to the existing archive, leaving stale v1 files
#      (including the superseded MIT LICENSE) at the archive root next to the current build.
#   2. proxy.mjs gained an import of lib/license.js while the file list here did not, so the
#      shipped proxy would have crashed on start with ERR_MODULE_NOT_FOUND. Every test passed.
#   3. Branding and licence text were corrected in the repo but the zip was not rebuilt, so the
#      download still said Akkad Empires and MIT.
#
# A file list cannot catch (2), and tests run from the repo cannot catch any of them. So the
# check below boots the packaged proxy on a spare port and asks it for /health. If that fails,
# the build fails, and nothing gets deployed.
set -euo pipefail
cd "$(dirname "$0")"
ROOT="$(pwd)"
STAGE="$(mktemp -d)/TokenBrake"
mkdir -p "$STAGE/lib" "$STAGE/swiftbar"

# Everything the customer runs, and nothing else.
for f in proxy.mjs reset.mjs set-budget.mjs report.mjs demo-runaway.mjs \
         test.mjs test-runaway.mjs test-license.mjs package.json \
         README.md LICENSE LICENSE-HISTORY.md SECURITY.md; do
  cp "$ROOT/$f" "$STAGE/$f"
done

# lib/license.js is VERIFY ONLY — it holds the public key, which by design can check a
# signature and never create one. It ships because proxy.mjs imports it to report whether a
# commercial licence is present. Minting lives in site/api/_lib/license.js and never ships.
for f in breaker.js runaway.js proxy-core.js meter.js pricing.js \
         store.js stream.js local.js ledger.js license.js; do
  cp "$ROOT/lib/$f" "$STAGE/lib/$f"
done

cp "$ROOT/swiftbar/tokenbrake.10s.sh" "$STAGE/swiftbar/"

ZIP="$ROOT/site/tokenbrake-beta.zip"
rm -f "$ZIP"
( cd "$(dirname "$STAGE")" && zip -qr "$ZIP" TokenBrake -x '*.DS_Store' )
rm -rf "$(dirname "$STAGE")"

echo "built: $(ls -lh "$ZIP" | awk '{print $5}')  ($(unzip -l "$ZIP" | tail -1 | awk '{print $2}') files)"

# ─────────────────────────────────────────────────────────────────────────────
# VERIFY — from here on we only look at the zip, never at the repo.
# ─────────────────────────────────────────────────────────────────────────────
V=$(mktemp -d)
trap 'rm -rf "$V"' EXIT
( cd "$V" && unzip -q "$ZIP" )

fail() { echo "  ✗ $1"; echo; echo "BUILD FAILED — do not deploy."; exit 1; }

echo "verifying the archive:"

# 1. exactly one top-level entry, so unzipping into a home folder can't scatter files
TOP=$(cd "$V" && ls -A | tr '\n' ' ' | sed 's/ $//')
[ "$TOP" = "TokenBrake" ] || fail "top level should be exactly 'TokenBrake', got: $TOP"
echo "  ✓ single top-level folder"

# 2. nothing from the retired brand or the superseded licence
! grep -rqil "akkad" "$V" || fail "the word 'akkad' is still in the archive"
! grep -rql "MIT License" "$V" || fail "an MIT licence is still in the archive"
grep -q "PolyForm" "$V/TokenBrake/LICENSE" || fail "LICENSE is not the PolyForm text"
grep -q "Northjule" "$V/TokenBrake/LICENSE" || fail "LICENSE does not carry the Northjule notice"
echo "  ✓ branding and licence text correct"

# 3. no private key material, ever
! grep -rq "BEGIN .*PRIVATE KEY" "$V" || fail "a PRIVATE KEY is in the customer archive"
! grep -rq "issueLicense" "$V" || fail "licence-minting code is in the customer archive"
echo "  ✓ no signing key, no minting code"

# 4. the tests that ship must pass when run from the archive
( cd "$V/TokenBrake" && node test.mjs >/dev/null 2>&1 ) || fail "test.mjs fails from inside the zip"
( cd "$V/TokenBrake" && node test-runaway.mjs >/dev/null 2>&1 ) || fail "test-runaway.mjs fails from inside the zip"
( cd "$V/TokenBrake" && node test-license.mjs >/dev/null 2>&1 ) || fail "test-license.mjs fails from inside the zip"
echo "  ✓ shipped test suites pass from inside the archive"

# 5. the demo the sales copy points at must actually produce the numbers the sales copy quotes
DEMO=$( cd "$V/TokenBrake" && node demo-runaway.mjs 2>&1 ) || fail "demo-runaway.mjs errors"
echo "$DEMO" | grep -q '280.01' || fail "demo no longer prints \$280.01 — the site quotes that number"
echo "$DEMO" | grep -q '3.60'   || fail "demo no longer prints \$3.60 — the site quotes that number"
echo "  ✓ demo reproduces the figures the site advertises"

# 6. THE ONE THAT MATTERS — does the packaged proxy actually boot and serve?
PORT=8799
( cd "$V/TokenBrake" && TB_PORT=$PORT node proxy.mjs > "$V/boot.log" 2>&1 ) &
BOOTPID=$!
for _ in $(seq 1 25); do
  sleep 0.2
  if curl -fsS "http://127.0.0.1:$PORT/health" > "$V/health.json" 2>/dev/null; then break; fi
done
if ! kill -0 "$BOOTPID" 2>/dev/null || [ ! -s "$V/health.json" ]; then
  echo "  --- boot log ---"; cat "$V/boot.log" || true
  kill "$BOOTPID" 2>/dev/null || true
  fail "the packaged proxy did not start and answer /health"
fi
grep -q '"ok":true' "$V/health.json" || { kill "$BOOTPID" 2>/dev/null || true; fail "/health did not report ok"; }
grep -q '"license"' "$V/health.json" || { kill "$BOOTPID" 2>/dev/null || true; fail "/health is missing the licence field"; }
kill "$BOOTPID" 2>/dev/null || true
wait "$BOOTPID" 2>/dev/null || true
echo "  ✓ packaged proxy boots and serves /health"

echo
echo "OK — safe to deploy."
