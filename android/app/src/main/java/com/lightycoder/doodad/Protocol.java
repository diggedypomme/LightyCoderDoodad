package com.lightycoder.doodad;

import java.io.ByteArrayOutputStream;
import java.util.UUID;
import java.util.zip.Deflater;

final class Protocol {
    static final UUID SERVICE_UUID = UUID.fromString("778d5426-fa29-4363-91fd-a9f5cfcfce85");
    static final UUID COMMAND_CHAR = UUID.fromString("e18d056b-7dae-49c1-b5f2-17684801e446");
    static final UUID CALLBACK_CHAR = UUID.fromString("21acb4a0-24d0-42f4-8e61-c827daf68d12");

    private Protocol() {}

    static byte[] startBuiltin(String module) {
        ByteArrayOutputStream payload = new ByteArrayOutputStream();
        fieldLen(payload, 1, module.getBytes());
        field32Float(payload, 2, 1.0f);

        ByteArrayOutputStream command = new ByteArrayOutputStream();
        fieldVarint(command, 1, 2);
        fieldLen(command, 4, payload.toByteArray());
        return command.toByteArray();
    }

    static byte[] compactCanvasCommand(byte[] compactCanvas) {
        ByteArrayOutputStream payload = new ByteArrayOutputStream();
        fieldVarint(payload, 1, 0);
        fieldLen(payload, 2, compactCanvas);

        ByteArrayOutputStream command = new ByteArrayOutputStream();
        fieldVarint(command, 1, 4);
        fieldLen(command, 7, payload.toByteArray());
        return command.toByteArray();
    }

    static byte[] compactCanvasFromDisplayRgb(int[] displayRgb) {
        if (displayRgb.length != 144) throw new IllegalArgumentException("expected 144 pixels");
        byte[] wire = new byte[432];
        for (int i = 0; i < displayRgb.length; i++) {
            int color = displayRgb[i];
            int r = (color >> 16) & 0xff;
            int g = (color >> 8) & 0xff;
            int b = color & 0xff;
            int o = i * 3;
            wire[o] = (byte) b;
            wire[o + 1] = (byte) g;
            wire[o + 2] = (byte) r;
        }
        byte[] deflated = deflateRaw(wire);
        byte[] out = new byte[deflated.length + 2];
        out[0] = 12;
        out[1] = 12;
        System.arraycopy(deflated, 0, out, 2, deflated.length);
        return out;
    }

    private static byte[] deflateRaw(byte[] input) {
        Deflater deflater = new Deflater(9, true);
        deflater.setInput(input);
        deflater.finish();
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[256];
        while (!deflater.finished()) {
            int count = deflater.deflate(buf);
            out.write(buf, 0, count);
        }
        deflater.end();
        return out.toByteArray();
    }

    private static void fieldVarint(ByteArrayOutputStream out, int field, int value) {
        varint(out, field << 3);
        varint(out, value);
    }

    private static void fieldLen(ByteArrayOutputStream out, int field, byte[] data) {
        varint(out, (field << 3) | 2);
        varint(out, data.length);
        out.write(data, 0, data.length);
    }

    private static void field32Float(ByteArrayOutputStream out, int field, float value) {
        int bits = Float.floatToIntBits(value);
        varint(out, (field << 3) | 5);
        out.write(bits & 0xff);
        out.write((bits >> 8) & 0xff);
        out.write((bits >> 16) & 0xff);
        out.write((bits >> 24) & 0xff);
    }

    private static void varint(ByteArrayOutputStream out, int value) {
        while (true) {
            int b = value & 0x7f;
            value >>>= 7;
            if (value == 0) {
                out.write(b);
                return;
            }
            out.write(b | 0x80);
        }
    }
}