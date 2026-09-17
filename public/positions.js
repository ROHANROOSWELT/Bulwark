/**
 * BULWARK Positions & Risk Scanner Page Client
 */

let allPositions = [];

// Immediately hydrate table from cached state if available so page switches never search or flicker
(function initCachedPositions() {
  try {
    const raw = localStorage.getItem("bulwark_desk_state");
    if (raw) {
      const data = JSON.parse(raw);
      if (data.watchlist && data.watchlist.length > 0) {
        allPositions = data.watchlist;
        renderPositionsMetrics(allPositions);
        renderPositionsTable(allPositions);
      }
    }
  } catch (e) {}
})();

async function loadPositionsData() {
  const data = await fetchDeskState();
  if (!data || !data.watchlist) return;

  allPositions = data.watchlist;
  renderPositionsMetrics(allPositions);
  renderPositionsTable(allPositions);
}

function renderPositionsMetrics(positions) {
  let totalCollateral = 0;
  let totalDebt = 0;
  let hfSum = 0;
  let atRiskCount = 0;

  positions.forEach((p) => {
    totalCollateral += p.totalCollateralUsd || 0;
    totalDebt += p.totalDebtUsd || 0;
    const hf = p.healthFactor || 0;
    hfSum += hf;
    if (hf < 1.25) atRiskCount++;
  });

  const avgHf = positions.length > 0 ? (hfSum / positions.length).toFixed(3) : "--";

  document.getElementById("totalCollateralVal").textContent = `$${totalCollateral.toFixed(2)}`;
  document.getElementById("totalDebtVal").textContent = `$${totalDebt.toFixed(2)}`;
  document.getElementById("avgHfVal").textContent = avgHf;
  document.getElementById("atRiskCountVal").textContent = atRiskCount;
}

function renderPositionsTable(positions) {
  const tbody = document.getElementById("positionsTableBody");
  const filter = (document.getElementById("filterPositionsInput")?.value || "").toLowerCase();

  const filtered = positions.filter((p) => !filter || p.userAddress.toLowerCase().includes(filter));

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 24px;">
          ${positions.length === 0 ? "No monitored positions found." : "No positions matching filter."}
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered
    .map((p) => {
      const hf = p.healthFactor;
      const hfClass = hf < 1.2 ? "hf-critical" : hf < 1.5 ? "hf-caution" : "hf-healthy";
      const riskLevel = hf < 1.2 ? "CRITICAL (Rescue Eligible)" : hf < 1.5 ? "ELEVATED RISK" : "NORMAL";
      const riskClass = hf < 1.2 ? "status-invalidated" : hf < 1.5 ? "status-proposed" : "status-verified";
      const explorerUrl = p.chainId === 84532
        ? `https://sepolia.basescan.org/address/${p.userAddress}`
        : `https://sepolia.etherscan.io/address/${p.userAddress}`;

      return `
        <tr>
          <td>
            <a href="${explorerUrl}" target="_blank" rel="noopener" style="color: var(--accent-cyan); font-family: var(--font-mono); text-decoration: underline;">
              ${p.userAddress.slice(0, 8)}...${p.userAddress.slice(-6)} &nearr;
            </a>
          </td>
          <td style="font-family: var(--font-mono); font-weight: 600;">$${(p.totalCollateralUsd || 0).toFixed(2)}</td>
          <td style="font-family: var(--font-mono); font-weight: 600; color: var(--accent-rose);">$${(p.totalDebtUsd || 0).toFixed(2)}</td>
          <td>
            <span class="hf-badge ${hfClass}">${hf.toFixed(3)}</span>
          </td>
          <td style="font-family: var(--font-mono);">${((p.currentLiquidationThresholdBps || 8000) / 100).toFixed(1)}%</td>
          <td>
            <span class="status-badge ${riskClass}">${riskLevel}</span>
          </td>
          <td style="text-align: right;">
            <a href="/grants?owner=${encodeURIComponent(p.userAddress)}" class="btn-sm btn-approve" style="text-decoration: none; display: inline-block;">
              Underwrite Grant &rarr;
            </a>
          </td>
        </tr>
      `;
    })
    .join("");
}

