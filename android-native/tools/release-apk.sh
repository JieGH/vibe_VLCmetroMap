#!/usr/bin/env bash
# Build a sideload-signed native release APK and attach it to a GitHub release (for Obtainium / direct download).
# Usage: tools/release-apk.sh [tag]   (default: the latest GitHub release); NO_UPLOAD=1 builds and signs only
# The sideload key lives outside the repo (~/.android/xarxa-sideload.*) and is created on first run.
# It must stay different from the Play upload key and must never change, or installed copies cannot update.
set -euo pipefail
cd "$(dirname "$0")/.."

export JAVA_HOME=${JAVA_HOME:-/opt/homebrew/opt/openjdk@21}
export ANDROID_HOME=${ANDROID_HOME:-/opt/homebrew/share/android-commandlinetools}
export PATH=$JAVA_HOME/bin:$PATH

KS=~/.android/xarxa-sideload.jks
PASS_FILE=~/.android/xarxa-sideload.pass
if [ ! -f "$KS" ]; then
  umask 077
  openssl rand -hex 16 > "$PASS_FILE"
  keytool -genkeypair -keystore "$KS" -alias xarxa-sideload -keyalg RSA -keysize 4096 -validity 10000 \
    -storepass "$(cat "$PASS_FILE")" -keypass "$(cat "$PASS_FILE")" -dname "CN=Xarxa sideload"
  echo "Created $KS. Back it up together with $PASS_FILE."
fi

TAG=${1:-$(gh release view --json tagName -q .tagName)}
VERSION=$(sed -n 's/^versionName=//p' version.properties)

./gradlew assembleRelease
UNSIGNED=app/build/outputs/apk/release
SRC=$(ls "$UNSIGNED"/app-release*.apk | head -1)
OUT="build/Xarxa-v$VERSION-android.apk"
STABLE="build/Xarxa-android.apk" # the name the README and the website link to, via releases/latest/download/
APKSIGNER=$(ls "$ANDROID_HOME"/build-tools/*/apksigner | sort -V | tail -1)
# apksigner reads one line per file, so pass the shared password via env, not file: twice
SIDELOAD_PASS=$(cat "$PASS_FILE") "$APKSIGNER" sign --ks "$KS" --ks-key-alias xarxa-sideload \
  --ks-pass env:SIDELOAD_PASS --key-pass env:SIDELOAD_PASS --out "$OUT" "$SRC"
"$APKSIGNER" verify --print-certs "$OUT" | head -3

cp "$OUT" "$STABLE"
if [ -n "${NO_UPLOAD:-}" ]; then echo "Built $OUT (NO_UPLOAD set, nothing uploaded)"; exit 0; fi
gh release upload "$TAG" "$OUT" "$STABLE" --clobber
echo "Attached $(basename "$OUT") and $(basename "$STABLE") to $TAG"
