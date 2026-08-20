#!/bin/bash
# Rebuilds and re-signs the two Spotlight launcher apps in ~/Applications.
#
# Run this after changing scripts/launcher.c or moving the project.
#
# Each rebuild changes the ad-hoc code signature. In practice the existing Full
# Disk Access grant has kept matching across rebuilds, but if a launch starts
# failing with a permission alert again, remove and re-add both apps under
# System Settings > Privacy & Security > Full Disk Access.
set -euo pipefail

PROJECT_DIR="/Users/henrygerlach/Documents/Repositories/personal/Garmin Activity Map"
APPS_DIR="$HOME/Applications"

build() {
  local app="$1" exe="$2" script="$3"
  local stub="$APPS_DIR/$app/Contents/MacOS/$exe"
  echo "Building $app..."
  cc -O2 \
    -DSCRIPT_PATH="\"$PROJECT_DIR/scripts/$script\"" \
    -DAPP_NAME="\"$exe\"" \
    -o "$stub" "$PROJECT_DIR/scripts/launcher.c"
  codesign --force --deep -s - "$APPS_DIR/$app"
  echo "  $(file -b "$stub")"
}

build "Garmin Activity Map.app"      "Garmin Activity Map"      start-app.sh
build "Stop Garmin Activity Map.app" "Stop Garmin Activity Map" stop-app.sh
echo "Done."
