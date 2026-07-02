const statusEl = document.querySelector("#status");
const logEl = document.querySelector("#log");
const previewEl = document.querySelector("#preview");
const gridEl = document.querySelector("#grid");
const canvas = document.querySelector("#sourceCanvas");
const ctx = canvas.getContext("2d");
const textInputEl = document.querySelector("#textInput");
const caseModeEl = document.querySelector("#caseMode");
const textColorEl = document.querySelector("#textColor");
const bgColorEl = document.querySelector("#bgColor");
const scaleEl = document.querySelector("#scale");
const offsetXEl = document.querySelector("#offsetX");
const offsetYEl = document.querySelector("#offsetY");
const spacingEl = document.querySelector("#spacing");
const lineSpacingEl = document.querySelector("#lineSpacing");
const variantEl = document.querySelector("#variant");

const W = 12;
const H = 12;
const cells = [];
let pixels = Array.from({ length: W * H }, () => [0, 0, 0]);

const FONT = {
  " ": ["0", "0", "0", "0", "0"],
  "!": ["1", "1", "1", "0", "1"],
  ".": ["0", "0", "0", "0", "1"],
  ",": ["0", "0", "0", "1", "1"],
  ":": ["0", "1", "0", "1", "0"],
  "?": ["111", "001", "011", "000", "010"],
  "-": ["000", "000", "111", "000", "000"],
  "_": ["000", "000", "000", "000", "111"],
  "+": ["000", "010", "111", "010", "000"],
  "/": ["001", "001", "010", "100", "100"],
  "0": ["111", "101", "101", "101", "111"],
  "1": ["010", "110", "010", "010", "111"],
  "2": ["111", "001", "111", "100", "111"],
  "3": ["111", "001", "111", "001", "111"],
  "4": ["101", "101", "111", "001", "001"],
  "5": ["111", "100", "111", "001", "111"],
  "6": ["111", "100", "111", "101", "111"],
  "7": ["111", "001", "010", "010", "010"],
  "8": ["111", "101", "111", "101", "111"],
  "9": ["111", "101", "111", "001", "111"],
  A: ["010", "101", "111", "101", "101"],
  B: ["110", "101", "110", "101", "110"],
  C: ["111", "100", "100", "100", "111"],
  D: ["110", "101", "101", "101", "110"],
  E: ["111", "100", "110", "100", "111"],
  F: ["111", "100", "110", "100", "100"],
  G: ["111", "100", "101", "101", "111"],
  H: ["101", "101", "111", "101", "101"],
  I: ["111", "010", "010", "010", "111"],
  J: ["001", "001", "001", "101", "111"],
  K: ["101", "101", "110", "101", "101"],
  L: ["100", "100", "100", "100", "111"],
  M: ["101", "111", "111", "101", "101"],
  N: ["101", "111", "111", "111", "101"],
  O: ["111", "101", "101", "101", "111"],
  P: ["111", "101", "111", "100", "100"],
  Q: ["111", "101", "101", "111", "001"],
  R: ["111", "101", "111", "110", "101"],
  S: ["111", "100", "111", "001", "111"],
  T: ["111", "010", "010", "010", "010"],
  U: ["101", "101", "101", "101", "111"],
  V: ["101", "101", "101", "101", "010"],
  W: ["101", "101", "111", "111", "101"],
  X: ["101", "101", "010", "101", "101"],
  Y: ["101", "101", "010", "010", "010"],
  Z: ["111", "001", "010", "100", "111"],
  a: ["000", "011", "101", "101", "011"],
  b: ["100", "110", "101", "101", "110"],
  c: ["000", "011", "100", "100", "011"],
  d: ["001", "011", "101", "101", "011"],
  e: ["000", "111", "101", "110", "011"],
  f: ["011", "010", "111", "010", "010"],
  g: ["000", "011", "101", "011", "001"],
  h: ["100", "110", "101", "101", "101"],
  i: ["010", "000", "010", "010", "010"],
  j: ["001", "000", "001", "101", "111"],
  k: ["100", "101", "110", "101", "101"],
  l: ["010", "010", "010", "010", "011"],
  m: ["000", "1101", "1111", "1011", "1011"],
  n: ["000", "110", "101", "101", "101"],
  o: ["000", "010", "101", "101", "010"],
  p: ["000", "110", "101", "110", "100"],
  q: ["000", "011", "101", "011", "001"],
  r: ["000", "101", "110", "100", "100"],
  s: ["000", "011", "110", "001", "110"],
  t: ["010", "111", "010", "010", "011"],
  u: ["000", "101", "101", "101", "011"],
  v: ["000", "101", "101", "101", "010"],
  w: ["000", "101", "101", "111", "101"],
  x: ["000", "101", "010", "010", "101"],
  y: ["000", "101", "101", "011", "001"],
  z: ["000", "111", "001", "010", "111"],
};

