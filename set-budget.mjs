#!/usr/bin/env node
// Set a per-agent monthly budget + mode.  Usage:  node set-budget.mjs <agent> <dollars> [hard|soft]
import { setAgentBudget } from "./lib/store.js";
const [agent, dollars, mode = "hard"] = process.argv.slice(2);
if (!agent || dollars == null) { console.log("usage: node set-budget.mjs <agent> <dollars> [hard|soft]\n  e.g. node set-budget.mjs openai 20 hard"); process.exit(1); }
const e = setAgentBudget(agent, Number(dollars), mode);
console.log(`✓ ${e.agent}: budget $${e.budget.toFixed(2)}/month · ${e.mode === "soft" ? "SOFT (warn, keep running)" : "HARD (stop at limit)"}`);
