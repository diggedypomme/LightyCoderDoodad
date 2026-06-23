const statusEl = document.querySelector("#status");
const gridEl = document.querySelector("#grid");
const logEl = document.querySelector("#log");
const savedEl = document.querySelector("#saved");
const currentEl = document.querySelector("#current");
const candidatesEl = document.querySelector("#candidates");
const colorEl = document.querySelector("#observedColor");

const DEFAULT_CANDIDATES = [
  "# Known single fresh captures",
  "0c0c6318050c4306b08adc0100 # P1 assumed (11,11), bottom right",
  "0c0c6318050c4303b08adc6160600000 # P2 assumed (10,11)",
  "0c0c6315b9c3300a1886066060600000 # P3 assumed (0,0)",
  "0c0c6360606015b903244711c3a0070c0c0c00 # P4 assumed (1,0)",
  "0c0c632002b08adc2142d5a812065a0306060600 # P5 assumed (0,1)",
  "0c0c6320045845ee1052322acf401fc0c0c00000 # P6 assumed (11,0)",
  "",
  "# Byte 3 experiments from br",
  "0c0c6316050c4306b08adc0100 # br byte[3]=0x16",
  "0c0c6317050c4306b08adc0100 # br byte[3]=0x17",
  "0c0c6318050c4306b08adc0100 # br byte[3]=0x18 original",
  "0c0c6319050c4306b08adc0100 # br byte[3]=0x19",
].join("\n");

let index = 0;
let marks = [];
let lastSent = null;

async function api(path, body = null) {
  const opts = body ? {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  } : {};
  const res = await fetch(path, opts);
  const data = await res.json();
  if (!res.ok || data.ok === false) throw new Error(data.error || res.statusText);
  return data;
}

function addLog(text) {
  const now = new Date().toLocaleTimeString();
  logEl.textContent = `[${now}] ${text}\n` + logEl.textContent;
}

function cleanHexLine(line) {
  return line.split("#")[0].replace(/\s+/g, "").trim();
}

function noteLine(line) {
  const parts = line.split("#");
  return parts.length > 1 ? parts.slice(1).join("#").trim() : "";
}

function candidates() {
  return candidatesEl.value
    .split(/\r?\n/)
    .map((line, rawIndex) => ({ rawIndex, line, hex: cleanHexLine(line), note: noteLine(line) }))
    .filter((row) => row.hex.length > 0);
}

function currentCandidate() {
  const rows = candidates();
  if (!rows.length) return null;
  if (index >= rows.length) index = rows.length - 1;
  return rows[index];
}

function renderCurrent() {
  const row = currentCandidate();
  if (!row) {
    currentEl.textContent = "No candidates.";
    return;
  }
  currentEl.textContent = [
    `Test ${index + 1} / ${candidates().length}`,
    row.note ? `Note: ${row.note}` : "Note:",
    `Bytes: ${row.hex.length / 2}`,
    `Hex: ${row.hex}`,
    lastSent && lastSent.hex === row.hex ? "Sent: yes" : "Sent: no",
  ].join("\n");
}

function renderGrid() {
  gridEl.innerHTML = "";
  for (let y = 0; y < 12; y += 1) {
    for (let x = 0; x < 12; x += 1) {
      const button = document.createElement("button");
      button.className = "cell";
      button.textContent = `${x},${y}`;
      button.addEventListener("click", () => toggleMark(button, x, y));
      gridEl.appendChild(button);
    }
  }
}

function toggleMark(button, x, y) {
  const existing = marks.findIndex((mark) => mark.x === x && mark.y === y);
  if (existing >= 0) {
    marks.splice(existing, 1);
    button.className = "cell";
    return;
  }
  const color = colorEl.value;
  marks.push({ x, y, color });
  button.classList.add(`marked-${color === "off" ? "white" : color}`);
}

function clearMarks() {
  marks = [];
  for (const cell of gridEl.querySelectorAll(".cell")) {
    cell.className = "cell";
  }
}

async function refreshStatus() {
  const status = await api("/api/status");
  statusEl.textContent = `${status.connected ? "Connected" : "Disconnected"} | paint ${status.paintStarted ? "started" : "not started"} | ${status.address}`;
  if (status.log && status.log.length) {
    logEl.textContent = status.log.slice().reverse().join("\n") + "\n" + logEl.textContent;
  }
}

async function sendCurrent() {
  const row = currentCandidate();
  if (!row) return;
  const result = await api("/api/send-canvas", { canvas: row.hex, startIfNeeded: false });
  lastSent = { index, hex: row.hex, note: row.note, commandHex: result.commandHex };
  addLog(`sent test ${index + 1}: ${row.hex}`);
  renderCurrent();
  await refreshStatus();
}

async function saveObservation() {
  const row = currentCandidate();
  if (!row) return;
  await api("/api/observe", {
    kind: "sweep",
    testIndex: index,
    note: row.note,
    compactCanvasHex: row.hex,
    sent: lastSent && lastSent.hex === row.hex,
    observed: marks,
  });
  savedEl.textContent = `Saved test ${index + 1}\n${JSON.stringify({ hex: row.hex, observed: marks }, null, 2)}\n\n` + savedEl.textContent;
  addLog(`saved test ${index + 1} with ${marks.length} marks`);
  index += 1;
  clearMarks();
  lastSent = null;
  renderCurrent();
}

document.querySelector("#connect").addEventListener("click", async () => {
  await api("/api/connect", {});
  addLog("connected");
  await refreshStatus();
});

document.querySelector("#startPaint").addEventListener("click", async () => {
  await api("/api/start-paint", {});
  addLog("sent start fresh paint");
  await refreshStatus();
});

document.querySelector("#sendCurrent").addEventListener("click", sendCurrent);
document.querySelector("#next").addEventListener("click", saveObservation);
document.querySelector("#resetMarks").addEventListener("click", clearMarks);
document.querySelector("#loadDefaults").addEventListener("click", () => {
  candidatesEl.value = DEFAULT_CANDIDATES;
  index = 0;
  clearMarks();
  renderCurrent();
});

candidatesEl.addEventListener("input", () => {
  index = Math.min(index, Math.max(0, candidates().length - 1));
  renderCurrent();
});

async function init() {
  candidatesEl.value = DEFAULT_CANDIDATES;
  renderGrid();
  renderCurrent();
  await refreshStatus();
}

init().catch((err) => addLog(err.message));
