const statusEl = document.querySelector("#status");
const gridEl = document.querySelector("#grid");
const logEl = document.querySelector("#log");
const previewEl = document.querySelector("#preview");
const auroraInfoEl = document.querySelector("#auroraInfo");
const manualAuroraEl = document.querySelector("#manualAurora");
const cpuBarEl = document.querySelector("#cpuBar");
const ramBarEl = document.querySelector("#ramBar");
const cpuTextEl = document.querySelector("#cpuText");
const ramTextEl = document.querySelector("#ramText");
const netBarEl = document.querySelector("#netBar");
const netTextEl = document.querySelector("#netText");
const vramBarEl = document.querySelector("#vramBar");
const vramTextEl = document.querySelector("#vramText");
const gpuBarEl = document.querySelector("#gpuBar");
const gpuTextEl = document.querySelector("#gpuText");
const systemIntervalEl = document.querySelector("#systemInterval");
const inputNumberEl = document.querySelector("#inputNumber");
const inputNumberColorEl = document.querySelector("#inputNumberColor");
const displayNumberEl = document.querySelector("#displayNumber");
const displayNumberColorEl = document.querySelector("#displayNumberColor");
const tempApiUrlEl = document.querySelector("#tempApiUrl");
const tempColorEl = document.querySelector("#tempColor");
const tempIntervalEl = document.querySelector("#tempInterval");
const tempInfoEl = document.querySelector("#tempInfo");
const wordleHtmlEl = document.querySelector("#wordleHtml");
const wordleInputs = [1, 2, 3, 4, 5, 6].map((n) => document.querySelector(`#wordle${n}`));
const wordleBookmarkletEl = document.querySelector("#wordleBookmarklet");
const wordleBookmarkletLinkEl = document.querySelector("#wordleBookmarkletLink");
const audioFpsEl = document.querySelector("#audioFps");
const audioGainEl = document.querySelector("#audioGain");
const audioInfoEl = document.querySelector("#audioInfo");

const WIDTH = 12;
const HEIGHT = 12;
const pixels = Array.from({ length: WIDTH * HEIGHT }, () => [0, 0, 0]);
const cells = [];
let autoAuroraTimer = null;
let autoSystemTimer = null;
let autoTempTimer = null;
let audioStream = null;
let audioContext = null;
let audioAnalyser = null;
let audioData = null;
let audioTimer = null;
let audioFrame = 0;

const AURORA_LEVELS = {
  green: { count: 12, rgb: [0, 180, 0] },
  yellow: { count: 48, rgb: [255, 220, 0] },
  amber: { count: 96, rgb: [255, 100, 0] },
  red: { count: 144, rgb: [255, 0, 0] },
};

// 3x5 digit patterns (1 = lit, 0 = off)
const DIGITS = {
  0: [[1,1,1], [1,0,1], [1,0,1], [1,0,1], [1,1,1]],
  1: [[0,1,0], [1,1,0], [0,1,0], [0,1,0], [1,1,1]],
  2: [[1,1,1], [0,0,1], [1,1,1], [1,0,0], [1,1,1]],
  3: [[1,1,1], [0,0,1], [1,1,1], [0,0,1], [1,1,1]],
  4: [[1,0,1], [1,0,1], [1,1,1], [0,0,1], [0,0,1]],
  5: [[1,1,1], [1,0,0], [1,1,1], [0,0,1], [1,1,1]],
  6: [[1,1,1], [1,0,0], [1,1,1], [1,0,1], [1,1,1]],
  7: [[1,1,1], [0,0,1], [0,0,1], [0,0,1], [0,0,1]],
  8: [[1,1,1], [1,0,1], [1,1,1], [1,0,1], [1,1,1]],
  9: [[1,1,1], [1,0,1], [1,1,1], [0,0,1], [1,1,1]],
};

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

function clampPercent(value) {
  return Math.max(0, Math.min(100, Number(value) || 0));
}

function percentLabel(value) {
  if (value == null) return "warming";
  if (value >= 100) return "100%+";
  return `${value.toFixed(0)}%`;
}

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 255, g: 255, b: 255 };
}

function displayToWirePixel(pixel) {
  return [pixel[2], pixel[1], pixel[0]];
}

