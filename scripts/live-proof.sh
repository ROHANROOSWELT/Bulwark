#!/usr/bin/env bash
set -euo pipefail

# BULWARK Live Proof Execution Script
# Runs the full real cycle with live KeeperHub key & Sepolia testnet.
# Outputs transaction link and exports Proof of Authorized Agency (PoAA) bundle.

echo "=========================================================="
echo "          BULWARK LIVE PROOF EXECUTION CYCLE              "
echo "=========================================================="

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

if [ -z "${KEEPERHUB_API_KEY:-}" ]; then
  echo "[ERROR] KEEPERHUB_API_KEY environment variable is not set."
  echo "To run a live on-chain rescue, provide a funded KeeperHub organization API key:"
  echo "  export KEEPERHUB_API_KEY=kh_your_live_key"
  echo "  ./scripts/live-proof.sh"
  exit 1
fi

CLI="node packages/cli/dist/index.js"
TARGET_USER="${1:-0xE406f471E711A2C8012e95c4B09fa9F1C9ae8123}"
CHAIN_ID="${BULWARK_CHAIN_ID:-84532}"
OUTPUT_PROOF="${2:-./live-proof-bundle.json}"

echo "[STEP 1/8] Running system doctor..."
$CLI doctor

echo ""
echo "[STEP 2/8] Checking API keys and organization status..."
$CLI keys check

echo ""
echo "[STEP 3/8] Scanning Aave V3 position for ${TARGET_USER} on chain ${CHAIN_ID}..."
$CLI positions scan --chain "$CHAIN_ID" --address "$TARGET_USER"

echo ""
echo "[STEP 4/8] Proposing RescueGrant..."
PROPOSE_OUT=$($CLI grants propose --chain "$CHAIN_ID" --address "$TARGET_USER" --amount 25)
echo "$PROPOSE_OUT"
GRANT_ID=$(echo "$PROPOSE_OUT" | grep -o 'bg_[a-zA-Z0-9_-]\+' | head -n 1)

if [ -z "$GRANT_ID" ]; then
  echo "[ERROR] Failed to extract grant ID from proposal output."
  exit 1
fi

echo ""
echo "[STEP 5/8] Approving RescueGrant ${GRANT_ID} (explicit human owner approval)..."
$CLI grants approve "$GRANT_ID"

echo ""
echo "[STEP 6/8] Dry-running rescue simulation via KeeperHub simulate:true..."
$CLI grants dry "$GRANT_ID"

echo ""
echo "[STEP 7/8] Executing rescue with Idempotency-Key and Turnkey signing..."
EXEC_OUT=$($CLI grants execute "$GRANT_ID")
echo "$EXEC_OUT"

echo ""
echo "[STEP 8/8] Exporting & verifying Proof of Authorized Agency (PoAA) bundle..."
$CLI proof export "$GRANT_ID" --out "$OUTPUT_PROOF"
$CLI proof verify "$OUTPUT_PROOF"

echo "=========================================================="
echo "  LIVE PROOF COMPLETE."
echo "  Exported Bundle: $OUTPUT_PROOF"
echo "  Verify on web:   http://localhost:4567/verify"
echo "=========================================================="
