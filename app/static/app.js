const grid = document.querySelector("#grid");
const statusEl = document.querySelector("#status");
const logEl = document.querySelector("#log");
const modeEl = document.querySelector("#mode");
const canvasesEl = document.querySelector("#canvases");
const mutBaseEl = document.querySelector("#mutBase");
const lastMutationEl = document.querySelector("#lastMutation");
const observedColorEl = document.querySelector("#observedColor");

let config = { canvases: {}, knownPixels: {} };
let lastMutation = null;
let localLogLines = [];

async function api(path, body = null) {
  const opts = body ? {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  } : {};
  const res = await fetch(path, opts);
  const data = await res.json();
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || res.statusText);
  }
  return data;
}

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

function renderLog(lines) {
  logEl.innerHTML = "";
  const table = document.createElement("table");
  table.className = "log-table";
  const head = document.createElement("thead");
  head.innerHTML = "<tr><th>Time</th><th>Message</th><th>Hex bytes</th><th>Decimal bytes</th></tr>";
  const body = document.createElement("tbody");

  for (const line of lines) {
    const row = parseLogLine(line);
    const tr = document.createElement("tr");
    for (const [className, value] of [
      ["time", row.time],
      ["message", row.message],
      ["bytes", row.hex],
      ["bytes", row.dec],
    ]) {
      const td = document.createElement("td");
      td.className = className;
      td.textContent = value;
      tr.appendChild(td);
    }
    body.appendChild(tr);
  }

  table.append(head, body);
  logEl.appendChild(table);
}

function addLog(line) {
  const now = new Date().toLocaleTimeString();
  localLogLines.unshift(`[${now}] ${line}`);
  renderLog(localLogLines);
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

function keyFor(x, y) {
  return `${x},${y}`;
}

function renderGrid() {
  grid.innerHTML = "";
  for (let y = 0; y < 12; y += 1) {
    for (let x = 0; x < 12; x += 1) {
      const key = keyFor(x, y);
      const cell = document.createElement("button");
      cell.className = "cell";
      cell.textContent = `${x},${y}`;
      cell.dataset.key = key;
      if (config.knownPixels[key]) {
        cell.classList.add("known");
        const known = config.knownPixels[key];
        cell.title = `${known.label || key}\n${known.confidence || "known"}\nhex: ${known.hex}\ndecimal: ${decimalBytes(known.hex)}`;
      }
      cell.addEventListener("click", () => onCellClick(cell, x, y));
      grid.appendChild(cell);
    }
  }
}

async function onCellClick(cell, x, y) {
  const key = keyFor(x, y);
  if (modeEl.value === "observe") {
    cell.classList.toggle("observed");
    if (lastMutation) {
      await api("/api/observe", {
        mutation: lastMutation,
        x,
        y,
        color: observedColorEl.value,
      });
      addLog(`observed ${x},${y} ${observedColorEl.value}`);
    }
    return;
  }

  if (!config.knownPixels[key]) {
    addLog(`no known payload for ${key}`);
    return;
  }
  const data = await api("/api/send-known-pixel", { key, startIfNeeded: false });
  addLog(`sent known ${key}, ${data.canvasBytes} bytes`);
  await refreshStatus();
}

function renderCanvases() {
  canvasesEl.innerHTML = "";
  mutBaseEl.innerHTML = "";
  for (const name of Object.keys(config.canvases)) {
    const button = document.createElement("button");
    button.textContent = name;
    button.addEventListener("click", async () => {
      const data = await api("/api/send-canvas", { canvas: name, startIfNeeded: false });
      addLog(`sent canvas ${name}, ${data.canvasBytes} bytes`);
      await refreshStatus();
    });
    canvasesEl.appendChild(button);

    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    mutBaseEl.appendChild(option);
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

document.querySelector("#startPaint").addEventListener("click", async () => {
  await api("/api/start-paint", {});
  addLog("sent start paint");
  await refreshStatus();
});

document.querySelector("#sendHex").addEventListener("click", async () => {
  const canvas = document.querySelector("#hexInput").value.trim();
  const data = await api("/api/send-canvas", { canvas, startIfNeeded: false });
  addLog(`sent hex, ${data.canvasBytes} bytes`);
  await refreshStatus();
});

document.querySelector("#sendMutation").addEventListener("click", async () => {
  const source = mutBaseEl.value;
  const offset = Number(document.querySelector("#mutOffset").value);
  const valueText = document.querySelector("#mutValue").value.trim();
  const value = valueText.startsWith("0x") ? parseInt(valueText, 16) : Number(valueText);
  const data = await api("/api/mutate", { source, offset, value, startIfNeeded: false });
  lastMutation = { source, offset, value, payload: data.payload };
  lastMutationEl.textContent = `hex: ${data.payload}\ndecimal: ${decimalBytes(data.payload)}`;
  addLog(`sent mutation ${source} offset ${offset} value 0x${value.toString(16)}`);
  await refreshStatus();
});

async function init() {
  config = await api("/api/config");
  renderGrid();
  renderCanvases();
  await refreshStatus();
  setInterval(refreshStatus, 2500);
}

init().catch((err) => addLog(err.message));
