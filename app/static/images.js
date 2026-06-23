const statusEl = document.querySelector("#status");
const logEl = document.querySelector("#log");
const previewEl = document.querySelector("#preview");
const gridEl = document.querySelector("#grid");
const canvas = document.querySelector("#sourceCanvas");
const dropZoneEl = document.querySelector(".source-canvas-wrap");
const ctx = canvas.getContext("2d");
const fileEl = document.querySelector("#imageFile");
const zoomEl = document.querySelector("#zoom");
const pixelSizeEl = document.querySelector("#pixelSize");
const offsetXEl = document.querySelector("#offsetX");
const offsetYEl = document.querySelector("#offsetY");
const brightnessEl = document.querySelector("#brightness");
const contrastEl = document.querySelector("#contrast");
const saturationEl = document.querySelector("#saturation");
const ditherEl = document.querySelector("#dither");
const layoutNameEl = document.querySelector("#layoutName");
const layoutSelectEl = document.querySelector("#layoutSelect");
const layoutJsonEl = document.querySelector("#layoutJson");

const W = 12;
const H = 12;
const STORAGE_KEY = "codex_arcade_image_layouts_v1";
const cells = [];
let sourceImage = null;
let sourceDataUrl = "";
let pixels = Array.from({ length: W * H }, () => [0, 0, 0]);
let dragging = false;
let dragStart = null;

async function api(path, body = null) {
  const opts = body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {};
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
  return Math.max(0, Math.min(255, Math.round(value)));
}

function settings() {
  return {
    zoom: Number(zoomEl.value),
    pixelSize: Number(pixelSizeEl.value),
    offsetX: Number(offsetXEl.value),
    offsetY: Number(offsetYEl.value),
    brightness: Number(brightnessEl.value),
    contrast: Number(contrastEl.value),
    saturation: Number(saturationEl.value),
    dither: ditherEl.value,
  };
}

function applySettings(s) {
  zoomEl.value = String(s.zoom ?? 1);
  pixelSizeEl.value = String(s.pixelSize ?? 24);
  offsetXEl.value = String(s.offsetX ?? 0);
  offsetYEl.value = String(s.offsetY ?? 0);
  brightnessEl.value = String(s.brightness ?? 1);
  contrastEl.value = String(s.contrast ?? 1);
  saturationEl.value = String(s.saturation ?? 1);
  ditherEl.value = s.dither ?? "none";
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
    const lit = rgb.some((v) => v > 0);
    const cell = cells[index];
    cell.classList.toggle("lit", lit);
    cell.style.background = lit ? `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})` : "";
    cell.style.color = lit && rgb[0] + rgb[1] + rgb[2] < 380 ? "#fff" : "";
  });
}

function adjustedRgb(r, g, b) {
  const s = settings();
  r *= s.brightness; g *= s.brightness; b *= s.brightness;
  r = (r - 128) * s.contrast + 128;
  g = (g - 128) * s.contrast + 128;
  b = (b - 128) * s.contrast + 128;
  const grey = r * 0.299 + g * 0.587 + b * 0.114;
  r = grey + (r - grey) * s.saturation;
  g = grey + (g - grey) * s.saturation;
  b = grey + (b - grey) * s.saturation;
  if (s.dither === "threshold") {
    r = r > 128 ? 255 : r * 0.45;
    g = g > 128 ? 255 : g * 0.45;
    b = b > 128 ? 255 : b * 0.45;
  }
  return [clampByte(r), clampByte(g), clampByte(b)];
}

function drawSource() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (!sourceImage) {
    ctx.fillStyle = "#69737d";
    ctx.font = "16px Arial";
    ctx.fillText("Load an image", 120, 180);
    return;
  }
  const s = settings();
  const base = Math.min(canvas.width / sourceImage.width, canvas.height / sourceImage.height);
  const scale = base * s.zoom;
  const dw = sourceImage.width * scale;
  const dh = sourceImage.height * scale;
  const dx = (canvas.width - dw) / 2 + s.offsetX;
  const dy = (canvas.height - dh) / 2 + s.offsetY;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(sourceImage, dx, dy, dw, dh);
  ctx.strokeStyle = "#111";
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, canvas.width, canvas.height);
}

