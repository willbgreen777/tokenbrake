// TokenBrake — the watt-burner reader. Finds the LOCAL AI models running on this machine
// (Ollama, llama.cpp, LM Studio, MLX, vLLM, and friends) and measures what they actually cost:
// RAM held + an honest electricity estimate. These burn $0 in API — they burn power. No one
// has ever been able to see this, because AIs living in the background are brand new.
import { execSync } from "node:child_process";

// command-line fingerprints of local inference engines (not cloud UIs — those cost API, not watts)
const AI_PATTERNS = [
  { re: /llama-server|llama[._-]?cpp/i,  kind: "llama.cpp" },
  { re: /ollama/i,                        kind: "Ollama" },
  { re: /lm[ -]?studio|lmstudio/i,        kind: "LM Studio" },
  { re: /mlx_lm|mlx-lm|\bmlx\b/i,         kind: "MLX" },
  { re: /vllm/i,                          kind: "vLLM" },
  { re: /koboldcpp|kobold/i,              kind: "KoboldCpp" },
  { re: /text-generation-|tgi/i,          kind: "TGI" },
  { re: /gpt4all/i,                       kind: "GPT4All" },
  { re: /jan\.ai|\bjan\b/i,               kind: "Jan" }
];

// pull a friendly model name from a command line (…--model /path/qwen3-8b.gguf → "qwen3-8b")
function modelName(cmd) {
  const m = cmd.match(/--?model[= ]+([^\s]+)/i) || cmd.match(/models?[\/=]([^\s\/]+)/i);
  if (!m) return null;
  const raw = m[1].split("/").pop().replace(/\.(gguf|bin|safetensors)$/i, "");
  // Ollama stores blobs by sha256 — that's gibberish to a human, so reject it and let us ask Ollama.
  if (/^sha256[-:]/i.test(raw) || /^[0-9a-f]{16,}$/i.test(raw)) return null;
  return raw.slice(0, 28);
}

// Ask Ollama what model is actually loaded (friendly name like "qwen3:8b"). Cached per run.
let _ollamaModel;
function ollamaRunningModel() {
  if (_ollamaModel !== undefined) return _ollamaModel;
  try {
    const out = execSync("PATH=/opt/homebrew/bin:/usr/local/bin:$PATH ollama ps", { encoding: "utf8", timeout: 2500 });
    const rows = out.trim().split("\n").slice(1).filter(Boolean);
    _ollamaModel = rows.length ? rows[0].split(/\s{2,}|\t/)[0].trim() : null;
  } catch { _ollamaModel = null; }
  return _ollamaModel;
}

// Rough, HONEST power model (Apple Silicon mini class): a small idle floor per resident model
// plus a dynamic slice scaled by its CPU use. Exact wattage needs sudo powermetrics; this is a
// transparent estimate, and we label it as one.
function estWatts(cpuPct, ramGB) {
  const resident = ramGB > 0.3 ? 3 : 0;        // holding a model in RAM costs a little, even idle
  const dynamic  = Math.min(35, (cpuPct / 100) * 30);  // compute cost scales with CPU
  return resident + dynamic;
}

export function localAgents(centsPerKwh = 15) {
  let out = "";
  try { out = execSync("ps -axo pid,%cpu,rss,command", { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }); } catch { return []; }
  const rate = centsPerKwh / 100;
  const agents = [];
  for (const line of out.split("\n").slice(1)) {
    const m = line.match(/^\s*(\d+)\s+([\d.]+)\s+(\d+)\s+(.*)$/);
    if (!m) continue;
    const pid = +m[1], cpu = +m[2], ramGB = (+m[3]) / 1048576, cmd = m[4];
    if (ramGB < 0.2) continue;                                  // ignore tiny helper procs
    const hit = AI_PATTERNS.find(p => p.re.test(cmd));
    if (!hit) continue;
    const watts = estWatts(cpu, ramGB);
    const perMonth = watts * 24 * 30 / 1000 * rate;
    let model = modelName(cmd);
    if (!model && (hit.kind === "Ollama" || hit.kind === "llama.cpp")) model = ollamaRunningModel();
    agents.push({
      agent: model ? `${hit.kind} · ${model}` : hit.kind,
      kind: "local", pid, cpu: Math.round(cpu * 10) / 10,
      ramGB: Math.round(ramGB * 100) / 100,
      watts: Math.round(watts), costMonth: Math.round(perMonth * 100) / 100, costDay: Math.round(perMonth / 30 * 100) / 100
    });
  }
  // biggest RAM holder first (RAM is the resource they hold hostage)
  return agents.sort((a, b) => b.ramGB - a.ramGB);
}
