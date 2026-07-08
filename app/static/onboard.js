const statusEl = document.querySelector("#status");
const logEl = document.querySelector("#log");
const deviceSelectEl = document.querySelector("#deviceSelect");
const sessionsEl = document.querySelector("#sessions");
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

function setDeviceOptions(devices, knownAddresses = []) {
  deviceSelectEl.innerHTML = "";
  const seen = new Set();
  for (const device of devices || []) {
    const option = document.createElement("option");
    option.value = device.address;
    option.textContent = formatDevice(device);
    if (device.likelyArcadeCoder) option.selected = true;
    deviceSelectEl.appendChild(option);
    seen.add(device.address.toUpperCase());
  }
  for (const address of knownAddresses) {
    if (seen.has(address.toUpperCase())) continue;
    const option = document.createElement("option");
    option.value = address;
    option.textContent = `Known device | ${address}`;
    deviceSelectEl.appendChild(option);
  }
}

async function scanDevices() {
  const button = document.querySelector("#scanDevices");
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "Scanning...";
  try {
    addLog("scanning BLE devices...");
    const [scan, summary] = await Promise.all([api("/api/scan-devices"), api("/api/devices")]);
    setDeviceOptions(scan.devices, summary.known || []);
    addLog(`scan found ${scan.devices.length} device(s)`);
    const connected = (scan.sessions || []).filter((row) => row.connected);
    if (connected.length) {
      addLog(`note: ${connected.map((row) => row.address).join(", ")} already connected - connected boards do not advertise, so they never appear in scans`);
    }
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

async function useSelectedDevice() {
  const address = deviceSelectEl.value;
  if (!address) throw new Error("No BLE device selected");
  const data = await api("/api/select-device", { address });
  addLog(`default device is now ${data.status.address}`);
  await refreshStatus();
}

async function connectSelectedDevice() {
  const address = deviceSelectEl.value;
  if (!address) throw new Error("No BLE device selected");
  addLog(`connecting ${address} as extra device...`);
  await api("/api/connect", { device: address });
  addLog(`connected ${address}`);
  await refreshStatus();
}

function addLog(text) {
  const now = new Date().toLocaleTimeString();
  logEl.textContent = `[${now}] ${text}\n` + logEl.textContent;
}

function sessionButton(label, handler) {
  const button = document.createElement("button");
  button.textContent = label;
  button.addEventListener("click", () => handler().catch((err) => addLog(err.message)));
  return button;
}

function renderSessions(summary) {
  sessionsEl.innerHTML = "";
  for (const row of summary.sessions || []) {
    const card = document.createElement("div");
    card.className = "session-card";
    const info = document.createElement("div");
    info.className = "session-info";
    const state = row.connected ? "Connected" : "Disconnected";
    const paint = row.paintStarted ? " | paint started" : "";
    const badge = row.isDefault ? " (default)" : "";
    info.textContent = `${row.address}${badge} - ${state}${paint}`;
    card.appendChild(info);
    const buttons = document.createElement("div");
    buttons.className = "session-buttons";
    buttons.appendChild(sessionButton("Connect", async () => {
      await api("/api/connect", { device: row.address });
      addLog(`connected ${row.address}`);
      await refreshStatus();
    }));
    buttons.appendChild(sessionButton("Start Paint", async () => {
      await api("/api/start-paint", { device: row.address });
      addLog(`sent start paint to ${row.address}`);
      await refreshStatus();
    }));
    buttons.appendChild(sessionButton("Disconnect", async () => {
      await api("/api/disconnect", { device: row.address });
      addLog(`disconnected ${row.address}`);
      await refreshStatus();
    }));
    if (!row.isDefault) {
      buttons.appendChild(sessionButton("Make Default", async () => {
        await api("/api/select-device", { address: row.address });
        addLog(`default device is now ${row.address}`);
        await refreshStatus();
      }));
    }
    card.appendChild(buttons);
    sessionsEl.appendChild(card);
  }
}

async function refreshStatus() {
  const summary = await api("/api/devices");
  const connectedCount = (summary.sessions || []).filter((row) => row.connected).length;
  statusEl.textContent = `${connectedCount} device(s) connected | default ${summary.defaultAddress}`;
  renderSessions(summary);
  const status = await api("/api/status");
  logEl.textContent = [...(status.log || [])].reverse().join("\n") + (logEl.textContent ? "\n" + logEl.textContent : "");
}

async function startModule(module) {
  const data = await api("/api/start-builtin", { module });
  addLog(`started built-in ${data.module}`);
  await refreshStatus();
}

document.querySelector("#scanDevices").addEventListener("click", () => scanDevices().catch((err) => addLog(err.message)));
document.querySelector("#useDevice").addEventListener("click", () => useSelectedDevice().catch((err) => addLog(err.message)));
document.querySelector("#connectDevice").addEventListener("click", () => connectSelectedDevice().catch((err) => addLog(err.message)));

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

async function initDeviceList() {
  const summary = await api("/api/devices");
  setDeviceOptions([], [summary.defaultAddress, ...(summary.known || [])]);
}

initDeviceList().catch(() => {});
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
