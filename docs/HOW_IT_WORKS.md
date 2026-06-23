# How The Stock App Path Works

The Arcade Coder is an ESP32 device with a 12x12 RGB LED matrix. The useful BLE path is a stock service with command and callback characteristics.

## BLE characteristics

- Service: `778d5426-fa29-4363-91fd-a9f5cfcfce85`
- Command: `e18d056b-7dae-49c1-b5f2-17684801e446`
- Callback: `21acb4a0-24d0-42f4-8e61-c827daf68d12`
- Game upload: `27f450db-9197-4e02-85fd-9cba87639a28`

## Onboard modules

Known module names:

- `paint` - useful control mode. It accepts compact canvas updates and updates the matrix.
- `testmode` - onboard colour-cycle/demo mode.
- `initial-interaction` - stock first-run style interaction.
- `matrix` - appears to be a support module and may error if started directly.

## Paint mode

The current reliable workflow is:

1. Connect over BLE.
2. Start built-in module `paint`.
3. Send compact canvas payloads as command type 4.

A compact canvas is:

```text
byte 0: width
byte 1: height
bytes 2..n: raw DEFLATE stream containing width * height * 3 bytes
```

For the full matrix that means 12 x 12 x 3 = 432 inflated bytes.

## Colour order

The UI exposes normal display colours, but the hardware path behaves as if red and blue need swapping for the values sent over the wire. The app handles this for generated images and pixel-grid output.

## App upload notes

The firmware has a game upload characteristic and can save named app bundles. This is important continuation work, even though the current reliable display-control path uses the built-in `paint` module.

What we established:

- The game/app name problem was solved: Game field 2 is the runtime name used by save/start logs.
- Saves with a real name worked, for example `Saved game 'testclone'`.
- Starting by that name reached the VM loader, so the name and start command were connected.
- Plain JavaScript source did not work as a simple upload because the costume string field is small and hits serializer limits.
- Moving bytes into the larger costume data field allowed uploads, but extracted fragments were not complete standalone VM bundles.
- Several malformed or incomplete bundles crashed/rebooted the board when started.

The current read is: the app-upload path is real, but the exact complete VM bundle/container format is still unresolved. See `APP_BUNDLE_NOTES.md` for the detailed handoff.

## Bleak notes

On Windows, BLE writes can fail if another process is holding the device or if the MTU/write mode does not match what Windows accepts. The UI and scripts use short writes with `response=False` for the paint path.