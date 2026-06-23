const statusEl = document.querySelector("#status");
const gridEl = document.querySelector("#grid");
const logEl = document.querySelector("#log");
const previewEl = document.querySelector("#preview");
const rEl = document.querySelector("#r");
const gEl = document.querySelector("#g");
const bEl = document.querySelector("#b");
const swatchesEl = document.querySelector("#swatches");

const WIDTH = 12;
const HEIGHT = 12;
const pixelBuffer = Array.from({ length: WIDTH * HEIGHT }, () => [0, 0, 0]);
const cells = [];

const SWATCHES = [
  ["stock blue-ish", 5, 20, 220],
  ["red", 255, 0, 0],
  ["green", 0, 255, 0],
  ["blue", 0, 0, 255],
  ["white", 255, 255, 255],
  ["yellow", 255, 255, 0],
  ["cyan", 0, 255, 255],
  ["magenta", 255, 0, 255],
];

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

function clampByte(value) {
  return Math.max(0, Math.min(255, Number(value) || 0));
}

function colour() {
  return {
    r: clampByte(rEl.value),
    g: clampByte(gEl.value),
    b: clampByte(bEl.value),
  };
}

function setColour(r, g, b) {
  rEl.value = String(r);
  gEl.value = String(g);
  bEl.value = String(b);
}

function mode() {
  return document.querySelector('input[name="mode"]:checked').value;
}

function idxFor(x, y) {
  return y * WIDTH + x;
}

function isLit(rgb) {
  return rgb[0] !== 0 || rgb[1] !== 0 || rgb[2] !== 0;
}

function litCount() {
  return pixelBuffer.filter(isLit).length;
}

function renderCell(index) {
  const button = cells[index];
  const rgb = pixelBuffer[index];
  if (!button) return;
  button.classList.toggle("set", isLit(rgb));
  if (isLit(rgb)) {
    button.style.background = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
    button.style.color = rgb[0] + rgb[1] + rgb[2] > 380 ? "#111" : "#fff";
  } else {
    button.style.background = "";
    button.style.color = "";
  }
}

function renderAllCells() {
  for (let index = 0; index < pixelBuffer.length; index += 1) renderCell(index);
}

function setPixel(x, y, rgb) {
  const index = idxFor(x, y);
  pixelBuffer[index] = [rgb.r, rgb.g, rgb.b];
  renderCell(index);
}

function displayToWirePixel(pixel) {
  return [pixel[2], pixel[1], pixel[0]];
}

function displayToWireRgb(rgb) {
  return { r: rgb.b, g: rgb.g, b: rgb.r };
}

function wirePixels() {
  return pixelBuffer.map(displayToWirePixel);
}

function clearPixel(x, y) {
  const index = idxFor(x, y);
  pixelBuffer[index] = [0, 0, 0];
  renderCell(index);
}

function toggleBuildPixel(x, y) {
  const index = idxFor(x, y);
  if (isLit(pixelBuffer[index])) {
    clearPixel(x, y);
    addLog(`cleared ${x},${y}; selected=${litCount()}`);
  } else {
    const rgb = colour();
    setPixel(x, y, rgb);
    addLog(`marked ${x},${y} rgb(${rgb.r},${rgb.g},${rgb.b}); selected=${litCount()}`);
  }
}

function renderSwatches() {
  for (const [name, r, g, b] of SWATCHES) {
    const button = document.createElement("button");
    button.className = "swatch";
    button.textContent = name;
    button.style.background = `rgb(${r}, ${g}, ${b})`;
    button.style.color = r + g + b > 380 ? "#111" : "#fff";
    button.addEventListener("click", () => setColour(r, g, b));
    swatchesEl.appendChild(button);
  }
}

function renderGrid() {
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const button = document.createElement("button");
      button.className = "cell";
      button.textContent = `${x},${y}`;
      button.title = `${x},${y}`;
      button.addEventListener("click", () => {
        if (mode() === "single") sendPixel(x, y).catch((err) => addLog(err.message));
        else toggleBuildPixel(x, y);
      });
      cells.push(button);
      gridEl.appendChild(button);
    }
  }
}

async function refreshStatus() {
  const status = await api("/api/status");
  statusEl.textContent = `${status.connected ? "Connected" : "Disconnected"} | paint ${status.paintStarted ? "started" : "not started"} | ${status.address}`;
}

async function sendPixel(x, y) {
  const rgb = colour();
  const wire = displayToWireRgb(rgb);
  const result = await api("/api/send-single-pixel", { x, y, ...wire, startIfNeeded: false });
  previewEl.textContent = [
    `single pixel x=${x} y=${y}`,
    `display rgb=(${rgb.r}, ${rgb.g}, ${rgb.b})`,
    `wire bytes=(${wire.r}, ${wire.g}, ${wire.b})`,
    `compact bytes=${result.canvasBytes}`,
    `compact hex=${result.canvasHex}`,
  ].join("\n");
  addLog(`sent one ${x},${y} display rgb(${rgb.r},${rgb.g},${rgb.b}) wire(${wire.r},${wire.g},${wire.b}) ${result.canvasBytes} bytes`);
  await refreshStatus();
}

async function sendBuffer(label) {
  const result = await api("/api/send-rgb-buffer", {
    width: WIDTH,
    height: HEIGHT,
    pixels: wirePixels(),
    startIfNeeded: false,
  });
  previewEl.textContent = [
    label,
    `selected=${litCount()}`,
    `red/blue swapped for device wire order`,
    `compact bytes=${result.canvasBytes}`,
    `compact hex=${result.canvasHex}`,
  ].join("\n");
  addLog(`sent ${label} ${litCount()} lit pixel(s), ${result.canvasBytes} bytes`);
  await refreshStatus();
}

async function sendAllOff() {
  clearSelection(false);
  await sendBuffer("all off");
}

function clearSelection(log = true) {
  for (let index = 0; index < pixelBuffer.length; index += 1) {
    pixelBuffer[index] = [0, 0, 0];
  }
  renderAllCells();
  if (log) addLog("cleared selection");
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

document.querySelector("#sendBlack").addEventListener("click", () => sendAllOff().catch((err) => addLog(err.message)));
document.querySelector("#sendCanvas").addEventListener("click", () => sendBuffer("selected canvas").catch((err) => addLog(err.message)));
document.querySelector("#clearCanvas").addEventListener("click", () => clearSelection());

async function init() {
  renderSwatches();
  renderGrid();
  await refreshStatus();
  setInterval(() => refreshStatus().catch((err) => addLog(err.message)), 1500);
}

init().catch((err) => addLog(err.message));