function sampleImage() {
  drawSource();
  const small = document.createElement("canvas");
  small.width = W;
  small.height = H;
  const smallCtx = small.getContext("2d", { willReadFrequently: true });
  smallCtx.imageSmoothingEnabled = true;
  smallCtx.drawImage(canvas, 0, 0, W, H);
  const data = smallCtx.getImageData(0, 0, W, H).data;
  pixels = [];
  for (let i = 0; i < data.length; i += 4) {
    pixels.push(adjustedRgb(data[i], data[i + 1], data[i + 2]));
  }
  renderPixelPreview();
  previewEl.textContent = `image preview\nsource=${sourceImage ? `${sourceImage.width}x${sourceImage.height}` : "none"}\nsettings=${JSON.stringify(settings())}`;
}

function displayToWirePixel(pixel) {
  return [pixel[2], pixel[1], pixel[0]];
}

async function sendImage() {
  sampleImage();
  const result = await api("/api/send-rgb-buffer", {
    width: W,
    height: H,
    pixels: pixels.map(displayToWirePixel),
    startIfNeeded: false,
  });
  previewEl.textContent += `\ncompact bytes=${result.canvasBytes}\ncompact hex=${result.canvasHex}`;
  addLog(`sent image ${result.canvasBytes} bytes`);
  await refreshStatus();
}

function loadImageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

async function loadFile(file) {
  if (!file) return;
  if (!file.type.startsWith("image/")) throw new Error("drop an image file");
  sourceDataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  sourceImage = await loadImageFromDataUrl(sourceDataUrl);
  fitCover();
  addLog(`loaded ${file.name}`);
}

async function handleFile() {
  await loadFile(fileEl.files[0]);
}

function fitContain() {
  zoomEl.value = "1";
  offsetXEl.value = "0";
  offsetYEl.value = "0";
  sampleImage();
}

function fitCover() {
  if (!sourceImage) { sampleImage(); return; }
  const contain = Math.min(canvas.width / sourceImage.width, canvas.height / sourceImage.height);
  const cover = Math.max(canvas.width / sourceImage.width, canvas.height / sourceImage.height);
  zoomEl.value = String(cover / contain);
  offsetXEl.value = "0";
  offsetYEl.value = "0";
  sampleImage();
}

function centerCrop() {
  offsetXEl.value = "0";
  offsetYEl.value = "0";
  sampleImage();
}

function clearImage() {
  sourceImage = null;
  sourceDataUrl = "";
  pixels = Array.from({ length: W * H }, () => [0, 0, 0]);
  drawSource();
  renderPixelPreview();
  previewEl.textContent = "cleared";
}

function layouts() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); }
  catch { return {}; }
}

function saveLayouts(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  renderLayoutSelect();
}

function renderLayoutSelect() {
  const data = layouts();
  layoutSelectEl.innerHTML = "";
  for (const name of Object.keys(data).sort()) {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    layoutSelectEl.appendChild(option);
  }
}

function saveLayout() {
  const name = layoutNameEl.value.trim();
  if (!name) throw new Error("layout name required");
  if (!sourceDataUrl) throw new Error("load an image first");
  const data = layouts();
  data[name] = { name, sourceDataUrl, settings: settings(), savedAt: new Date().toISOString() };
  saveLayouts(data);
  layoutSelectEl.value = name;
  addLog(`saved layout ${name}`);
}

async function loadLayout() {
  const name = layoutSelectEl.value;
  const item = layouts()[name];
  if (!item) throw new Error("layout not found");
  layoutNameEl.value = name;
  sourceDataUrl = item.sourceDataUrl;
  sourceImage = await loadImageFromDataUrl(sourceDataUrl);
  applySettings(item.settings || {});
  sampleImage();
  addLog(`loaded layout ${name}`);
}