function wirePixels() {
  return pixels.map(displayToWirePixel);
}

function indexFor(x, y) {
  return y * WIDTH + x;
}

function fillBlack() {
  for (let i = 0; i < pixels.length; i += 1) pixels[i] = [0, 0, 0];
}

function setPixel(x, y, rgb) {
  pixels[indexFor(x, y)] = [...rgb];
}

function renderGrid() {
  if (!cells.length) {
    for (let y = 0; y < HEIGHT; y += 1) {
      for (let x = 0; x < WIDTH; x += 1) {
        const button = document.createElement("button");
        button.className = "cell";
        button.textContent = `${x},${y}`;
        cells.push(button);
        gridEl.appendChild(button);
      }
    }
  }
  for (let i = 0; i < pixels.length; i += 1) {
    const rgb = pixels[i];
    const lit = rgb[0] || rgb[1] || rgb[2];
    const cell = cells[i];
    cell.classList.toggle("lit", Boolean(lit));
    cell.style.background = lit ? `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})` : "";
    cell.style.color = lit && rgb[0] + rgb[1] + rgb[2] < 380 ? "#fff" : "";
  }
}

function fillFirstCount(count, rgb, fromTop = false) {
  fillBlack();
  for (let n = 0; n < count; n += 1) {
    const x = n % WIDTH;
    const y = fromTop ? Math.floor(n / WIDTH) : HEIGHT - 1 - Math.floor(n / WIDTH);
    if (y >= 0 && y < HEIGHT) setPixel(x, y, rgb);
  }
  renderGrid();
}

function buildInputNumberCanvas(count, r, g, b) {
  const ledCount = Math.max(0, Math.min(144, Number(count) || 0));
  fillFirstCount(ledCount, [r, g, b], true);  // fromTop = true
  previewEl.textContent = `input number\nleds=${ledCount}\ndisplay rgb=(${r},${g},${b})`;
}

function buildAuroraCanvas(statusId) {
  const level = AURORA_LEVELS[statusId] || AURORA_LEVELS.green;
  fillFirstCount(level.count, level.rgb, false);  // fromTop = false (bottom-up for aurora)
  previewEl.textContent = `aurora ${statusId}\nleds=${level.count}\ndisplay rgb=(${level.rgb.join(",")})`;
}

function fillMeterRows(startY, percent, rgb, options = {}) {
  const rows = options.rows || 2;
  let cellsToLight = Math.round(clampPercent(percent) / 100 * WIDTH * rows);
  if (options.minimumWhenActive && Number(percent) > 0) {
    cellsToLight = Math.max(1, cellsToLight);
  }
  for (let n = 0; n < cellsToLight; n += 1) {
    const x = n % WIDTH;
    const y = startY + Math.floor(n / WIDTH);
    setPixel(x, y, rgb);
  }
}