async function performOnChainScan(address) {
  if (!address || !address.startsWith("0x") || address.length !== 42) {
    showToast("Invalid Ethereum address format. Must be 0x followed by 40 hex chars.", "error");
    return;
  }

  const btn = document.getElementById("runScanBtn");
  btn.disabled = true;
  btn.textContent = "Querying Aave...";

  try {
    const res = await fetch("/api/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Failed to scan position");
    }

    const snap = await res.json();
    renderScannedResult(snap);
    showToast(`Scan complete for ${address.slice(0, 6)}...${address.slice(-4)}`, "success");
  } catch (err) {
    console.error("Scan failed:", err);
    showToast(`Scan error: ${err.message}`, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Scan On-Chain";
  }
}

function renderScannedResult(snap) {
  const container = document.getElementById("scanResultContainer");
  container.style.display = "flex";

  const titleEl = document.getElementById("scannedBorrowerTitle");
  titleEl.textContent = `Borrower ${snap.userAddress.slice(0, 10)}...${snap.userAddress.slice(-6)}`;

  const hf = snap.healthFactor;
  const hfBadge = document.getElementById("scannedHfBadge");
  const fill = document.getElementById("scannedHfMeterFill");

  hfBadge.textContent = `HF ${hf.toFixed(3)}`;

  // Update meter visual
  let pct = Math.min(100, Math.max(5, (hf / 2.0) * 100));
  fill.style.width = `${pct}%`;

  if (hf < 1.2) {
    hfBadge.className = "hf-badge hf-critical";
    fill.className = "hf-meter-fill hf-fill-critical";
  } else if (hf < 1.5) {
    hfBadge.className = "hf-badge hf-caution";
    fill.className = "hf-meter-fill hf-fill-caution";
  } else {
    hfBadge.className = "hf-badge hf-healthy";
    fill.className = "hf-meter-fill hf-fill-healthy";
  }

  document.getElementById("scannedCollateral").textContent = `$${(snap.totalCollateralUsd || 0).toFixed(2)}`;
  document.getElementById("scannedDebt").textContent = `$${(snap.totalDebtUsd || 0).toFixed(2)}`;
  document.getElementById("scannedAvailable").textContent = `$${(snap.availableBorrowsUsd || 0).toFixed(2)}`;
  document.getElementById("scannedLiqThreshold").textContent = `${((snap.currentLiquidationThresholdBps || 8000) / 100).toFixed(1)}%`;

  const proposeBtn = document.getElementById("scannedProposeBtn");
  proposeBtn.onclick = () => {
    window.location.href = `/grants?owner=${encodeURIComponent(snap.userAddress)}`;
  };
}

document.addEventListener("DOMContentLoaded", () => {
  loadPositionsData();
  setInterval(loadPositionsData, 5000);

  // Search Filter
  const filterInput = document.getElementById("filterPositionsInput");
  if (filterInput) {
    filterInput.addEventListener("input", () => renderPositionsTable(allPositions));
  }

  // Refresh Button
  const refreshBtn = document.getElementById("refreshPositionsBtn");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => {
      loadPositionsData();
      showToast("Positions refreshed from node", "info");
    });
  }

  // Use Connected Wallet Button
  const useWalletBtn = document.getElementById("useConnectedWalletBtn");
  const scanInput = document.getElementById("scanAddressInput");
  if (useWalletBtn && scanInput) {
    useWalletBtn.addEventListener("click", () => {
      const activeAddress = window.bulwarkAuth?.address || (connectedWallet && connectedWallet.address);
      if (activeAddress) {
        scanInput.value = activeAddress;
        performOnChainScan(activeAddress);
      } else {
        showToast("No Web3 wallet or guardian currently active. Click 'Connect Wallet' in the header.", "error");
      }
    });
  }

  // Run Scan Button
  const runScanBtn = document.getElementById("runScanBtn");
  if (runScanBtn && scanInput) {
    runScanBtn.addEventListener("click", () => {
      performOnChainScan(scanInput.value.trim());
    });
  }

  // Auto-scan from query param ?scan=0x...
  const urlParams = new URLSearchParams(window.location.search);
  const scanTarget = urlParams.get("scan");
  if (scanTarget && scanInput) {
    scanInput.value = scanTarget;
    performOnChainScan(scanTarget);
  }
});
