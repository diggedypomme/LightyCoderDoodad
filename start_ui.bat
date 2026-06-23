@echo off
setlocal
cd /d "%~dp0"

echo LightyCoderDoodad UI launcher
echo.
echo This starts the LIVE server: app\server_live.py
echo That means it also tries to open UART logging unless you pass --no-uart.
echo.
echo This expects a Python virtual environment at .\venv\
echo If this is a fresh checkout, run:
echo   python -m venv venv
echo   venv\Scripts\python.exe -m pip install -r requirements.txt
echo.

if not exist "venv\Scripts\python.exe" (
    echo ERROR: venv\Scripts\python.exe was not found.
    echo Create the venv first with:
    echo   python -m venv venv
    echo   venv\Scripts\python.exe -m pip install -r requirements.txt
    echo.
    pause
    exit /b 1
)

venv\Scripts\python.exe app\server_live.py %*