function deleteLayout() {
  const name = layoutSelectEl.value;
  const data = layouts();
  delete data[name];
  saveLayouts(data);
  addLog(`deleted layout ${name}`);
}

function exportLayouts() {
  layoutJsonEl.value = JSON.stringify(layouts(), null, 2);
  addLog("exported layouts");
}

function importLayouts() {
  const data = JSON.parse(layoutJsonEl.value || "{}");
  saveLayouts(data);
  addLog("imported layouts");
}

async function refreshStatus() {
  const status = await api("/api/status");
  statusEl.textContent = `${status.connected ? "Connected" : "Disconnected"} | paint ${status.paintStarted ? "started" : "not started"} | ${status.address}`;
}

canvas.addEventListener("pointerdown", (event) => {
  dragging = true;
  dragStart = { x: event.clientX, y: event.clientY, ox: Number(offsetXEl.value), oy: Number(offsetYEl.value) };
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener("pointermove", (event) => {
  if (!dragging || !dragStart) return;
  offsetXEl.value = String(dragStart.ox + event.clientX - dragStart.x);
  offsetYEl.value = String(dragStart.oy + event.clientY - dragStart.y);
  sampleImage();
});
canvas.addEventListener("pointerup", () => { dragging = false; });

[fileEl].forEach((el) => el.addEventListener("change", () => handleFile().catch((err) => addLog(err.message))));
["dragenter", "dragover"].forEach((name) => {
  dropZoneEl.addEventListener(name, (event) => {
    event.preventDefault();
    event.stopPropagation();
    dropZoneEl.classList.add("drag-over");
  });
});
["dragleave", "drop"].forEach((name) => {
  dropZoneEl.addEventListener(name, (event) => {
    event.preventDefault();
    event.stopPropagation();
    dropZoneEl.classList.remove("drag-over");
  });
});
dropZoneEl.addEventListener("drop", (event) => {
  const file = Array.from(event.dataTransfer.files || []).find((item) => item.type.startsWith("image/"));
  loadFile(file).catch((err) => addLog(err.message));
});
[zoomEl, pixelSizeEl, offsetXEl, offsetYEl, brightnessEl, contrastEl, saturationEl, ditherEl].forEach((el) => el.addEventListener("input", sampleImage));
document.querySelector("#connect").addEventListener("click", async () => { await api("/api/connect", {}); addLog("connected"); await refreshStatus(); });
document.querySelector("#startPaint").addEventListener("click", async () => { await api("/api/start-paint", {}); addLog("sent start paint"); await refreshStatus(); });
document.querySelector("#disconnect").addEventListener("click", async () => { await api("/api/disconnect", {}); addLog("disconnected"); await refreshStatus(); });
document.querySelector("#fitContain").addEventListener("click", fitContain);
document.querySelector("#fitCover").addEventListener("click", fitCover);
document.querySelector("#centerCrop").addEventListener("click", centerCrop);
document.querySelector("#sendImage").addEventListener("click", () => sendImage().catch((err) => addLog(err.message)));
document.querySelector("#clearImage").addEventListener("click", clearImage);
document.querySelector("#saveLayout").addEventListener("click", () => { try { saveLayout(); } catch (err) { addLog(err.message); } });
document.querySelector("#loadLayout").addEventListener("click", () => loadLayout().catch((err) => addLog(err.message)));
document.querySelector("#deleteLayout").addEventListener("click", deleteLayout);
document.querySelector("#exportLayouts").addEventListener("click", exportLayouts);
document.querySelector("#importLayouts").addEventListener("click", () => { try { importLayouts(); } catch (err) { addLog(err.message); } });

function init() {
  drawGrid();
  renderLayoutSelect();
  drawSource();
  renderPixelPreview();
  refreshStatus().catch((err) => addLog(err.message));
  setInterval(() => refreshStatus().catch(() => {}), 1500);
}

init();

