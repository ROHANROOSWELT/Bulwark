#!/usr/bin/env bash
set -euo pipefail

# BULWARK Smoke Test Runner
# Verifies build, type-checking, and full test suite across workspace packages.
# Generates forensic test report in test/reports/last-run.txt.

mkdir -p test/reports

echo "=========================================================="
echo "          BULWARK PRE-FLIGHT SMOKE SUITE                  "
echo "=========================================================="

REPORT_FILE="test/reports/last-run.txt"
echo "Started smoke run at $(date -u +"%Y-%m-%dT%H:%M:%SZ")" > "$REPORT_FILE"

echo "1. Building workspace packages..."
pnpm -r --filter './packages/*' build | tee -a "$REPORT_FILE"

echo "2. Running workspace type-checks..."
pnpm -r --filter './packages/*' type-check | tee -a "$REPORT_FILE"

echo "3. Running Vitest test suites..."
pnpm vitest run --config vitest.config.ts 2>&1 | tee -a "$REPORT_FILE"

echo "=========================================================="
echo "  Smoke run completed successfully. Forensic report saved to: $REPORT_FILE"
echo "=========================================================="