function hsvToRgb(h, s, v) {
  const c = v * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = v - c;
  let rgb;
  if (h < 60) rgb = [c, x, 0];
  else if (h < 120) rgb = [x, c, 0];
  else if (h < 180) rgb = [0, c, x];
  else if (h < 240) rgb = [0, x, c];
  else if (h < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return rgb.map((channel) => Math.max(0, Math.min(255, Math.round((channel + m) * 255))));
}

function buildAudioCanvas() {
  if (!audioAnalyser || !audioData) {
    fillBlack();
    renderGrid();
    audioInfoEl.textContent = "audio not started";
    return;
  }
  audioAnalyser.getByteFrequencyData(audioData);
  fillBlack();
  const gain = Math.max(0.2, Math.min(5, Number(audioGainEl.value) || 1.8));
  const bins = audioData.length;
  const levels = [];
  for (let x = 0; x < WIDTH; x += 1) {
    const start = Math.floor((x / WIDTH) ** 1.8 * bins);
    const end = Math.max(start + 1, Math.floor(((x + 1) / WIDTH) ** 1.8 * bins));
    let peak = 0;
    for (let n = start; n < end && n < bins; n += 1) peak = Math.max(peak, audioData[n]);
    const level = Math.max(0, Math.min(1, (peak / 255) * gain));
    levels.push(level);
    const height = Math.round(level * HEIGHT);
    const [r, g, b] = hsvToRgb(220 - x * 15, 1, 1);
    for (let y = 0; y < height; y += 1) setPixel(x, HEIGHT - 1 - y, [r, g, b]);
  }
  renderGrid();
  const avg = levels.reduce((a, b) => a + b, 0) / levels.length;
  audioInfoEl.textContent = `audio frame=${audioFrame}
avg=${(avg * 100).toFixed(0)}%
levels=${levels.map((v) => Math.round(v * 12)).join(" ")}`;
  previewEl.textContent = `audio visualizer
frame=${audioFrame}
columns=${levels.map((v) => Math.round(v * 12)).join(" ")}`;
}

async function sendCurrentPixels(label, quiet = false) {
  const result = await api("/api/send-rgb-buffer", {
    width: WIDTH,
    height: HEIGHT,
    pixels: wirePixels(),
    startIfNeeded: false,
  });
  if (!quiet) {
    addLog(`sent ${label} ${result.canvasBytes} bytes`);
    previewEl.textContent += `
compact bytes=${result.canvasBytes}
compact hex=${result.canvasHex}`;
    await refreshStatus();
  }
  return result;
}

async function pushAudioFrame() {
  buildAudioCanvas();
  await sendCurrentPixels("audio visualizer", true);
  if (audioFrame % 20 === 0) addLog(`audio visualizer pushed frame ${audioFrame}`);
  audioFrame += 1;
}

async function startAudioVisualizer() {
  stopAudioVisualizer();
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
    throw new Error("getDisplayMedia is not available in this browser");
  }
  audioStream = await navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });
  audioStream.getVideoTracks().forEach((track) => track.stop());
  if (audioStream.getAudioTracks().length === 0) {
    audioStream.getTracks().forEach((track) => track.stop());
    audioStream = null;
    throw new Error("No audio track captured. Pick a tab/screen and enable Share audio.");
  }
  audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(audioStream);
  audioAnalyser = audioContext.createAnalyser();
  audioAnalyser.fftSize = 512;
  audioAnalyser.smoothingTimeConstant = 0.72;
  source.connect(audioAnalyser);
  audioData = new Uint8Array(audioAnalyser.frequencyBinCount);
  audioFrame = 0;
  const fps = Math.max(1, Math.min(12, Number(audioFpsEl.value) || 6));
  audioTimer = setInterval(() => pushAudioFrame().catch((err) => { addLog(err.message); stopAudioVisualizer(); }), 1000 / fps);
  await pushAudioFrame();
  addLog(`started audio visualizer ${fps} fps`);
}

function stopAudioVisualizer() {
  if (audioTimer) clearInterval(audioTimer);
  audioTimer = null;
  if (audioStream) audioStream.getTracks().forEach((track) => track.stop());
  audioStream = null;
  if (audioContext) audioContext.close().catch(() => {});
  audioContext = null;
  audioAnalyser = null;
  audioData = null;
}

function buildSystemCanvas(cpuPercent, memoryPercent, networkPercent, networkMbps, vramPercent, gpuPercent) {
  fillBlack();
  fillMeterRows(0, cpuPercent || 0, [0, 160, 255]);
  fillMeterRows(3, memoryPercent || 0, [190, 60, 255]);
  fillMeterRows(6, networkPercent || 0, [0, 210, 120], { minimumWhenActive: true });
  fillMeterRows(9, vramPercent || 0, [255, 150, 40], { rows: 1, minimumWhenActive: true });
  fillMeterRows(11, gpuPercent || 0, [255, 50, 50], { rows: 1, minimumWhenActive: true });
  renderGrid();
  previewEl.textContent = [
    "system",
    `cpu=${cpuPercent == null ? "warming up" : cpuPercent.toFixed(1) + "%"}`,
    `ram=${memoryPercent.toFixed(1)}%`,
    `net=${networkPercent == null ? "warming" : percentLabel(networkPercent) + " of 500 Mbps"} (${networkMbps == null ? "warming up" : networkMbps.toFixed(2) + " Mbps raw"})`,
    `vram=${percentLabel(vramPercent)}`,
    `gpu=${percentLabel(gpuPercent)}`,
    "network/vram/gpu use a 1 LED minimum when activity is nonzero",
    "rows 0-1 cpu, row 2 blank, rows 3-4 ram, row 5 blank, rows 6-7 network, row 8 blank, row 9 vram, row 10 blank, row 11 gpu",
  ].join("\n");
}

