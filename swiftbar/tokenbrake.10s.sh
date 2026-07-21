#!/bin/bash
# TokenBrake menu-bar plugin for SwiftBar. Refreshes every 10s.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
node "$HOME/TokenBrake/report.mjs" 2>/dev/null || echo "🔥 TokenBrake ⚠️ (is Node installed?)"
