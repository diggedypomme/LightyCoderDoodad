"use strict";

const { SERVICE_UUID, COMMAND_UUID, startPaintCommand, canvasCommand } = LightyProtocol;
const pixels = Array.from({ length: 144 }, () => [0, 0, 0]);
const cells = [];
let device = null;
let commandCharacteristic = null;
let paintStarted = false;

const statusEl = document.querySelector("#status");
const logEl = document.querySelector("#log");
const colourEl = document.querySelector("#colour");
const connectButton = document.querySelector("#connect");
const startButton = document.querySelector("#startPaint");
const sendButton = document.querySelector("#send");
const clearButton = document.querySelector("#clear");

function log(message) {
  logEl.textContent = `${new Date().toLocaleTimeString()}  ${message}\n${logEl.textContent}`;
}

function setStatus(message, state = "idle") {
  statusEl.textContent = message;
  statusEl.dataset.state = state;
}

function setControls() {
  const connected = Boolean(commandCharacteristic && device?.gatt?.connected);
  connectButton.textContent = connected ? "Disconnect" : "Connect board";
  startButton.disabled = !connected;
  sendButton.disabled = !connected;
}

function hexToRgb(value) {
  return [1, 3, 5].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16));
}

function renderCell(index) {
  const [r, g, b] = pixels[index];
  cells[index].style.backgroundColor = `rgb(${r} ${g} ${b})`;
  cells[index].classList.toggle("lit", r + g + b > 0);
}

function renderGrid() {
  const grid = document.querySelector("#grid");
  for (let index = 0; index < 144; index += 1) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "pixel";
    button.ariaLabel = `Pixel ${index % 12},${Math.floor(index / 12)}`;
    button.addEventListener("click", () => {
      const selected = hexToRgb(colourEl.value);
      pixels[index] = pixels[index].some(Boolean) ? [0, 0, 0] : selected;
      renderCell(index);
    });
    cells.push(button);
    grid.appendChild(button);
    renderCell(index);
  }
}

async function write(bytes) {
  if (!commandCharacteristic) throw new Error("Connect the board first");
  if (commandCharacteristic.properties.writeWithoutResponse && commandCharacteristic.writeValueWithoutResponse) {
    await commandCharacteristic.writeValueWithoutResponse(bytes);
  } else if (commandCharacteristic.properties.write && commandCharacteristic.writeValue) {
    await commandCharacteristic.writeValue(bytes);
  } else {
    throw new Error("The board's command characteristic is not writable in this browser");
  }
}

function disconnected() {
  commandCharacteristic = null;
  paintStarted = false;
  setStatus("Disconnected");
  setControls();
  log("Board disconnected");
}

async function connect() {
  if (device?.gatt?.connected) {
    device.gatt.disconnect();
    return;
  }
  if (!navigator.bluetooth) throw new Error("Web Bluetooth is unavailable. Use desktop Chrome or Edge over HTTPS or localhost.");
  setStatus("Choose your Arcade Coder…", "working");
  device = await navigator.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: [SERVICE_UUID],
  });
  device.addEventListener("gattserverdisconnected", disconnected, { once: true });
  setStatus(`Connecting to ${device.name || "board"}…`, "working");
  const server = await device.gatt.connect();
  const service = await server.getPrimaryService(SERVICE_UUID);
  commandCharacteristic = await service.getCharacteristic(COMMAND_UUID);
  setStatus(`Connected to ${device.name || "Arcade Coder"}`, "ready");
  setControls();
  log(`Connected; write without response=${commandCharacteristic.properties.writeWithoutResponse}`);
}

async function startPaint() {
  await write(startPaintCommand());
  paintStarted = true;
  setStatus("Paint started", "ready");
  log("Sent stock paint start command");
}

async function sendCanvas() {
  if (!paintStarted) {
    await startPaint();
    log("Waiting for Paint to initialise…");
    await new Promise((resolve) => setTimeout(resolve, 1300));
  }
  const command = canvasCommand(pixels);
  await write(command);
  const lit = pixels.filter((pixel) => pixel.some(Boolean)).length;
  setStatus(`Sent ${lit} lit pixel${lit === 1 ? "" : "s"} (${command.length} bytes)`, "ready");
  log(`Sent hardware-safe canvas command: ${command.length} bytes`);
}

connectButton.addEventListener("click", () => connect().catch((error) => {
  setStatus(error.message, "error");
  log(error.message);
  setControls();
}));
startButton.addEventListener("click", () => startPaint().catch((error) => {
  setStatus(error.message, "error");
  log(error.message);
}));
sendButton.addEventListener("click", () => sendCanvas().catch((error) => {
  setStatus(error.message, "error");
  log(error.message);
}));
clearButton.addEventListener("click", () => {
  pixels.forEach((_, index) => {
    pixels[index] = [0, 0, 0];
    renderCell(index);
  });
  log("Cleared local canvas; press Send canvas to clear the board");
});

renderGrid();
setControls();
if (!window.isSecureContext) setStatus("This page needs HTTPS or localhost for Web Bluetooth", "error");
else if (!navigator.bluetooth) setStatus("Use desktop Chrome or Edge; this browser has no Web Bluetooth", "error");
