const statusEl = document.querySelector("#status");
const gridEl = document.querySelector("#grid");
const logEl = document.querySelector("#log");
const savedEl = document.querySelector("#saved");
const currentEl = document.querySelector("#current");
const candidatesEl = document.querySelector("#candidates");
const colorEl = document.querySelector("#observedColor");
const brightnessEl = document.querySelector("#observedBrightness");

const COLOR_STYLES = {
  red: "#ff4b4b",
  green: "#41d15d",
  blue: "#4388ff",
  purple: "#9b55ff",
  white: "#ffffff",
  yellow: "#ffe35b",
  cyan: "#53e5ff",
  magenta: "#ff5ad6",
  mixed: "linear-gradient(135deg, #ff4b4b, #41d15d, #4388ff)",
  off: "#2b3036",
};

const DEFAULT_CANDIDATES = [
  "# Fresh-state captures",
  "0c0c6318050c4306b08adc0100 # P1 bottom right, red",
  "0c0c6318050c4303b08adc6160600000 # P2 x=10,y=11",
  "0c0c6315b9c3300a1886066060600000 # P3 x=0,y=0",
  "0c0c6360606015b903244711c3a0070c0c0c00 # P4 x=1,y=0",
  "0c0c632002b08adc2142d5a812065a0306060600 # P5 x=0,y=1",
  "0c0c6320045845ee1052322acf401fc0c0c00000 # P6 x=11,y=0",
  "0c0c6318050c8305b08adcc1ef1406060600 # bottom left bright red",
  "",
  "# br byte 3 experiments",
  "0c0c6316050c4306b08adc0100 # br byte[3]=0x16, reported 0,0 red + 0,1 light blue",
  "0c0c6317050c4306b08adc0100 # br byte[3]=0x17, reported 1,0 purple",
  "0c0c6318050c4306b08adc0100 # br byte[3]=0x18, original bottom right red",
  "0c0c6319050c4306b08adc0100 # br byte[3]=0x19",
].join("\n");

let testIndex = 0;
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

function splitBytes(hex) {
  const clean = hex.replace(/\s+/g, "").toLowerCase();
  const pairs = [];
  for (let i = 0; i < clean.length; i += 2) pairs.push(clean.slice(i, i + 2));
  return pairs;
}

function decimalBytes(hex) {
  return splitBytes(hex).filter((pair) => /^[0-9a-f]{2}$/.test(pair)).map((pair) => String(parseInt(pair, 16))).join(" ");
}

function hexPairs(hex) {
  return splitBytes(hex).join(" ");
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
  if (testIndex >= rows.length) testIndex = rows.length - 1;
  return rows[testIndex];
}

function renderCurrent() {
  const row = currentCandidate();
  if (!row) {
    currentEl.textContent = "No candidates.";
    return;
  }
  currentEl.textContent = [
    `Test: ${testIndex + 1} / ${candidates().length}`,
    row.note ? `Note: ${row.note}` : "Note:",
    `Bytes: ${row.hex.length / 2}`,
    `Hex: ${row.hex}`,
    `Hex pairs: ${hexPairs(row.hex)}`,
    `Decimal: ${decimalBytes(row.hex)}`,
    lastSent && lastSent.hex === row.hex ? "Sent: yes" : "Sent: no",
    "",
    "Marked:",
    marks.length ? JSON.stringify(marks, null, 2) : "none yet",
  ].join("\n");
}

function renderGrid() {
  gridEl.innerHTML = "";
  for (let y = 0; y < 12; y += 1) {
    for (let x = 0; x < 12; x += 1) {
      const button = document.createElement("button");
      button.className = "cell";
      button.textContent = `${x},${y}`;
      button.title = `x=${x}, y=${y}`;
      button.addEventListener("click", () => toggleMark(button, x, y));
      gridEl.appendChild(button);
    }
  }
}

function applyMarkStyle(button, mark) {
  const brightness = Math.max(1, Math.min(10, Number(mark.brightness) || 5));
  button.className = "cell marked";
  button.style.opacity = String(0.35 + brightness * 0.065);
  button.style.background = COLOR_STYLES[mark.color] || COLOR_STYLES.mixed;
  button.title = `x=${mark.x}, y=${mark.y}, ${mark.color}, brightness ${brightness}`;
}

function toggleMark(button, x, y) {
  const existing = marks.findIndex((mark) => mark.x === x && mark.y === y);
  if (existing >= 0) {
    marks.splice(existing, 1);
    button.className = "cell";
    button.style.background = "";
    button.style.opacity = "";
    button.title = `x=${x}, y=${y}`;
    renderCurrent();
    return;
  }

  const mark = {
    x,
    y,
    color: colorEl.value,
    brightness: Number(brightnessEl.value),
  };
  marks.push(mark);
  applyMarkStyle(button, mark);
  renderCurrent();
}

function clearMarks() {
  marks = [];
  for (const cell of gridEl.querySelectorAll(".cell")) {
    cell.className = "cell";
    cell.style.background = "";
    cell.style.opacity = "";
  }
  renderCurrent();
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
  lastSent = { index: testIndex, hex: row.hex, note: row.note, commandHex: result.commandHex };
  addLog(`sent test ${testIndex + 1}: hex ${hexPairs(row.hex)} | dec ${decimalBytes(row.hex)}`);
  renderCurrent();
  await refreshStatus();
}

async function saveObservation() {
  const row = currentCandidate();
  if (!row) return;
  const record = {
    kind: "fresh_canvas_observation",
    testIndex,
    note: row.note,
    compactCanvasHex: row.hex,
    sent: lastSent && lastSent.hex === row.hex,
    observed: marks,
  };
  await api("/api/observe", record);
  savedEl.textContent = JSON.stringify(record, null, 2) + "\n\n" + savedEl.textContent;
  addLog(`saved test ${testIndex + 1} with ${marks.length} marked pixel(s)`);
  testIndex += 1;
  lastSent = null;
  clearMarks();
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
document.querySelector("#clearMarks").addEventListener("click", clearMarks);
document.querySelector("#loadDefaults").addEventListener("click", () => {
  candidatesEl.value = DEFAULT_CANDIDATES;
  testIndex = 0;
  lastSent = null;
  clearMarks();
  renderCurrent();
});

candidatesEl.addEventListener("input", () => {
  testIndex = Math.min(testIndex, Math.max(0, candidates().length - 1));
  renderCurrent();
});

async function init() {
  candidatesEl.value = DEFAULT_CANDIDATES;
  renderGrid();
  renderCurrent();
  await refreshStatus();
}

init().catch((err) => addLog(err.message));
