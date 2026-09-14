#!/usr/bin/env bash
set -euo pipefail

# BULWARK Release Preparation Script
# Builds packages, creates npm tarball artifacts for SDK (@bulwark/core) and CLI (@bulwark/cli),
# and generates cryptographic SHA-256 checksums for GitHub release assets.

echo "=========================================================="
echo "          PREPARING BULWARK RELEASE ARTIFACTS             "
echo "=========================================================="

RELEASE_DIR="release-artifacts"
rm -rf "$RELEASE_DIR"
mkdir -p "$RELEASE_DIR"

echo "1. Building all packages..."
pnpm -r --filter './packages/*' build

echo "2. Packing @bulwark/core (SDK)..."
cd packages/core
CORE_TGZ=$(pnpm pack --pack-destination "../../$RELEASE_DIR" | tail -n 1)
cd ../..

echo "3. Packing @bulwark/cli..."
cd packages/cli
CLI_TGZ=$(pnpm pack --pack-destination "../../$RELEASE_DIR" | tail -n 1)
cd ../..

echo "4. Generating SHA-256 checksums..."
cd "$RELEASE_DIR"
sha256sum * > CHECKSUMS.txt
echo "Release Artifacts generated:"
cat CHECKSUMS.txt
cd ..

echo "=========================================================="
echo "  Artifacts ready in: $RELEASE_DIR/"
echo "=========================================================="
