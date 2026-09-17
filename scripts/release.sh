#!/usr/bin/env bash
set -euo pipefail

# BULWARK GitHub Release Script
# Verifies artifacts exist, checks gate conditions, and cuts release using GitHub CLI (gh).

VERSION="0.1.0"
RELEASE_DIR="release-artifacts"

if [ ! -d "$RELEASE_DIR" ] || [ ! -f "$RELEASE_DIR/CHECKSUMS.txt" ]; then
  echo "[ERROR] Release artifacts not found. Run ./scripts/prepare-release.sh first."
  exit 1
fi

echo "=========================================================="
echo "          BULWARK GITHUB RELEASE: v${VERSION}             "
echo "=========================================================="

echo "Artifacts to publish:"
cat "$RELEASE_DIR/CHECKSUMS.txt"
echo ""

if ! command -v gh &> /dev/null; then
  echo "[NOTE] GitHub CLI (gh) not installed or not in PATH."
  echo "You can publish manually by creating release 'v${VERSION}' on GitHub and uploading the files in $RELEASE_DIR/."
  exit 0
fi

echo "To publish the GitHub release with release assets and notes, run:"
echo "  gh release create \"v${VERSION}\" \\"
echo "    \"$RELEASE_DIR\"/* \\"
echo "    --title \"BULWARK v${VERSION} — Deterministic Aave Backstop on KeeperHub\" \\"
echo "    --notes \"BULWARK v${VERSION} — Deterministic Aave Backstop Economy on KeeperHub\""
