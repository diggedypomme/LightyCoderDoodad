const statusEl = document.querySelector("#status");
const bytesEl = document.querySelector("#bytes");
const payloadEl = document.querySelector("#payload");
const logEl = document.querySelector("#log");
const savedEl = document.querySelector("#saved");
const baseEl = document.querySelector("#base");
const noteEl = document.querySelector("#note");
const colorEl = document.querySelector("#color");
const brightnessEl = document.querySelector("#brightness");
const observedGridEl = document.querySelector("#observedGrid");

const COLOR_STYLES = {
  off: "#2b3036",
  red: "#ff4b4b",
  green: "#41d15d",
  blue: "#4388ff",
  purple: "#9b55ff",
  white: "#ffffff",
  yellow: "#ffe35b",
  cyan: "#53e5ff",
  magenta: "#ff5ad6",
  mixed: "linear-gradient(135deg, #ff4b4b, #41d15d, #4388ff)",
};

const BUILT_IN_BASES = {
  br: "0c0c6318050c4306b08adc0100",
  "9,11 red?": "0c0c6318050c4300b08adc0100",
  "off variant": "0c0c6318050c4300b08adc0100",
  "off b00 variant": "0c0c6318050c4306b000dc0100",
  "bottom left bright red": "0c0c6318050c8305b08adcc1ef1406060600",
};

let config = { canvases: {}, knownPixels: {} };
let baseHex = BUILT_IN_BASES.br;
let byteCells = [];
let decimalCells = [];
let lastSent = null;
let observedPixels = [];

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

let localLogLines = [];

function parseLogLine(line) {
  const match = line.match(/^\[([^\]]+)\]\s*(.*)$/);
  const time = match ? match[1] : "";
  let message = match ? match[2] : line;
  let hex = "";
  let dec = "";
  const hexMarker = " hex: ";
  const decMarker = " | dec: ";
  const hexIndex = message.indexOf(hexMarker);
  if (hexIndex >= 0) {
    const prefix = message.slice(0, hexIndex);
    const rest = message.slice(hexIndex + hexMarker.length);
    const decIndex = rest.indexOf(decMarker);
    message = prefix;
    if (decIndex >= 0) {
      hex = rest.slice(0, decIndex);
      dec = rest.slice(decIndex + decMarker.length);
    } else {
      hex = rest;
    }
  }
  return { time, message, hex, dec };
}

function byteValues(text) {
  return text.trim().split(/\s+/).filter((part) => part.length > 0);
}

function makeAlignedByteRows(hexText, decText) {
  const hexValues = byteValues(hexText);
  const decValues = byteValues(decText);
  const count = Math.max(hexValues.length, decValues.length);
  const wrap = document.createElement("div");
  wrap.className = "log-byte-grid";
  wrap.style.setProperty("--byte-count", String(count));

  const hexRow = document.createElement("div");
  hexRow.className = "log-byte-row";
  const hexLabel = document.createElement("span");
  hexLabel.className = "log-byte-label";
  hexLabel.textContent = "hex";
  hexRow.appendChild(hexLabel);

  const decRow = document.createElement("div");
  decRow.className = "log-byte-row";
  const decLabel = document.createElement("span");
  decLabel.className = "log-byte-label";
  decLabel.textContent = "dec";
  decRow.appendChild(decLabel);

  for (let i = 0; i < count; i += 1) {
    const hexCell = document.createElement("code");
    hexCell.className = "log-byte-cell";
    hexCell.textContent = hexValues[i] || "";
    hexRow.appendChild(hexCell);

    const decCell = document.createElement("code");
    decCell.className = "log-byte-cell";
    decCell.textContent = decValues[i] || "";
    decRow.appendChild(decCell);
  }

  wrap.append(hexRow, decRow);
  return wrap;
}

