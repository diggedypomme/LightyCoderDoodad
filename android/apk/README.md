# Android APK

A debug APK is included here for convenience:

```text
android/apk/LightyCoderDoodad-debug.apk
```

You should really build it yourself from source rather than trusting random APKs from GitHub. I cannot be responsible for issues caused by installing prebuilt binaries from the internet.

Or just install it anyway, I'm not your mum.

SHA256 for the included APK:

```text
C80DEDC1976E57B4E51E4A1F879B5F1F50F32588E7839F05B7894FF23F3814D2
```

## Build It Yourself

Open `LightyCoderDoodad/android` in Android Studio, or run:

```bat
cd LightyCoderDoodad\android
gradlew.bat :app:assembleDebug
```

The local build output is:

```text
android/app/build/outputs/apk/debug/LightyCoderDoodad.apk
```
