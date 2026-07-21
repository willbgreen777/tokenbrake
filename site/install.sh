#!/bin/sh
# TokenBrake Server — one-line installer.  curl -fsSL https://tokenbrake.com/install.sh | sh
# Downloads the single-file server, generates a key, and tells you how to start it. No deps.
set -e
A='\033[33m'; G='\033[32m'; D='\033[2m'; N='\033[0m'
printf "%b\n" "${A}TokenBrake Server — installer${N}"

if ! command -v node >/dev/null 2>&1; then
  printf "%b\n" "Node.js is required (v24+). Install it from https://nodejs.org and re-run."
  exit 1
fi
V=$(node -e 'console.log(process.versions.node.split(".")[0])')
if [ "$V" -lt 24 ]; then
  printf "%b\n" "⚠ Node $V found. TokenBrake needs Node 24+ (built-in SQLite). Update Node and re-run."
  exit 1
fi

DIR="${1:-tokenbrake}"
mkdir -p "$DIR"
printf "%b\n" "${D}Downloading server → $DIR/tokenbrake-server.mjs${N}"
curl -fsSL https://tokenbrake.com/tokenbrake-server.mjs -o "$DIR/tokenbrake-server.mjs"
KEY=$(node -e 'console.log(require("crypto").randomBytes(24).toString("hex"))')

printf "\n%b\n" "${G}✓ Installed.${N}"
printf "%b\n"   "Your TokenBrake key (keep it safe): ${A}$KEY${N}"
printf "\n%b\n" "Start it:"
printf "%b\n"   "  ${A}cd $DIR && TB_KEY=$KEY node tokenbrake-server.mjs${N}"
printf "\n%b\n" "Then open ${A}http://localhost:8788${N} and point your AI base URL at ${A}http://localhost:8788/openai/v1${N}"
printf "%b\n"   "(add header  x-tokenbrake-key: $KEY )"
printf "%b\n"   "Bought a license? add  TB_LICENSE=TB-...   ·   Full docs: https://tokenbrake.com/docs"
