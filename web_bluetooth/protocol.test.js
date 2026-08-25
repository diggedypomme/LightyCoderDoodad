"use strict";

const assert = require("node:assert/strict");
const zlib = require("node:zlib");
const protocol = require("./protocol.js");

const samples = [
  new Uint8Array(432),
  Uint8Array.from({ length: 432 }, (_, index) => (index * 73 + 19) & 0xff),
  Uint8Array.from({ length: 432 }, (_, index) => index === 431 ? 255 : 0),
];

for (const sample of samples) {
  const compressed = protocol.deflateHuffmanOnly(sample);
  const inflated = zlib.inflateRawSync(compressed);
  assert.deepEqual(inflated, Buffer.from(sample));
}

assert.equal(Buffer.from(protocol.startPaintCommand()).toString("hex"), "0802220c0a057061696e74150000803f");

const display = Array.from({ length: 144 }, () => [0, 0, 0]);
display[143] = [255, 0, 0];
const canvas = protocol.compactCanvas(display);
assert.deepEqual(Array.from(canvas.slice(0, 2)), [12, 12]);
const wire = zlib.inflateRawSync(canvas.slice(2));
assert.equal(wire.length, 432);
assert.deepEqual(Array.from(wire.slice(-3)), [0, 0, 255]);
assert.ok(protocol.canvasCommand(display).length < 120, "sparse paint command should remain compact");

console.log("browser protocol tests passed");
