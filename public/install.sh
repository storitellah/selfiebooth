#!/bin/bash
# Selfie Studio installer for Mac (works on Linux too).
#
#   curl -fsSL https://selfiebooth.pages.dev/install.sh | bash
#
# Installs into "~/Selfie Studio", puts a "Selfie Studio" shortcut on the
# Desktop and starts the booth. No admin password needed. Run it again any
# time to update; your saved printer is kept.
set -euo pipefail

BRANCH="${SELFIE_BRANCH:-claude/exciting-maxwell-oq0a84}"
ARCHIVE="${SELFIE_ARCHIVE_URL:-https://codeload.github.com/storitellah/selfiebooth/tar.gz/refs/heads/${BRANCH}}"
DEST="${SELFIE_DIR:-$HOME/Selfie Studio}"
DESKTOP="${SELFIE_DESKTOP:-$HOME/Desktop}"

say() { printf '  %s\n' "$*"; }

echo ""
say "📸  Installing Selfie Studio by Storitellah"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

say "Downloading the latest version…"
curl -fsSL "$ARCHIVE" -o "$tmp/app.tgz"
mkdir -p "$tmp/app"
tar -xzf "$tmp/app.tgz" -C "$tmp/app" --strip-components=1

mkdir -p "$DEST"
# Replace the app files but keep the saved printer (config.json) and Node.js (.node).
for item in "$tmp/app/"* "$tmp/app/".[!.]*; do
  [ -e "$item" ] || continue
  name="$(basename "$item")"
  rm -rf "${DEST:?}/$name"
  cp -R "$item" "$DEST/$name"
done
chmod +x "$DEST/Start Selfie Studio (Mac).command"
say "Installed in: $DEST"

# A Desktop shortcut for next time (created here, so macOS doesn't block it).
if [ -d "$DESKTOP" ]; then
  shortcut="$DESKTOP/Selfie Studio.command"
  printf '#!/bin/bash\nexec "%s/Start Selfie Studio (Mac).command"\n' "$DEST" > "$shortcut"
  chmod +x "$shortcut"
  say "Shortcut added: Desktop → Selfie Studio"
fi

echo ""
if [ -n "${SELFIE_NO_START:-}" ]; then
  say "Done. Double-click “Selfie Studio” on your Desktop to start."
  exit 0
fi
say "Starting the booth…"
exec "$DEST/Start Selfie Studio (Mac).command"
