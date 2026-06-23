@echo off
setlocal
cd /d "%~dp0"

echo LightyCoderDoodad UI launcher - with UART
echo.
echo This starts the LIVE server with UART logging enabled.
echo Default UART is COM3 @ 230400 baud.
echo Pass options through here, e.g. --uart-port COM5
echo.
call scripts\ensure_venv.bat || exit /b 1
venv\Scripts\python.exe app\server_live.py %*
