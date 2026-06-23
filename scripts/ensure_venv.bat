@echo off
if not exist "venv\Scripts\python.exe" (
    echo ERROR: venv\Scripts\python.exe was not found.
    echo.
    echo Create the venv first with:
    echo   python -m venv venv
    echo   venv\Scripts\python.exe -m pip install -r requirements.txt
    echo.
    pause
    exit /b 1
)
exit /b 0
