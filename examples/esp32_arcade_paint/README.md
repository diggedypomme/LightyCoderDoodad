UNTESTED!!!


# ESP32 Arduino Paint Example

This sketch shows the smallest practical path for driving the stock Arcade Coder firmware from another microcontroller.

It uses an ESP32 as a BLE central/client:

1. Scan for the Arcade Coder service UUID, or connect to `TARGET_ADDRESS` if you set one.
2. Write the stock `start built-in paint` command.
3. Send a few pre-compressed compact canvas commands.

Open this folder in Arduino IDE:

```text
examples/esp32_arcade_paint
```

Board/library notes:

- Use an ESP32 board with the ESP32 Arduino core installed.
- The sketch uses the built-in ESP32 BLE Arduino headers such as `BLEDevice.h`.
- No zlib/miniz dependency is needed for this example because the sample canvases are already compressed.

For arbitrary generated frames on the ESP32, either add a raw-DEFLATE compressor or generate compact canvas bytes elsewhere and store them in flash.

Colour note: the 432-byte frame uses wire order `B, G, R` for each pixel.
