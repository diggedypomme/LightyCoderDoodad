# Android App

This folder contains a native Android version of the LightyCoderDoodad controller.

It is deliberately separate from the Python/web UI so both can evolve independently.

## Current features

- BLE scan/connect button.
- Start stock `paint` module.
- 12x12 pad.
- Colour selection.
- Brightness slider.
- Multi-cell selection.
- Send selected/generated grid as a compact canvas.
- Image page that loads an image, centre-crops it, downsamples it to 12x12, and sends it.
- Animation page with generated wipe/pulse/rainbow examples streamed as compact canvases.

## Build

Open this folder in Android Studio:

```text
LightyCoderDoodad/android
```

Or from a machine with Android Gradle tooling installed:

```bat
cd LightyCoderDoodad\android
gradlew.bat assembleDebug
```

On this machine Android Studio is installed at `C:\Program Files\Android\Android Studio\bin\studio64.exe`, and `local.properties` points at `C:\Users\superpomme\AppData\Local\Android\Sdk`. Run `..\open_android_studio.bat` from the repo root, or open the `android` folder manually in Android Studio.

A Gradle wrapper is included and pinned to Gradle 9.1.0. Android Studio should sync using that wrapper.

## Permissions

The app requests BLE permissions at runtime:

- Android 12+: `BLUETOOTH_SCAN`, `BLUETOOTH_CONNECT`
- Older Android: location permission for BLE scanning

Image loading uses Android's content picker.

## BLE behaviour

The app scans for devices that either advertise the Arcade Coder service UUID or have a name containing `arcade`/`coder`.

After connecting it requests MTU 517. This matters because compact image canvases can be larger than a default BLE packet. Simple one-pixel and sparse frames compress very small; noisy photos may compress poorly and can still fail on some phones/firmware paths.

## Protocol path

The Android app uses the same working path as the Python UI:

1. Connect over BLE.
2. Send built-in start command for `paint`.
3. Convert 12x12 display RGB pixels to the wire colour order.
4. Raw-DEFLATE the 432-byte frame.
5. Send it as a compact canvas command.

## Important caveats

- This is a first native Android scaffold, not a polished Play Store app.
- It has not been built in this environment because the Android SDK is not installed here.
- It does not yet persist a chosen device address.
- It does not yet include a manual device picker if several matching devices are present.
- If image frames fail to send, try simpler images or the pad page first to confirm BLE is working.