function installWordleBookmarklet() {
  const target = `${window.location.origin}/experiments.html`;
  const code = `javascript:(()=>{const t=[...document.querySelectorAll('[aria-label*=\"solved in\"]')].map(e=>e.getAttribute('aria-label')).join(' ');const c=[0,0,0,0,0,0];let m,r=/(\\d+)\\s+solved in\\s+(\\d)(?:st|nd|rd|th) attempt/gi;while((m=r.exec(t)))c[+m[2]-1]=+m[1];window.open('${target}#wordle='+c.join(','),'_blank');})()`;
  wordleBookmarkletEl.value = code;
  wordleBookmarkletLinkEl.href = code;
}

function importWordleFromHash() {
  const match = window.location.hash.match(/wordle=([0-9,]+)/);
  if (!match) return;
  const counts = match[1].split(',').slice(0, 6).map((value) => Math.max(0, Number(value) || 0));
  while (counts.length < 6) counts.push(0);
  setWordleCounts(counts);
  buildWordleCanvas(counts);
  addLog(`imported wordle counts from bookmarklet ${counts.join(',')}`);
}

function wordleCounts() {
  return wordleInputs.map((input) => Math.max(0, Number(input.value) || 0));
}

function setWordleCounts(counts) {
  counts.slice(0, 6).forEach((count, index) => {
    wordleInputs[index].value = String(Math.max(0, Number(count) || 0));
  });
}

function parseWordleHtml() {
  const html = wordleHtmlEl.value;
  const counts = [0, 0, 0, 0, 0, 0];
  const ariaPattern = /(\d+)\s+solved in\s+(\d)(?:st|nd|rd|th) attempt/gi;
  let match;
  while ((match = ariaPattern.exec(html)) !== null) {
    const count = Number(match[1]);
    const attempt = Number(match[2]);
    if (attempt >= 1 && attempt <= 6) counts[attempt - 1] = count;
  }
  if (counts.every((count) => count === 0)) {
    const numberPattern = /Congrats-module_numGuesses[^>]*>(\d+)</g;
    let index = 0;
    while ((match = numberPattern.exec(html)) !== null && index < 6) {
      counts[index] = Number(match[1]);
      index += 1;
    }
  }
  setWordleCounts(counts);
  addLog(`parsed wordle counts ${counts.join(",")}`);
  buildWordleCanvas(counts);
}

function buildWordleCanvas(counts = wordleCounts()) {
  fillBlack();
  const maxCount = Math.max(1, ...counts);
  const bestIndex = counts.indexOf(Math.max(...counts));
  counts.forEach((count, row) => {
    const cellsToLight = count > 0 ? Math.max(1, Math.round(count / maxCount * WIDTH)) : 0;
    const rgb = row === bestIndex ? [80, 170, 80] : [130, 135, 138];
    for (let x = 0; x < cellsToLight; x += 1) {
      setPixel(x, row, rgb);
    }
  });
  renderGrid();
  previewEl.textContent = [
    "wordle guess distribution",
    `counts=${counts.join(", ")}`,
    `max=${maxCount}`,
    "rows 0-5 are guesses 1-6; strongest row is green",
  ].join("\n");
}

async function sendWordle() {
  buildWordleCanvas();
  await sendCurrent("wordle scores");
}

async function refreshStatus() {
  const status = await api("/api/status");
  statusEl.textContent = `${status.connected ? "Connected" : "Disconnected"} | paint ${status.paintStarted ? "started" : "not started"} | ${status.address}`;
}

async function sendCurrent(label = "current preview") {
  const result = await api("/api/send-rgb-buffer", {
    width: WIDTH,
    height: HEIGHT,
    pixels: wirePixels(),
    startIfNeeded: false,
  });
  addLog(`sent ${label} ${result.canvasBytes} bytes`);
  previewEl.textContent += `\ncompact bytes=${result.canvasBytes}\ncompact hex=${result.canvasHex}`;
  await refreshStatus();
}

