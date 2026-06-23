@echo off
setlocal
cd /d "%~dp0"

echo LightyCoderDoodad UI launcher
echo.
echo Default mode: no UART attached.
echo This starts app\server_live.py --no-uart.
echo.
echo For UART logging, run start_ui_with_uart.bat instead.
echo.
call scripts\ensure_venv.bat || exit /b 1
venv\Scripts\python.exe app\server_live.py --no-uart %*
