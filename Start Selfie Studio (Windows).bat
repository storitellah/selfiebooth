@echo off
rem Double-click to run Selfie Studio on this PC so it can print to your
rem Wi-Fi photo printer (Canon SELPHY and other IPP/Mopria printers).
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Selfie Studio needs Node.js ^(free^) to talk to your printer.
  echo   Opening nodejs.org - install the LTS version, then double-click this file again.
  start "" "https://nodejs.org/en/download"
  pause
  exit /b 1
)
echo.
echo   Starting Selfie Studio... (leave this window open while you use the booth)
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:8080/#studio"
node server.js
pause