function renderLog(lines) {
  logEl.innerHTML = "";
  for (const line of lines) {
    const row = parseLogLine(line);
    const entry = document.createElement("div");
    entry.className = "log-entry";

    const header = document.createElement("div");
    header.className = "log-entry-header";
    header.textContent = row.time ? `${row.time}  ${row.message}` : row.message;
    entry.appendChild(header);

    if (row.hex || row.dec) {
      entry.appendChild(makeAlignedByteRows(row.hex, row.dec));
    }

    logEl.appendChild(entry);
  }
}function addLog(text) {
  const now = new Date().toLocaleTimeString();
  localLogLines.unshift(`[${now}] ${text}`);
  renderLog(localLogLines);
}
function compact(hex) {
  return hex.replace(/\s+/g, "").toLowerCase();
}

function decimalBytes(hex) {
  return splitBytes(hex).filter((pair) => validPair(pair)).map((pair) => String(parseInt(pair, 16))).join(" ");
}

function hexPairs(hex) {
  return splitBytes(hex).join(" ");
}

function splitBytes(hex) {
  const clean = compact(hex);
  const pairs = [];
  for (let i = 0; i < clean.length; i += 2) {
    pairs.push(clean.slice(i, i + 2));
  }
  return pairs;
}

function activeByteCells() {
  let last = -1;
  byteCells.forEach((cell, index) => {
    if (cell.hexInput.value.trim() !== "" || cell.decInput.value.trim() !== "") last = index;
  });
  return last < 0 ? [] : byteCells.slice(0, last + 1);
}

function currentHex() {
  return activeByteCells().map((cell) => {
    const value = cell.hexInput.value.trim().toLowerCase();
    return validPair(value) ? value : "00";
  }).join("");
}