const WIDE = {
  M: ["10001", "11011", "10101", "10001", "10001", "10001", "10001"],
  W: ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
  m: ["00000", "00000", "11010", "10101", "10101", "10101", "10101"],
  w: ["00000", "00000", "10001", "10001", "10101", "10101", "01010"],
};

async function api(path, body = null, timeoutMs = 9000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const opts = body ? {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: controller.signal,
  } : { signal: controller.signal };
  try {
    const res = await fetch(path, opts);
    const data = await res.json();
    if (!res.ok || data.ok === false) throw new Error(data.error || res.statusText);
    return data;
  } catch (err) {
    if (err.name === "AbortError") throw new Error(`request timed out: ${path}`);
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

function addLog(text) {
  const now = new Date().toLocaleTimeString();
  logEl.textContent = `[${now}] ${text}\n` + logEl.textContent;
}

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function hexToRgb(hex) {
  const value = hex.replace("#", "");
  return [parseInt(value.slice(0, 2), 16), parseInt(value.slice(2, 4), 16), parseInt(value.slice(4, 6), 16)];
}

function displayText() {
  const raw = textInputEl.value || "";
  if (caseModeEl.value === "upper") return raw.toUpperCase();
  if (caseModeEl.value === "lower") return raw.toLowerCase();
  if (caseModeEl.value === "title") return raw.replace(/\S+/g, (word) => word[0].toUpperCase() + word.slice(1).toLowerCase());
  return raw;
}

function glyphFor(ch) {
  if (variantEl.value === "wide" && WIDE[ch]) return WIDE[ch];
  return FONT[ch] || FONT["?"];
}

function drawGrid() {
  if (cells.length) return;
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const button = document.createElement("button");
      button.className = "cell";
      button.textContent = `${x},${y}`;
      cells.push(button);
      gridEl.appendChild(button);
    }
  }
}

function renderPixelPreview() {
  pixels.forEach((rgb, index) => {
    const lit = rgb.some((value) => value > 0);
    const cell = cells[index];
    cell.classList.toggle("lit", lit);
    cell.style.background = lit ? `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})` : "";
    cell.style.color = lit && rgb[0] + rgb[1] + rgb[2] < 380 ? "#fff" : "";
  });
}

function setPixel(x, y, rgb) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  pixels[y * W + x] = rgb.map(clampByte);
}

function textLines() {
  return displayText().split(/\r?\n/);
}

function maxGlyphRows(lines) {
  let rows = 5;
  for (const line of lines) {
    for (const ch of line) rows = Math.max(rows, glyphFor(ch).length);
  }
  return rows;
}

function autoBaseY(lines, scale, glyphRows) {
  if (lines.length > 1) return 0;
  return Math.max(0, Math.floor((H - glyphRows * scale) / 2));
}

