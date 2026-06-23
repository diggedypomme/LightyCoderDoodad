"""Minimal protocol helpers for the Tech Will Save Us Arcade Coder stock app path."""

from __future__ import annotations

import struct

SERVICE_UUID = "778d5426-fa29-4363-91fd-a9f5cfcfce85"
COMMAND_CHAR = "e18d056b-7dae-49c1-b5f2-17684801e446"
CALLBACK_CHAR = "21acb4a0-24d0-42f4-8e61-c827daf68d12"
GAME_CHAR = "27f450db-9197-4e02-85fd-9cba87639a28"

WIRE_VARINT = 0
WIRE_64BIT = 1
WIRE_LEN = 2
WIRE_32BIT = 5


class ProtobufEncoder:
    @staticmethod
    def encode_varint(value: int) -> bytes:
        if value < 0:
            raise ValueError("varint must be non-negative")
        out = bytearray()
        while True:
            byte = value & 0x7F
            value >>= 7
            if value:
                out.append(byte | 0x80)
            else:
                out.append(byte)
                return bytes(out)

    @staticmethod
    def encode_field(field_num: int, wire_type: int, value) -> bytes:
        key = ProtobufEncoder.encode_varint((field_num << 3) | wire_type)
        if wire_type == WIRE_VARINT:
            return key + ProtobufEncoder.encode_varint(int(value))
        if wire_type == WIRE_LEN:
            if isinstance(value, str):
                value = value.encode("utf-8")
            return key + ProtobufEncoder.encode_varint(len(value)) + bytes(value)
        if wire_type == WIRE_32BIT:
            if isinstance(value, float):
                return key + struct.pack("<f", value)
            return key + int(value).to_bytes(4, "little", signed=True)
        if wire_type == WIRE_64BIT:
            return key + int(value).to_bytes(8, "little", signed=True)
        raise ValueError(f"unsupported wire type: {wire_type}")


class CommandMessage:
    enc = ProtobufEncoder()

    @staticmethod
    def start_builtin(module_name: str, timing: float = 1.0) -> bytes:
        payload = CommandMessage.enc.encode_field(1, WIRE_LEN, module_name)
        payload += CommandMessage.enc.encode_field(2, WIRE_32BIT, timing)
        command = CommandMessage.enc.encode_field(1, WIRE_VARINT, 2)
        command += CommandMessage.enc.encode_field(4, WIRE_LEN, payload)
        return command

    @staticmethod
    def compact_canvas(canvas: bytes) -> bytes:
        payload = CommandMessage.enc.encode_field(1, WIRE_VARINT, 0)
        payload += CommandMessage.enc.encode_field(2, WIRE_LEN, canvas)
        command = CommandMessage.enc.encode_field(1, WIRE_VARINT, 4)
        command += CommandMessage.enc.encode_field(7, WIRE_LEN, payload)
        return command