async function fetchAurora() {
  const data = await api("/api/aurora-status");
  const statusId = data.chosen.statusId;
  buildAuroraCanvas(statusId);
  auroraInfoEl.textContent = JSON.stringify(data, null, 2);
  addLog(`aurora ${statusId}`);
  return statusId;
}

async function sendAurora() {
  const statusId = await fetchAurora();
  await sendCurrent(`aurora ${statusId}`);
}

function previewManualAurora() {
  const statusId = manualAuroraEl.value;
  buildAuroraCanvas(statusId);
  auroraInfoEl.textContent = `manual aurora level: ${statusId}`;
  addLog(`manual aurora ${statusId}`);
}

async function sendManualAurora() {
  previewManualAurora();
  await sendCurrent(`manual aurora ${manualAuroraEl.value}`);
}

function previewInputNumber() {
  const count = Number(inputNumberEl.value) || 0;
  const color = hexToRgb(inputNumberColorEl.value);
  buildInputNumberCanvas(count, color.r, color.g, color.b);
  addLog(`input number ${count} rgb(${color.r},${color.g},${color.b})`);
}

async function sendInputNumber() {
  const count = Number(inputNumberEl.value) || 0;
  const color = hexToRgb(inputNumberColorEl.value);
  const result = await api("/api/send-number", { count, r: color.r, g: color.g, b: color.b, startIfNeeded: false });
  previewInputNumber();
  addLog(`sent input number ${count} rgb(${color.r},${color.g},${color.b}), ${result.canvasBytes} bytes`);
  await refreshStatus();
}

function drawDigit(digitValue, startX, startY, rgb) {
  const pattern = DIGITS[digitValue];
  if (!pattern) return;
  for (let row = 0; row < pattern.length; row++) {
    for (let col = 0; col < pattern[row].length; col++) {
      if (pattern[row][col]) {
        const x = startX + col;
        const y = startY + row;
        if (x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT) {
          setPixel(x, y, rgb);
        }
      }
    }
  }
}

function buildDisplayNumberCanvas(number, r, g, b) {
  fillBlack();
  const numStr = String(Math.max(0, Math.min(999, Number(number) || 0)));
  const digitCount = numStr.length;

  // Calculate starting X position to center the number
  // Each digit is 3 pixels wide, spacing is 1 pixel
  const totalWidth = digitCount * 3 + (digitCount - 1);
  const startX = Math.floor((WIDTH - totalWidth) / 2);
  const startY = 3; // Center vertically (12 - 5 = 7, 7/2 ≈ 3)

  for (let i = 0; i < numStr.length; i++) {
    const digit = parseInt(numStr[i]);
    const x = startX + i * 4; // 3 pixels + 1 spacing
    drawDigit(digit, x, startY, [r, g, b]);
  }

  renderGrid();
  previewEl.textContent = `display number\nvalue=${numStr}\nrgb=(${r},${g},${b})`;
}

function previewDisplayNumber() {
  const number = Number(displayNumberEl.value) || 0;
  const color = hexToRgb(displayNumberColorEl.value);
  buildDisplayNumberCanvas(number, color.r, color.g, color.b);
  addLog(`display number ${number} rgb(${color.r},${color.g},${color.b})`);
}

async function sendDisplayNumber() {
  const number = Number(displayNumberEl.value) || 0;
  const color = hexToRgb(displayNumberColorEl.value);
  const result = await api("/api/display-number", { number, r: color.r, g: color.g, b: color.b, startIfNeeded: false });
  previewDisplayNumber();
  addLog(`sent display number ${number} rgb(${color.r},${color.g},${color.b}), ${result.canvasBytes} bytes`);
  await refreshStatus();
}

