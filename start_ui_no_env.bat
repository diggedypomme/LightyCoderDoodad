@echo off
setlocal
cd /d "%~dp0"

echo LightyCoderDoodad UI launcher - no venv
echo.
echo This uses your system Python directly instead of .\venv\
echo It expects the requirements to already be installed for that Python.
echo If imports fail, use the venv setup instead:
echo   python -m venv venv
echo   venv\Scripts\python.exe -m pip install -r requirements.txt
echo.
echo Default mode here is no UART. Pass extra server options after the batch name.
echo.
python app\server_live.py --no-uart %*
