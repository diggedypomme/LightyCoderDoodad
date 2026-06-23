const statusEl = document.querySelector("#status");
const logEl = document.querySelector("#log");
const deviceSelectEl = document.querySelector("#deviceSelect");
const docsEmbedEl = document.querySelector("#docsEmbed");

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

function formatDevice(device) {
  const name = device.name || "unnamed";
  const flag = device.likelyArcadeCoder ? "Arcade? " : "";
  const rssi = device.rssi == null ? "" : ` RSSI ${device.rssi}`;
  return `${flag}${name} | ${device.address}${rssi}`;
}

function setDeviceOptions(devices, currentAddress = null) {
  deviceSelectEl.innerHTML = "";
  if (currentAddress) {
    const option = document.createElement("option");
    option.value = currentAddress;
    option.textContent = `Current/fallback | ${currentAddress}`;
    deviceSelectEl.appendChild(option);
  }
  for (const device of devices || []) {
    const option = document.createElement("option");
    option.value = device.address;
    option.textContent = formatDevice(device);
    if (device.likelyArcadeCoder) option.selected = true;
    deviceSelectEl.appendChild(option);
  }
}

async function scanDevices() {
  addLog("scanning BLE devices...");
  const data = await api("/api/scan-devices");
  setDeviceOptions(data.devices, null);
  addLog(`scan found ${data.devices.length} device(s)`);
}

async function useSelectedDevice() {
  const address = deviceSelectEl.value;
  if (!address) throw new Error("No BLE device selected");
  const data = await api("/api/select-device", { address });
  addLog(`selected ${data.status.address}`);
  await refreshStatus();
}

function addLog(text) {
  const now = new Date().toLocaleTimeString();
  logEl.textContent = `[${now}] ${text}\n` + logEl.textContent;
}

async function refreshStatus() {
  const status = await api("/api/status");
  statusEl.textContent = `${status.connected ? "Connected" : "Disconnected"} | paint ${status.paintStarted ? "started" : "not started"} | ${status.address}`;
  logEl.textContent = [...(status.log || [])].reverse().join("\n") + (logEl.textContent ? "\n" + logEl.textContent : "");
}

async function startModule(module) {
  const data = await api("/api/start-builtin", { module });
  addLog(`started built-in ${data.module}`);
  await refreshStatus();
}

document.querySelector("#scanDevices").addEventListener("click", () => scanDevices().catch((err) => addLog(err.message)));
document.querySelector("#useDevice").addEventListener("click", () => useSelectedDevice().catch((err) => addLog(err.message)));

document.querySelector("#connect").addEventListener("click", async () => {
  await api("/api/connect", {});
  addLog("connected");
  await refreshStatus();
});

document.querySelector("#disconnect").addEventListener("click", async () => {
  await api("/api/disconnect", {});
  addLog("disconnected");
  await refreshStatus();
});

document.querySelectorAll("[data-module]").forEach((button) => {
  button.addEventListener("click", () => startModule(button.dataset.module).catch((err) => addLog(err.message)));
});

refreshStatus().catch((err) => addLog(err.message));
setInterval(() => refreshStatus().catch(() => {}), 2000);

async function loadDocs() {
  const response = await fetch("/docs/onboard-apps.md");
  const html = await response.text();
  const doc = new DOMParser().parseFromString(html, "text/html");
  const panel = doc.querySelector("section.panel");
  docsEmbedEl.innerHTML = panel ? panel.innerHTML : html;
}

loadDocs().catch((err) => { docsEmbedEl.textContent = err.message; });