function setByteInput(input, value) {
  const wrapped = ((value % 256) + 256) % 256;
  input.value = wrapped.toString(16).padStart(2, "0").toUpperCase();
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function setByteCell(cell, value) {
  const wrapped = ((value % 256) + 256) % 256;
  cell.hexInput.value = wrapped.toString(16).padStart(2, "0").toUpperCase();
  cell.decInput.value = String(wrapped);
  markCellState(cell);
  refreshPayload();
}

function syncFromHex(cell) {
  cell.hexInput.value = cell.hexInput.value.replace(/[^0-9a-fA-F]/g, "").slice(0, 2).toUpperCase();
  const value = cell.hexInput.value.trim();
  cell.decInput.value = validPair(value) ? String(parseInt(value, 16)) : "";
  markCellState(cell);
  refreshPayload();
}

function syncFromDecimal(cell) {
  cell.decInput.value = cell.decInput.value.replace(/[^0-9]/g, "").slice(0, 3);
  if (cell.decInput.value.trim() === "") {
    cell.hexInput.value = "";
  } else {
    const clamped = Math.max(0, Math.min(255, Number(cell.decInput.value)));
    cell.decInput.value = String(clamped);
    cell.hexInput.value = clamped.toString(16).padStart(2, "0").toUpperCase();
  }
  markCellState(cell);
  refreshPayload();
}

function markCellState(cell) {
  const value = cell.hexInput.value.trim().toLowerCase();
  const active = value !== "" || cell.decInput.value.trim() !== "";
  cell.hexCell.classList.toggle("empty", !active);
  cell.decCell.classList.toggle("empty", !active);
  cell.hexCell.classList.toggle("changed", active && value !== cell.basePair);
  cell.hexCell.classList.toggle("bad", active && !validPair(value));
}
function validPair(value) {
  return /^[0-9a-fA-F]{2}$/.test(value);
}

function changedBytes() {
  return activeByteCells()
    .map((cell, index) => ({ index, from: cell.basePair || "", to: cell.hexInput.value.trim().toLowerCase() || "00" }))
    .filter((row) => row.from !== row.to);
}

function refreshPayload() {
  updateObservedSummary();
}

function renderBytes(hex) {
  baseHex = compact(hex);
  bytesEl.innerHTML = "";
  byteCells = [];
  const pairs = splitBytes(baseHex);
  const columns = 16;
  const visibleCount = Math.max(32, Math.ceil((pairs.length + 16) / columns) * columns);
  const table = document.createElement("table");
  table.className = "byte-table";

  for (let rowStart = 0; rowStart < visibleCount; rowStart += columns) {
    const indexRow = document.createElement("tr");
    indexRow.className = "index-row";
    const hexRow = document.createElement("tr");
    hexRow.className = "hex-row";
    const decRow = document.createElement("tr");
    decRow.className = "decimal-row";

    for (let col = 0; col < columns; col += 1) {
      const index = rowStart + col;
      const pair = pairs[index] || "";

      const indexCell = document.createElement("th");
      indexCell.textContent = String(index);
      indexRow.appendChild(indexCell);

      const hexCell = document.createElement("td");
      const hexInput = document.createElement("input");
      hexInput.className = "hex-input";
      hexInput.value = pair.toUpperCase();
      hexInput.maxLength = 2;
      hexInput.spellcheck = false;
      hexInput.placeholder = "--";
      hexInput.title = `byte ${index} hex`;

      const controls = document.createElement("div");
      controls.className = "byte-controls";
      const down = document.createElement("button");
      down.type = "button";
      down.textContent = "-";
      down.title = `decrement byte ${index}`;
      const up = document.createElement("button");
      up.type = "button";
      up.textContent = "+";
      up.title = `increment byte ${index}`;
      controls.append(down, up);
      hexCell.append(hexInput, controls);
      hexRow.appendChild(hexCell);

      const decCell = document.createElement("td");
      const decInput = document.createElement("input");
      decInput.className = "dec-input";
      decInput.value = pair ? String(parseInt(pair, 16)) : "";
      decInput.maxLength = 3;
      decInput.spellcheck = false;
      decInput.placeholder = "---";
      decInput.title = `byte ${index} decimal`;
      decCell.appendChild(decInput);
      decRow.appendChild(decCell);

      const cell = { index, basePair: pair, hexInput, decInput, hexCell, decCell };
      hexInput.addEventListener("input", () => syncFromHex(cell));
      decInput.addEventListener("input", () => syncFromDecimal(cell));
      down.addEventListener("click", () => setByteCell(cell, parseInt(hexInput.value || "0", 16) - 1));
      up.addEventListener("click", () => setByteCell(cell, parseInt(hexInput.value || "0", 16) + 1));
      byteCells.push(cell);
      markCellState(cell);
    }

    table.append(indexRow, hexRow, decRow);

    if (rowStart + columns < visibleCount) {
      const spacer = document.createElement("tr");
      spacer.className = "spacer-row";
      const spacerCell = document.createElement("td");
      spacerCell.colSpan = columns;
      spacer.appendChild(spacerCell);
      table.appendChild(spacer);
    }
  }

  bytesEl.appendChild(table);
  refreshPayload();
}function keyFor(x, y) {
  return `${x},${y}`;
}

function applyObservedStyle(button, pixel) {
  const brightness = Math.max(1, Math.min(10, Number(pixel.brightness) || 5));
  button.className = "cell marked";
  button.style.background = COLOR_STYLES[pixel.color] || COLOR_STYLES.mixed;
  button.style.opacity = String(0.35 + brightness * 0.065);
  button.title = `x=${pixel.x}, y=${pixel.y}, ${pixel.color || "unknown"}, brightness ${pixel.brightness || "unknown"}`;
}

function updateObservedSummary() {
  const hex = currentHex();
  payloadEl.textContent = [
    hex,
    `hex pairs: ${hexPairs(hex)}`,
    `decimal: ${decimalBytes(hex)}`,
    "",
    `bytes: ${hex.length / 2}`,
    changedBytes().length ? `changed: ${JSON.stringify(changedBytes())}` : "changed: none",
    observedPixels.length ? `observed pixels: ${JSON.stringify(observedPixels)}` : "observed pixels: none",
    activeByteCells().some((cell) => !validPair(cell.hexInput.value.trim())) ? "status: invalid byte present" : "status: valid",
  ].join("\n");
}

function renderObservedGrid() {
  if (!observedGridEl) return;
  observedGridEl.innerHTML = "";
  for (let y = 0; y < 12; y += 1) {
    for (let x = 0; x < 12; x += 1) {
      const button = document.createElement("button");
      button.className = "cell";
      button.textContent = `${x},${y}`;
      button.title = `x=${x}, y=${y}`;
      button.addEventListener("click", () => toggleObservedPixel(button, x, y));
      observedGridEl.appendChild(button);
    }
  }
}

function toggleObservedPixel(button, x, y) {
  const existing = observedPixels.findIndex((pixel) => pixel.x === x && pixel.y === y);
  if (existing >= 0) {
    observedPixels.splice(existing, 1);
    button.className = "cell";
    button.style.background = "";
    button.style.opacity = "";
    button.title = `x=${x}, y=${y}`;
    updateObservedSummary();
    return;
  }

  const pixel = {
    x,
    y,
    color: colorEl.value || "unknown",
    brightness: brightnessEl.value ? Number(brightnessEl.value) : null,
  };
  observedPixels.push(pixel);
  applyObservedStyle(button, pixel);
  updateObservedSummary();
}

function clearObservedPixels() {
  observedPixels = [];
  if (!observedGridEl) return;
  for (const cell of observedGridEl.querySelectorAll(".cell")) {
    cell.className = "cell";
    cell.style.background = "";
    cell.style.opacity = "";
  }
  updateObservedSummary();
}
function renderBaseOptions() {
  baseEl.innerHTML = "";
  const sources = { ...BUILT_IN_BASES, ...config.canvases };
  for (const [name, hex] of Object.entries(sources)) {
    const option = document.createElement("option");
    option.value = hex;
    option.textContent = `${name} (${hex.length / 2} bytes)`;
    baseEl.appendChild(option);
  }
}

async function refreshStatus() {
  const status = await api("/api/status");
  statusEl.textContent = `${status.connected ? "Connected" : "Disconnected"} | paint ${status.paintStarted ? "started" : "not started"} | ${status.address}`;
  if (status.log && status.log.length) {
    localLogLines = status.log.slice().reverse();
    renderLog(localLogLines);
  }
}

async function sendBytes() {
  if (activeByteCells().some((cell) => !validPair(cell.hexInput.value.trim()))) {
    addLog("not sent: invalid byte");
    return;
  }
  const hex = currentHex();
  const result = await api("/api/send-canvas", { canvas: hex, startIfNeeded: false });
  lastSent = { compactCanvasHex: hex, changedBytes: changedBytes(), commandHex: result.commandHex };
  addLog(`sent ${result.canvasBytes} bytes hex: ${hexPairs(hex)} | dec: ${decimalBytes(hex)}`);
  await refreshStatus();
}

async function saveObservation() {
  const record = {
    kind: "hex_pair_observation",
    baseHex,
    compactCanvasHex: currentHex(),
    changedBytes: changedBytes(),
    note: noteEl.value.trim(),
    color: colorEl.value,
    brightness: brightnessEl.value ? Number(brightnessEl.value) : null,
    sent: lastSent && lastSent.compactCanvasHex === currentHex(),
    observedPixels: observedPixels,
  };
  await api("/api/observe", record);
  savedEl.textContent = JSON.stringify(record, null, 2) + "\n\n" + savedEl.textContent;
  addLog(`saved: ${record.note || "no note"}`);
}

document.querySelector("#connect").addEventListener("click", async () => {
  await api("/api/connect", {});
  addLog("connected");
  await refreshStatus();
});

document.querySelector("#startPaint").addEventListener("click", async () => {
  await api("/api/start-paint", {});
  addLog("sent start paint");
  await refreshStatus();
});

document.querySelector("#send").addEventListener("click", sendBytes);
document.querySelector("#sendNearBytes").addEventListener("click", sendBytes);
document.querySelector("#save").addEventListener("click", saveObservation);
document.querySelector("#loadBase").addEventListener("click", () => renderBytes(baseEl.value));
document.querySelector("#reset").addEventListener("click", () => renderBytes(baseHex));
document.querySelector("#clearPixels").addEventListener("click", clearObservedPixels);

for (const button of document.querySelectorAll(".quick-notes button")) {
  button.addEventListener("click", () => {
    noteEl.value = button.dataset.note || "";
    colorEl.value = button.dataset.color || "";
  });
}

async function init() {
  config = await api("/api/config");
  renderBaseOptions();
  renderBytes(baseEl.value || baseHex);
  renderObservedGrid();
  await refreshStatus();
  setInterval(refreshStatus, 1000);
}

init().catch((err) => addLog(err.message));
