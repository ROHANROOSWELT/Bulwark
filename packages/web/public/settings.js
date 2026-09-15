/**
 * BULWARK Diagnostics & Settings Client
 */

async function loadDoctorData() {
  const btn = document.getElementById("runDoctorBtn");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Pinging Node...";
  }

  try {
    const res = await fetch("/api/doctor");
    if (!res.ok) throw new Error("Doctor endpoint error");
    const data = await res.json();
    renderDoctorData(data);
    showToast("Diagnostics refreshed", "info");
  } catch (err) {
    console.error("Doctor error:", err);
    showToast(`Doctor check failed: ${err.message}`, "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Refresh Doctor Ping";
    }
  }
}

function renderDoctorData(data) {
  // 1. RPC Ping
  const rpcBadge = document.getElementById("rpcStatusBadge");
  const blockVal = document.getElementById("rpcBlockVal");
  const chainName = data.chains?.[data.chainId]?.name || (data.chainId === 84532 ? "Base Sepolia" : "Sepolia");

  const rpcTitle = document.getElementById("rpcTitleText");
  if (rpcTitle) rpcTitle.textContent = `${chainName} RPC Node`;

  const cfgChainEl = document.getElementById("diagConfiguredChain");
  if (cfgChainEl) cfgChainEl.textContent = `${data.chainId} (${chainName})`;

  const rpcEpEl = document.getElementById("diagRpcEndpoint");
  if (rpcEpEl && data.chains?.[data.chainId]?.defaultRpcUrl) {
    try {
      const url = new URL(data.chains[data.chainId].defaultRpcUrl);
      rpcEpEl.textContent = url.hostname;
    } catch {
      rpcEpEl.textContent = data.chains[data.chainId].defaultRpcUrl;
    }
  }

  const explorerEl = document.getElementById("diagBlockExplorer");
  if (explorerEl && data.chains?.[data.chainId]?.blockExplorerUrl) {
    explorerEl.href = data.chains[data.chainId].blockExplorerUrl;
    try {
      const url = new URL(data.chains[data.chainId].blockExplorerUrl);
      explorerEl.textContent = `${url.hostname} ↗`;
    } catch {
      explorerEl.textContent = data.chains[data.chainId].blockExplorerUrl;
    }
  }

  if (data.rpcPing?.success) {
    rpcBadge.className = "chip chip-chain";
    rpcBadge.textContent = "CONNECTED & HEALTHY";
    blockVal.textContent = `#${data.rpcPing.blockNumber.toLocaleString()}`;
  } else {
    rpcBadge.className = "chip chip-unavailable";
    rpcBadge.textContent = "UNREACHABLE";
    blockVal.textContent = data.rpcPing?.error || "Error";
  }

  // 2. KeeperHub Gateway
  const khBadge = document.getElementById("khStatusBadge");
  const khKeyStatus = document.getElementById("khKeyStatus");
  const khSpendCap = document.getElementById("khSpendCapVal");

  if (data.apiKey?.present) {
    khBadge.className = "chip chip-keeperhub";
    khBadge.textContent = "KEY DETECTED";
    khKeyStatus.innerHTML = `<span style="color: var(--accent-emerald);">Active (${data.apiKey.masked || "kh_t...b3a1"})</span>`;
  } else {
    khBadge.className = "chip chip-unavailable";
    khBadge.textContent = "NO KEY SET";
    khKeyStatus.innerHTML = `<span style="color: var(--accent-rose);">Key missing (Simulations only)</span>`;
  }

  if (data.spendCap) {
    khSpendCap.textContent = `$${data.spendCap.stablecoinCapUsd || "Unlimited"} USD / Daily: ${data.spendCap.dailyNativeCapWei || "0"} wei`;
  } else {
    khSpendCap.textContent = "Set KEEPERHUB_API_KEY to inspect spend cap";
  }

  // 3. BulwarkStore
  if (data.store) {
    document.getElementById("diagGrantsCount").textContent = data.store.grantsCount;
    document.getElementById("diagExecsCount").textContent = data.store.executionsCount;
    document.getElementById("diagAuditCount").textContent = data.store.auditCount;
  }

  // 4. Web3 Wallet Session
  updateWalletDiagnostics();
}

function updateWalletDiagnostics() {
  const badge = document.getElementById("walletDiagBadge");
  const nameEl = document.getElementById("diagWalletName");
  const addrEl = document.getElementById("diagWalletAddr");
  const chainEl = document.getElementById("diagWalletChain");

  if (!badge) return;

  if (connectedWallet && connectedWallet.address) {
    badge.className = "chip chip-dual";
    badge.textContent = "ACTIVE SESSION";
    const meta = WALLET_METADATA[connectedWallet.type] || WALLET_METADATA.injected;
    nameEl.textContent = meta.name;
    addrEl.textContent = connectedWallet.address;

    const isBase = connectedWallet.chainId === 84532;
    const isEth = connectedWallet.chainId === 11155111;
    if (isBase) {
      chainEl.innerHTML = `<span style="color: var(--accent-emerald);">Base Sepolia 84532 (Active Network)</span>`;
    } else if (isEth) {
      chainEl.innerHTML = `<span style="color: var(--accent-emerald);">Sepolia 11155111 (Supported Network)</span>`;
    } else {
      chainEl.innerHTML = `<span style="color: var(--accent-rose);">Chain ${connectedWallet.chainId} (Mismatch)</span>`;
    }
  } else {
    badge.className = "chip chip-unavailable";
    badge.textContent = "DISCONNECTED";
    nameEl.textContent = "None";
    addrEl.textContent = "Not connected";
    chainEl.textContent = "--";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadDoctorData();

  const doctorBtn = document.getElementById("runDoctorBtn");
  if (doctorBtn) {
    doctorBtn.addEventListener("click", loadDoctorData);
  }

  window.addEventListener("walletAccountChanged", updateWalletDiagnostics);
  window.addEventListener("walletChainChanged", updateWalletDiagnostics);
  setTimeout(updateWalletDiagnostics, 500);
});