async function fetchTemperature() {
  const url = tempApiUrlEl.value.trim();
  if (!url) {
    throw new Error("API URL is required");
  }

  // Fetch via backend proxy to avoid CORS issues
  const proxyUrl = `/api/fetch-temperature?url=${encodeURIComponent(url)}`;
  const response = await fetch(proxyUrl);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  const proxyResult = await response.json();
  if (!proxyResult.ok) {
    throw new Error(proxyResult.error || "Failed to fetch temperature");
  }
  const data = proxyResult.data;

  const chartTemp = Number(data.chart_temp) || 0;
  const roundedTemp = Math.round(chartTemp);
  const color = hexToRgb(tempColorEl.value);

  // Display info
  tempInfoEl.textContent = `chart_temp: ${chartTemp}°C\nrounded: ${roundedTemp}°C\nrelay: ${data.relay ? 'ON' : 'OFF'}\nstatus: ${data.fault_text || 'N/A'}`;

  // Send to LED display
  const displayResult = await api("/api/display-number", {
    number: roundedTemp,
    r: color.r,
    g: color.g,
    b: color.b,
    startIfNeeded: false
  });

  addLog(`temp ${roundedTemp}°C (actual: ${chartTemp}°C)`);
  return { temp: roundedTemp, chartTemp, data };
}

function toggleTempAuto() {
  const button = document.querySelector("#autoTemp");
  if (autoTempTimer) {
    clearInterval(autoTempTimer);
    autoTempTimer = null;
    button.textContent = "Start Auto";
    addLog("stopped auto temperature");
    return;
  }

  const intervalSeconds = Math.max(0.5, Number(tempIntervalEl.value) || 5);
  const intervalMs = intervalSeconds * 1000;

  fetchTemperature().catch((err) => {
    addLog(`temp error: ${err.message}`);
    clearInterval(autoTempTimer);
    autoTempTimer = null;
    button.textContent = "Start Auto";
  });

  autoTempTimer = setInterval(() => {
    fetchTemperature().catch((err) => {
      addLog(`temp error: ${err.message}`);
      clearInterval(autoTempTimer);
      autoTempTimer = null;
      button.textContent = "Start Auto";
    });
  }, intervalMs);

  button.textContent = "Stop Auto";
  addLog(`started auto temperature every ${intervalSeconds} sec`);
}

async function fetchSystem() {
  const data = await api("/api/system-stats");
  const cpu = data.cpuPercent;
  const ram = data.memoryPercent;
  const netPercent = data.networkPercent;
  const netMbps = data.networkTotalMbps;
  const vram = data.vramPercent;
  const gpu = data.gpuPercent;

  cpuBarEl.style.width = `${clampPercent(cpu)}%`;
  ramBarEl.style.width = `${clampPercent(ram)}%`;
  netBarEl.style.width = `${clampPercent(netPercent)}%`;
  vramBarEl.style.width = `${clampPercent(vram)}%`;
  gpuBarEl.style.width = `${clampPercent(gpu)}%`;

  cpuTextEl.textContent = cpu == null ? "warming" : `${cpu.toFixed(0)}%`;
  ramTextEl.textContent = `${ram.toFixed(0)}%`;
  netTextEl.textContent = percentLabel(netPercent);
  vramTextEl.textContent = percentLabel(vram);
  gpuTextEl.textContent = percentLabel(gpu);

  buildSystemCanvas(cpu, ram, netPercent, netMbps, vram, gpu);
  addLog(`system cpu=${cpu == null ? "warming" : cpu.toFixed(1)} ram=${ram.toFixed(1)} net=${netMbps == null ? "warming" : netMbps.toFixed(2) + "Mbps"} vram=${percentLabel(vram)} gpu=${percentLabel(gpu)}`);
  return data;
}

async function sendSystem() {
  await fetchSystem();
  await sendCurrent("system cpu/ram/network/vram/gpu");
}

function toggleAuroraAuto() {
  const button = document.querySelector("#autoAurora");
  if (autoAuroraTimer) {
    clearInterval(autoAuroraTimer);
    autoAuroraTimer = null;
    button.textContent = "Start Auto Aurora";
    addLog("stopped auto aurora");
    return;
  }
  sendAurora().catch((err) => addLog(err.message));
  autoAuroraTimer = setInterval(() => sendAurora().catch((err) => addLog(err.message)), 180000);
  button.textContent = "Stop Auto Aurora";
  addLog("started auto aurora every 3 min");
}

