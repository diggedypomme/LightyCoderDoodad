# Scripts

All scripts read the device address from `device_config.json` unless you pass `--address`.

## Scan and save

```bat
venv\Scripts\python.exe scripts\scan_devices.py
venv\Scripts\python.exe scripts\scan_devices.py --save-first-likely
venv\Scripts\python.exe scripts\scan_devices.py --save YOUR_DEVICE_ADDRESS
```

## Start onboard modules

```bat
venv\Scripts\python.exe scripts\start_module.py paint
venv\Scripts\python.exe scripts\start_module.py testmode
```

## Send a known compact canvas

```bat
venv\Scripts\python.exe scripts\send_canvas.py br --start
venv\Scripts\python.exe scripts\send_canvas.py bl_bright_red --start
```

## Send a generated single pixel

```bat
venv\Scripts\python.exe scripts\send_pixel.py 11 11 --colour red --start
venv\Scripts\python.exe scripts\send_pixel.py 0 0 --rgb 255 255 255 --start
```

Colour names are display-oriented, but the script stores the wire values that worked with the device path.