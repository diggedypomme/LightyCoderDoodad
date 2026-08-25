(function (root) {
  "use strict";

  const SERVICE_UUID = "778d5426-fa29-4363-91fd-a9f5cfcfce85";
  const COMMAND_UUID = "e18d056b-7dae-49c1-b5f2-17684801e446";

  function concat(...parts) {
    const length = parts.reduce((total, part) => total + part.length, 0);
    const result = new Uint8Array(length);
    let offset = 0;
    for (const part of parts) {
      result.set(part, offset);
      offset += part.length;
    }
    return result;
  }

  function varint(value) {
    const bytes = [];
    do {
      let byte = value & 0x7f;
      value >>>= 7;
      if (value) byte |= 0x80;
      bytes.push(byte);
    } while (value);
    return Uint8Array.from(bytes);
  }

  function fieldVarint(field, value) {
    return concat(varint(field << 3), varint(value));
  }

  function fieldBytes(field, value) {
    return concat(varint((field << 3) | 2), varint(value.length), value);
  }

  function fieldFloat(field, value) {
    const data = new Uint8Array(4);
    new DataView(data.buffer).setFloat32(0, value, true);
    return concat(varint((field << 3) | 5), data);
  }

  function startPaintCommand() {
    const name = new TextEncoder().encode("paint");
    const payload = concat(fieldBytes(1, name), fieldFloat(2, 1));
    return concat(fieldVarint(1, 2), fieldBytes(4, payload));
  }

  class BitWriter {
    constructor() {
      this.bytes = [];
      this.current = 0;
      this.used = 0;
    }

    write(value, count) {
      for (let bit = 0; bit < count; bit += 1) {
        this.current |= ((value >>> bit) & 1) << this.used;
        this.used += 1;
        if (this.used === 8) {
          this.bytes.push(this.current);
          this.current = 0;
          this.used = 0;
        }
      }
    }

    finish() {
      if (this.used) this.bytes.push(this.current);
      return Uint8Array.from(this.bytes);
    }
  }

  function huffmanLengths(frequencies, maxBits = 15) {
    const nodes = [];
    for (let symbol = 0; symbol < frequencies.length; symbol += 1) {
      if (frequencies[symbol]) nodes.push({ weight: frequencies[symbol], symbol });
    }
    while (nodes.length < 2) {
      const symbol = nodes.length && nodes[0].symbol === 0 ? 1 : 0;
      nodes.push({ weight: 1, symbol });
    }
    while (nodes.length > 1) {
      nodes.sort((a, b) => a.weight - b.weight || (a.symbol ?? 999) - (b.symbol ?? 999));
      const left = nodes.shift();
      const right = nodes.shift();
      nodes.push({ weight: left.weight + right.weight, left, right });
    }
    const lengths = new Uint8Array(frequencies.length);
    (function visit(node, depth) {
      if (node.symbol !== undefined) {
        lengths[node.symbol] = Math.max(1, depth);
        return;
      }
      visit(node.left, depth + 1);
      visit(node.right, depth + 1);
    })(nodes[0], 0);
    if (Math.max(...lengths) > maxBits) throw new Error(`Huffman tree exceeds its ${maxBits}-bit DEFLATE limit`);
    return lengths;
  }

  function reverseBits(value, length) {
    let reversed = 0;
    for (let index = 0; index < length; index += 1) {
      reversed = (reversed << 1) | (value & 1);
      value >>>= 1;
    }
    return reversed;
  }

  function huffmanCodes(lengths) {
    const counts = new Uint16Array(16);
    for (const length of lengths) if (length) counts[length] += 1;
    const next = new Uint16Array(16);
    let code = 0;
    for (let bits = 1; bits <= 15; bits += 1) {
      code = (code + counts[bits - 1]) << 1;
      next[bits] = code;
    }
    return Array.from(lengths, (length) => length ? reverseBits(next[length]++, length) : 0);
  }

  function writeSymbol(writer, symbol, lengths, codes) {
    writer.write(codes[symbol], lengths[symbol]);
  }

  // One final dynamic-Huffman block containing literals only. Avoiding all
  // DEFLATE distance copies works around the stock firmware inflater bug.
  function deflateHuffmanOnly(input) {
    const literalFrequency = new Uint32Array(286);
    for (const byte of input) literalFrequency[byte] += 1;
    literalFrequency[256] = 1;
    const literalLengths = huffmanLengths(literalFrequency);
    let lastLiteral = 285;
    while (lastLiteral > 256 && !literalLengths[lastLiteral]) lastLiteral -= 1;
    const literalCount = Math.max(257, lastLiteral + 1);

    const distanceLengths = Uint8Array.of(1);
    const combined = [...literalLengths.slice(0, literalCount), 1];
    const codeLengthFrequency = new Uint32Array(19);
    for (const length of combined) codeLengthFrequency[length] += 1;
    const codeLengthLengths = huffmanLengths(codeLengthFrequency, 7);
    const order = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
    let codeLengthCount = 4;
    for (let index = order.length - 1; index >= 4; index -= 1) {
      if (codeLengthLengths[order[index]]) {
        codeLengthCount = index + 1;
        break;
      }
    }

    const writer = new BitWriter();
    writer.write(1, 1); // BFINAL
    writer.write(2, 2); // BTYPE=dynamic Huffman
    writer.write(literalCount - 257, 5);
    writer.write(distanceLengths.length - 1, 5);
    writer.write(codeLengthCount - 4, 4);
    for (let index = 0; index < codeLengthCount; index += 1) {
      writer.write(codeLengthLengths[order[index]], 3);
    }

    const codeLengthCodes = huffmanCodes(codeLengthLengths);
    for (const length of combined) {
      writeSymbol(writer, length, codeLengthLengths, codeLengthCodes);
    }
    const literalCodes = huffmanCodes(literalLengths);
    for (const byte of input) writeSymbol(writer, byte, literalLengths, literalCodes);
    writeSymbol(writer, 256, literalLengths, literalCodes);
    return writer.finish();
  }

  function compactCanvas(displayPixels) {
    if (displayPixels.length !== 144) throw new Error("Expected 144 display pixels");
    const wire = new Uint8Array(432);
    displayPixels.forEach((pixel, index) => {
      wire[index * 3] = pixel[2];
      wire[index * 3 + 1] = pixel[1];
      wire[index * 3 + 2] = pixel[0];
    });
    return concat(Uint8Array.of(12, 12), deflateHuffmanOnly(wire));
  }

  function canvasCommand(displayPixels) {
    const canvas = compactCanvas(displayPixels);
    const payload = concat(fieldVarint(1, 0), fieldBytes(2, canvas));
    return concat(fieldVarint(1, 4), fieldBytes(7, payload));
  }

  const api = { SERVICE_UUID, COMMAND_UUID, startPaintCommand, compactCanvas, canvasCommand, deflateHuffmanOnly };
  root.LightyProtocol = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
