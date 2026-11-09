#!/bin/bash
# Double-click to run Selfie Studio on this Mac so it can print to your
# Wi-Fi photo printer (Canon SELPHY and other AirPrint printers).
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "  Selfie Studio needs Node.js (free) to talk to your printer."
  echo "  Opening nodejs.org — install the LTS version, then double-click this file again."
  echo ""
  open "https://nodejs.org/en/download"
  read -r -p "Press Return to close…"
  exit 1
fi

PORT="${PORT:-8080}"
echo ""
echo "  Starting Selfie Studio… (leave this window open while you use the booth)"
( sleep 2 && open "http://localhost:${PORT}/#studio" ) &
PORT="$PORT" node server.js
