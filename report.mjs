#!/usr/bin/env node
// TokenBrake — SwiftBar reporter. Prints the menu-bar glance + dropdown in SwiftBar format.
// Fuses the two hidden costs of AI on your machine: cloud API dollars + local watts/RAM.
import { localAgents } from "./lib/local.js";
import { cloudAgents } from "./lib/store.js";

const RATE = Number(process.env.TB_CENTS_PER_KWH) || 15;   // electricity rate, cents/kWh
const money = n => "$" + (Number(n) || 0).toFixed(2);

const local = localAgents(RATE);
const cloud = cloudAgents().sort((a, b) => b.spend - a.spend);

const localMonth = local.reduce((s, a) => s + a.costMonth, 0);
const cloudSpend = cloud.reduce((s, a) => s + a.spend, 0);
const glance = cloudSpend + localMonth;

// ---- menu-bar line (one glance) ----
console.log(`🔥 ${money(glance)} | font=Menlo size=13`);
console.log("---");
console.log(`TokenBrake · the AI on this Mac | size=11 color=#8a8a8a`);
console.log(`This month: ${money(cloudSpend)} API  +  ~${money(localMonth)} power | size=12 color=#c9c9c9`);
console.log("---");

// ---- cloud: the dollar-burners ----
console.log("☁️  Cloud AI — real API dollars | size=12 color=#4fd1c5");
if (cloud.length) {
  for (const a of cloud) {
    const bud = a.budget > 0 ? ` / ${money(a.budget)}` : "";
    const flag = a.budget > 0 && a.spend >= a.budget ? "  ⛔ capped" : (a.budget > 0 && a.spend >= a.budget * 0.8 ? "  ⚠️" : "");
    console.log(`${a.agent}:  ${money(a.spend)}${bud}${flag}  ·  ${a.calls} calls | size=13`);
  }
} else {
  console.log("none yet — point a cloud AI at the proxy to meter it | size=12 color=#8a8a8a");
}
console.log("---");

// ---- local: the watt-burners ----
console.log("⚡ Local AI — electricity + RAM | size=12 color=#f6ad55");
if (local.length) {
  for (const a of local) {
    console.log(`${a.agent}:  ${a.ramGB} GB  ·  ~${money(a.costMonth)}/mo  ·  ${a.watts}W | size=13`);
  }
} else {
  console.log("no local models running right now | size=12 color=#8a8a8a");
}
console.log("---");
console.log(`Total AI cost showing: ${money(glance)} | size=12 color=#c9c9c9`);
console.log("Refresh now | refresh=true");
