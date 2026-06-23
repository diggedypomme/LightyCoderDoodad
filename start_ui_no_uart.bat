@echo off
setlocal
cd /d "%~dp0"

echo LightyCoderDoodad UI launcher - no UART
echo.
echo This starts the LIVE server but disables UART logging.
echo Use this if you do not have UART connected, or another terminal has COM3 open.
echo.
call scripts\ensure_venv.bat || exit /b 1
venv\Scripts\python.exe app\server_live.py --no-uart %*
