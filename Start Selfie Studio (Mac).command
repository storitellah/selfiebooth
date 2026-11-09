#!/bin/bash
# Double-click to run Selfie Studio on this Mac so it can print to your
# Wi-Fi photo printer (Canon SELPHY and other AirPrint printers).
# Works on Linux too. Needs no admin rights: if Node.js isn't installed,
# a private copy is downloaded into this folder the first time.
cd "$(dirname "$0")" || exit 1
NODE_VERSION="v22.22.0"

node_ok() { [ -x "$1" ] && [ "$("$1" -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)" -ge 18 ]; }

if [ -x ".node/bin/node" ] && node_ok ".node/bin/node"; then
  NODE=".node/bin/node"
elif command -v node >/dev/null 2>&1 && node_ok "$(command -v node)"; then
  NODE="$(command -v node)"
else
  case "$(uname -s)" in Darwin) os=darwin ;; Linux) os=linux ;; *) echo "Unsupported system"; exit 1 ;; esac
  case "$(uname -m)" in arm64 | aarch64) arch=arm64 ;; x86_64 | amd64) arch=x64 ;; *) echo "Unsupported processor"; exit 1 ;; esac
  echo ""
  echo "  First run: downloading Node.js for Selfie Studio (about 45 MB)…"
  tmp="$(mktemp -d)"
  if ! curl -fSL --progress-bar "https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-${os}-${arch}.tar.gz" -o "$tmp/node.tgz"; then
    echo "  Couldn't download Node.js. Check the internet connection and try again."
    exit 1
  fi
  rm -rf .node && mkdir -p .node && tar -xzf "$tmp/node.tgz" -C .node --strip-components=1 && rm -rf "$tmp"
  NODE=".node/bin/node"
fi

PORT="${PORT:-8080}"
URL="http://localhost:${PORT}/#studio"
echo ""
echo "  Starting Selfie Studio… (leave this window open while you use the booth)"
echo "  If macOS asks whether Terminal may find devices on your local network, choose Allow —"
echo "  that's how Selfie Studio reaches your Wi-Fi printer."
echo "  The booth opens at ${URL}"
echo ""
if [ -z "${SELFIE_NO_BROWSER:-}" ]; then
  ( sleep 2 && { open "$URL" 2>/dev/null || xdg-open "$URL" 2>/dev/null; } ) &
fi
PORT="$PORT" exec "$NODE" server.js