function toggleSystemAuto() {
  const button = document.querySelector("#autoSystem");
  if (autoSystemTimer) {
    clearInterval(autoSystemTimer);
    autoSystemTimer = null;
    button.textContent = "Start Auto System";
    addLog("stopped auto system");
    return;
  }
  const intervalSeconds = Math.max(0.1, Number(systemIntervalEl.value) || 10);
  const intervalMs = intervalSeconds * 1000;
  sendSystem().catch((err) => addLog(err.message));
  autoSystemTimer = setInterval(() => sendSystem().catch((err) => addLog(err.message)), intervalMs);
  button.textContent = "Stop Auto System";
  addLog(`started auto system every ${intervalSeconds} sec`);
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
document.querySelector("#sendCurrent").addEventListener("click", () => sendCurrent().catch((err) => addLog(err.message)));
document.querySelector("#previewNumber").addEventListener("click", previewInputNumber);
document.querySelector("#sendNumber").addEventListener("click", () => sendInputNumber().catch((err) => addLog(err.message)));
document.querySelector("#previewDisplayNumber").addEventListener("click", previewDisplayNumber);
document.querySelector("#sendDisplayNumber").addEventListener("click", () => sendDisplayNumber().catch((err) => addLog(err.message)));
document.querySelector("#fetchTemp").addEventListener("click", () => fetchTemperature().catch((err) => addLog(err.message)));
document.querySelector("#autoTemp").addEventListener("click", toggleTempAuto);
document.querySelector("#fetchAurora").addEventListener("click", () => fetchAurora().catch((err) => addLog(err.message)));
document.querySelector("#sendAurora").addEventListener("click", () => sendAurora().catch((err) => addLog(err.message)));
document.querySelector("#manualAuroraPreview").addEventListener("click", previewManualAurora);
document.querySelector("#sendManualAurora").addEventListener("click", () => sendManualAurora().catch((err) => addLog(err.message)));
document.querySelector("#autoAurora").addEventListener("click", toggleAuroraAuto);
document.querySelector("#fetchSystem").addEventListener("click", () => fetchSystem().catch((err) => addLog(err.message)));
document.querySelector("#sendSystem").addEventListener("click", () => sendSystem().catch((err) => addLog(err.message)));
document.querySelector("#autoSystem").addEventListener("click", toggleSystemAuto);
document.querySelector("#startAudioViz").addEventListener("click", () => startAudioVisualizer().catch((err) => addLog(err.message)));
document.querySelector("#stopAudioViz").addEventListener("click", () => { stopAudioVisualizer(); addLog("stopped audio visualizer"); });
document.querySelector("#previewAudioViz").addEventListener("click", buildAudioCanvas);
document.querySelector("#parseWordle").addEventListener("click", parseWordleHtml);
document.querySelector("#previewWordle").addEventListener("click", () => buildWordleCanvas());
document.querySelector("#sendWordle").addEventListener("click", () => sendWordle().catch((err) => addLog(err.message)));

function loadTempSettings() {
  const savedUrl = localStorage.getItem('tempApiUrl');
  const savedColor = localStorage.getItem('tempColor');
  const savedInterval = localStorage.getItem('tempInterval');

  if (savedUrl) tempApiUrlEl.value = savedUrl;
  if (savedColor) tempColorEl.value = savedColor;
  if (savedInterval) tempIntervalEl.value = savedInterval;
}

function saveTempSettings() {
  localStorage.setItem('tempApiUrl', tempApiUrlEl.value);
  localStorage.setItem('tempColor', tempColorEl.value);
  localStorage.setItem('tempInterval', tempIntervalEl.value);
}

async function init() {
  renderGrid();
  installWordleBookmarklet();
  buildAuroraCanvas("green");
  importWordleFromHash();
  loadTempSettings();

  // Save temp settings when changed
  tempApiUrlEl.addEventListener('change', saveTempSettings);
  tempColorEl.addEventListener('change', saveTempSettings);
  tempIntervalEl.addEventListener('change', saveTempSettings);

  await refreshStatus();
  setInterval(() => refreshStatus().catch((err) => addLog(err.message)), 1500);
}

init().catch((err) => addLog(err.message));
