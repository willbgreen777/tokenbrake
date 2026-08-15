#!/bin/bash
# Builds site/tokenbrake-beta.zip from a clean staging directory.
#
# WHY THIS EXISTS: the zip has twice been built by adding files to an existing
# archive, which left stale v1 files (including the superseded MIT LICENSE)
# sitting at the archive root alongside the current build. Zipping a freshly
# staged tree is the only way that cannot happen. Never zip in place.
set -euo pipefail
cd "$(dirname "$0")"
ROOT="$(pwd)"
STAGE="$(mktemp -d)/TokenBrake"
mkdir -p "$STAGE/lib" "$STAGE/swiftbar"

# Everything the customer runs, and nothing else.
for f in proxy.mjs reset.mjs set-budget.mjs report.mjs demo-runaway.mjs \
         test.mjs test-runaway.mjs package.json \
         README.md LICENSE LICENSE-HISTORY.md SECURITY.md; do
  cp "$ROOT/$f" "$STAGE/$f"
done

# lib: deliberately excludes license.js and payment.js — those are server-side
# licence minting and have no business in a customer download.
for f in breaker.js runaway.js proxy-core.js meter.js pricing.js \
         store.js stream.js local.js ledger.js; do
  cp "$ROOT/lib/$f" "$STAGE/lib/$f"
done

cp "$ROOT/swiftbar/tokenbrake.10s.sh" "$STAGE/swiftbar/"

rm -f "$ROOT/site/tokenbrake-beta.zip"
( cd "$(dirname "$STAGE")" && zip -qr "$ROOT/site/tokenbrake-beta.zip" TokenBrake -x '*.DS_Store' )

echo "built: $(ls -lh "$ROOT/site/tokenbrake-beta.zip" | awk '{print $5}')"
unzip -l "$ROOT/site/tokenbrake-beta.zip" | tail -3
rm -rf "$(dirname "$STAGE")"