function renderBitmapText() {
  const fg = hexToRgb(textColorEl.value);
  const bg = hexToRgb(bgColorEl.value);
  const scale = Math.max(1, Number(scaleEl.value) || 1);
  const spacing = Number(spacingEl.value) || 0;
  const lineSpacing = Number(lineSpacingEl?.value) || 0;
  const startX = Number(offsetXEl.value) || 0;
  const lines = textLines();
  const glyphRows = maxGlyphRows(lines);
  const startY = autoBaseY(lines, scale, glyphRows) + (Number(offsetYEl.value) || 0);

  pixels = Array.from({ length: W * H }, () => [...bg]);
  lines.forEach((line, lineIndex) => {
    let cursorX = startX;
    const top = startY + lineIndex * (glyphRows * scale + lineSpacing);
    for (const ch of line) {
      const glyph = glyphFor(ch);
      const glyphWidth = Math.max(...glyph.map((row) => row.length));
      glyph.forEach((row, gy) => {
        [...row].forEach((bit, gx) => {
          if (bit !== "1") return;
          for (let sy = 0; sy < scale; sy += 1) {
            for (let sx = 0; sx < scale; sx += 1) {
              setPixel(cursorX + gx * scale + sx, top + gy * scale + sy, fg);
            }
          }
        });
      });
      cursorX += glyphWidth * scale + spacing;
    }
  });
}

function drawMagnifiedPreview() {
  const size = canvas.width / W;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  pixels.forEach((rgb, index) => {
    const x = index % W;
    const y = Math.floor(index / W);
    ctx.fillStyle = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
    ctx.fillRect(x * size, y * size, size, size);
  });
  ctx.strokeStyle = "rgba(255,255,255,0.16)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= W; i += 1) {
    ctx.beginPath();
    ctx.moveTo(i * size, 0);
    ctx.lineTo(i * size, canvas.height);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i * size);
    ctx.lineTo(canvas.width, i * size);
    ctx.stroke();
  }
}

function updateText() {
  renderBitmapText();
  renderPixelPreview();
  drawMagnifiedPreview();
  previewEl.textContent = `text="${displayText()}"\nlines=${textLines().length}\nfont=${variantEl.value}\ncolour=${textColorEl.value}\nscale=${scaleEl.value}\noffset=(${offsetXEl.value}, ${offsetYEl.value})`;
}

function displayToWirePixel(pixel) {
  return [pixel[2], pixel[1], pixel[0]];
}

async function sendText() {
  updateText();
  const result = await api("/api/send-rgb-buffer", {
    width: W,
    height: H,
    pixels: pixels.map(displayToWirePixel),
    startIfNeeded: false,
  });
  previewEl.textContent += `\ncompact bytes=${result.canvasBytes}\ncompact hex=${result.canvasHex}`;
  addLog(`sent text "${displayText()}" ${result.canvasBytes} bytes`);
  await refreshStatus();
}

function clearText() {
  textInputEl.value = "";
  updateText();
}

async function refreshStatus() {
  const status = await api("/api/status");
  statusEl.textContent = `${status.connected ? "Connected" : "Disconnected"} | paint ${status.paintStarted ? "started" : "not started"} | ${status.address}`;
}

document.querySelector("#connect").addEventListener("click", async () => { await api("/api/connect", {}, 14000); addLog("connected"); await refreshStatus(); });
document.querySelector("#reconnect").addEventListener("click", async () => { await api("/api/reconnect", {}, 14000); addLog("reconnected"); await refreshStatus(); });
document.querySelector("#startPaint").addEventListener("click", async () => { await api("/api/start-paint", {}, 11000); addLog("sent start paint"); await refreshStatus(); });
document.querySelector("#sendText").addEventListener("click", () => sendText().catch((err) => addLog(err.message)));
document.querySelector("#clearText").addEventListener("click", clearText);
[textInputEl, caseModeEl, textColorEl, bgColorEl, scaleEl, offsetXEl, offsetYEl, spacingEl, lineSpacingEl, variantEl].filter(Boolean).forEach((el) => {
  el.addEventListener("input", updateText);
  el.addEventListener("change", updateText);
});

function init() {
  drawGrid();
  updateText();
  refreshStatus().catch((err) => addLog(err.message));
  setInterval(() => refreshStatus().catch(() => {}), 1500);
}

init();