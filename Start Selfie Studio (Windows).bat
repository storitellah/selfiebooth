@echo off
rem Double-click to run Selfie Studio on this PC so it can print to your
rem Wi-Fi photo printer (Canon SELPHY and other IPP/Mopria printers).
rem Needs no admin rights: if Node.js isn't installed, a private copy is
rem downloaded into this folder the first time.
cd /d "%~dp0"
set NODE_VERSION=v22.22.0
set NODE=
if exist ".node\node.exe" set NODE=.node\node.exe
if not defined NODE (
  where node >nul 2>nul && set NODE=node
)
if not defined NODE (
  echo.
  echo   First run: downloading Node.js for Selfie Studio ^(about 30 MB^)...
  set ARCH=x64
  if /i "%PROCESSOR_ARCHITECTURE%"=="ARM64" set ARCH=arm64
  powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$ErrorActionPreference='Stop'; $v='%NODE_VERSION%'; $a=$env:ARCH; $t=Join-Path $env:TEMP 'selfie-node.zip';" ^
    "Invoke-WebRequest \"https://nodejs.org/dist/$v/node-$v-win-$a.zip\" -OutFile $t;" ^
    "if (Test-Path .node) { Remove-Item .node -Recurse -Force }; Expand-Archive $t -DestinationPath .node-tmp -Force;" ^
    "Move-Item (Get-ChildItem .node-tmp)[0].FullName .node; Remove-Item .node-tmp -Recurse -Force; Remove-Item $t"
  if not exist ".node\node.exe" (
    echo   Couldn't download Node.js. Check the internet connection and try again.
    pause
    exit /b 1
  )
  set NODE=.node\node.exe
)
echo.
echo   Starting Selfie Studio... (leave this window open while you use the booth)
echo   If Windows asks whether Node.js may use private networks, choose Allow.
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:8080/#studio"
"%NODE%" server.js
pause
