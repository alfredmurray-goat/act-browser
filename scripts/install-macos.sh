#!/bin/bash
# Installs (or updates) Act Browser on macOS.
#
# Act Browser isn't notarized by Apple yet, so a copy downloaded in a browser
# carries the quarantine flag and macOS refuses to open it. Files fetched with
# curl don't get that flag, so this script downloads the disk image itself,
# clears any leftover flags and puts the app in /Applications. That means it
# opens on the first try, with no "Open Anyway" detour.
#
#   curl -fsSL https://raw.githubusercontent.com/alfredmurray-goat/act-browser/main/scripts/install-macos.sh | bash
#
# Or install a specific version:
#
#   curl -fsSL .../install-macos.sh | bash -s -- 0.7.10
#
# Run it again any time to update. Your profile and settings are kept; only
# the app bundle is replaced.

set -euo pipefail

REPO="alfredmurray-goat/act-browser"
APP="Act Browser"
DEST="${ACT_INSTALL_DEST:-/Applications/${APP}.app}"
TARGET_DIR="$(dirname "${DEST}")"

say() { printf '\033[35m[act]\033[0m %s\n' "$*"; }
die() { printf '\033[31m[act]\033[0m %s\n' "$*" >&2; exit 1; }

[ "$(uname -s)" = "Darwin" ] || die "This script is for macOS."

VERSION="${1:-}"
if [ -n "${ACT_INSTALL_URL:-}" ]; then
  URL="${ACT_INSTALL_URL}"
  say "Downloading ${URL}…"
elif [ -z "$VERSION" ] || [ "$VERSION" = "latest" ]; then
  URL="https://github.com/${REPO}/releases/latest/download/Act-Browser-mac.dmg"
  say "Downloading the latest Act Browser…"
else
  VERSION="${VERSION#v}"
  URL="https://github.com/${REPO}/releases/download/v${VERSION}/Act-Browser-mac.dmg"
  say "Downloading Act Browser ${VERSION}…"
fi

TMP="$(mktemp -d "${TMPDIR:-/tmp}/act-install.XXXXXX")"
MNT="${TMP}/disk"
cleanup() {
  /usr/bin/hdiutil detach "${MNT}" -quiet >/dev/null 2>&1 || true
  rm -rf "${TMP}"
}
trap cleanup EXIT

# curl, unlike Safari, doesn't add com.apple.quarantine.
/usr/bin/curl -fL --progress-bar "${URL}" -o "${TMP}/ActBrowser.dmg" \
  || die "Couldn't download ${URL}"

mkdir -p "${MNT}"
/usr/bin/hdiutil attach "${TMP}/ActBrowser.dmg" -nobrowse -readonly -quiet -mountpoint "${MNT}" \
  || die "Couldn't open the disk image."
[ -d "${MNT}/${APP}.app" ] || die "The disk image doesn't contain ${APP}.app."

# Quitting first means the swap can't leave a half-running app behind.
say "Quitting any running copy…"
/usr/bin/osascript -e "tell application \"${APP}\" to quit" >/dev/null 2>&1 || true
for _ in 1 2 3 4 5; do
  /usr/bin/pgrep -f "${DEST}/Contents/MacOS/firefox" >/dev/null 2>&1 || break
  sleep 1
done
/usr/bin/pkill -f "${DEST}/Contents/MacOS/firefox" >/dev/null 2>&1 || true

# Copy next to the target first, then swap: a crash mid-copy leaves the old
# app in place instead of no app at all.
STAGE="${TARGET_DIR}/.${APP}.installing.$$"
say "Installing to ${DEST}…"
if [ -w "${TARGET_DIR}" ]; then
  rm -rf "${STAGE}" "${DEST}.old"
  /usr/bin/ditto "${MNT}/${APP}.app" "${STAGE}"
  if [ -e "${DEST}" ]; then mv "${DEST}" "${DEST}.old"; fi
  mv "${STAGE}" "${DEST}"
  rm -rf "${DEST}.old"
  sudo=""
else
  say "${TARGET_DIR} needs an administrator password."
  sudo="sudo"
  ${sudo} rm -rf "${STAGE}" "${DEST}.old"
  ${sudo} /usr/bin/ditto "${MNT}/${APP}.app" "${STAGE}"
  if [ -e "${DEST}" ]; then ${sudo} mv "${DEST}" "${DEST}.old"; fi
  ${sudo} mv "${STAGE}" "${DEST}"
  ${sudo} rm -rf "${DEST}.old"
fi

# Belt and braces: nothing in the bundle may keep a quarantine flag.
${sudo} /usr/bin/xattr -dr com.apple.quarantine "${DEST}" >/dev/null 2>&1 || true

# Refuse to call a broken copy a success.
/usr/bin/codesign --verify --deep --strict "${DEST}" >/dev/null 2>&1 \
  || die "The installed app failed its signature check."

INSTALLED="$(/usr/bin/plutil -extract version raw -o - \
  "${DEST}/Contents/Resources/act/build.json" 2>/dev/null || true)"
say "Installed ${APP}${INSTALLED:+ ${INSTALLED}}."

# The first launch after an install can race with LaunchServices still reading
# the new bundle, so give it a moment.
if [ -z "${ACT_INSTALL_NO_LAUNCH:-}" ]; then
  sleep 1
  /usr/bin/open -a "${DEST}"
fi
say "Done. Open it from Launchpad or Spotlight like any other app."
