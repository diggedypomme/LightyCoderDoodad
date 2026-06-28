const statusEl = document.querySelector("#status");
const logEl = document.querySelector("#log");
const previewEl = document.querySelector("#preview");
const gridEl = document.querySelector("#grid");
const videoEl = document.querySelector("#cameraVideo");
const canvas = document.querySelector("#sourceCanvas");
const ctx = canvas.getContext("2d", { willReadFrequently: true });
const cameraSelectEl = document.querySelector("#cameraSelect");
const fpsEl = document.querySelector("#fps");
const zoomEl = document.querySelector("#zoom");
const brightnessEl = document.querySelector("#brightness");
const contrastEl = document.querySelector("#contrast");
const saturationEl = document.querySelector("#saturation");
const mirrorEl = document.querySelector("#mirror");
const ditherEl = document.querySelector("#dither");

const W = 12;
const H = 12;
const cells = [];
let stream = null;
let pixels = Array.from({ length: W * H }, () => [0, 0, 0]);
let sendTimer = null;
let sending = false;
let frame = 0;

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

function settings() {
  return {
    zoom: Number(zoomEl.value) || 1,
    brightness: Number(brightnessEl.value) || 1,
    contrast: Number(contrastEl.value) || 1,
    saturation: Number(saturationEl.value) || 1,
    mirror: mirrorEl.value === "on",
    dither: ditherEl.value,
  };
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

function drawCameraFrame() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (!videoEl.videoWidth || !videoEl.videoHeight) {
    ctx.fillStyle = "#dbe3ec";
    ctx.font = "16px Arial";
    ctx.fillText("Start camera", 132, 182);
    return;
  }

  const s = settings();
  const scale = Math.max(canvas.width / videoEl.videoWidth, canvas.height / videoEl.videoHeight) * s.zoom;
  const dw = videoEl.videoWidth * scale;
  const dh = videoEl.videoHeight * scale;
  const dx = (canvas.width - dw) / 2;
  const dy = (canvas.height - dh) / 2;
  ctx.save();
  if (s.mirror) {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(videoEl, dx, dy, dw, dh);
  } else {
    ctx.drawImage(videoEl, dx, dy, dw, dh);
  }
  ctx.restore();
}

function sampleFrame() {
  drawCameraFrame();
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
  previewEl.textContent = `webcam frame=${frame}\nfps=${fps()}\nsettings=${JSON.stringify(settings())}`;
}

function displayToWirePixel(pixel) {
  return [pixel[2], pixel[1], pixel[0]];
}

function fps() {
  return Math.max(1, Math.min(15, Number(fpsEl.value) || 4));
}

async function refreshDevices() {
  if (!navigator.mediaDevices?.enumerateDevices) return;
  const devices = await navigator.mediaDevices.enumerateDevices();
  const cameras = devices.filter((device) => device.kind === "videoinput");
  const previous = cameraSelectEl.value;
  cameraSelectEl.innerHTML = "";
  cameras.forEach((device, index) => {
    const option = document.createElement("option");
    option.value = device.deviceId;
    option.textContent = device.label || `Camera ${index + 1}`;
    cameraSelectEl.appendChild(option);
  });
  if (previous && cameras.some((device) => device.deviceId === previous)) {
    cameraSelectEl.value = previous;
  }
}

async function startCamera() {
  stopCamera();
  const deviceId = cameraSelectEl.value;
  const constraints = {
    video: deviceId ? { deviceId: { exact: deviceId }, width: { ideal: 640 }, height: { ideal: 640 } } : { width: { ideal: 640 }, height: { ideal: 640 } },
    audio: false,
  };
  stream = await navigator.mediaDevices.getUserMedia(constraints);
  videoEl.srcObject = stream;
  await videoEl.play();
  await refreshDevices();
  addLog("camera started");
  sampleFrame();
}

function stopCamera() {
  stopSending();
  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
    stream = null;
  }
  videoEl.srcObject = null;
}

async function sendFrame() {
  if (sending) return;
  sending = true;
  try {
    sampleFrame();
    const result = await api("/api/send-rgb-buffer", {
      width: W,
      height: H,
      pixels: pixels.map(displayToWirePixel),
      startIfNeeded: false,
    });
    frame += 1;
    previewEl.textContent += `\ncompact bytes=${result.canvasBytes}\ncompact hex=${result.canvasHex}`;
    addLog(`sent webcam frame ${frame} ${result.canvasBytes} bytes`);
  } finally {
    sending = false;
  }
}

function play() {
  stopSending();
  sendFrame().catch((err) => addLog(err.message));
  sendTimer = setInterval(() => sendFrame().catch((err) => addLog(err.message)), 1000 / fps());
  addLog(`play webcam ${fps()} fps`);
}

function stopSending() {
  if (sendTimer) clearInterval(sendTimer);
  sendTimer = null;
}

async function refreshStatus() {
  const status = await api("/api/status");
  statusEl.textContent = `${status.connected ? "Connected" : "Disconnected"} | paint ${status.paintStarted ? "started" : "not started"} | ${status.address}`;
}

document.querySelector("#connect").addEventListener("click", async () => { await api("/api/connect", {}, 14000); addLog("connected"); await refreshStatus(); });
document.querySelector("#reconnect").addEventListener("click", async () => { await api("/api/reconnect", {}, 14000); addLog("reconnected"); await refreshStatus(); });
document.querySelector("#startPaint").addEventListener("click", async () => { await api("/api/start-paint", {}, 11000); addLog("sent start paint"); await refreshStatus(); });
document.querySelector("#startCamera").addEventListener("click", () => startCamera().catch((err) => addLog(err.message)));
document.querySelector("#stopCamera").addEventListener("click", () => { stopCamera(); addLog("camera stopped"); });
document.querySelector("#sendFrame").addEventListener("click", () => sendFrame().catch((err) => addLog(err.message)));
document.querySelector("#play").addEventListener("click", play);
document.querySelector("#stop").addEventListener("click", () => { stopSending(); addLog("stop"); });
cameraSelectEl.addEventListener("change", () => startCamera().catch((err) => addLog(err.message)));
[zoomEl, brightnessEl, contrastEl, saturationEl, mirrorEl, ditherEl].forEach((el) => el.addEventListener("input", sampleFrame));
fpsEl.addEventListener("change", () => { if (sendTimer) play(); });

function init() {
  drawGrid();
  sampleFrame();
  refreshDevices().catch((err) => addLog(err.message));
  refreshStatus().catch((err) => addLog(err.message));
  setInterval(() => {
    if (stream) sampleFrame();
  }, 250);
  setInterval(() => refreshStatus().catch(() => {}), 1500);
}

init();
