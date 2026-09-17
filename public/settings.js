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

  const isAuthed = !!(window.bulwarkAuth && window.bulwarkAuth.authenticated);
  const isKeyMode = isAuthed && window.bulwarkAuth.mode === "private_key";

  if (isKeyMode) {
    badge.className = "chip chip-keeperhub";
    badge.textContent = "24/7 GUARDIAN ACTIVE";
    if (nameEl) nameEl.textContent = "24/7 Autonomous Guardian Key";
    if (addrEl) addrEl.textContent = window.bulwarkAuth.address;
    if (chainEl) chainEl.innerHTML = `<span style="color: var(--accent-emerald);">Base Sepolia 84532 (Zero-Prompt Mode)</span>`;
  } else if (connectedWallet && connectedWallet.address) {
    badge.className = "chip chip-dual";
    badge.textContent = "ACTIVE SESSION";
    const meta = WALLET_METADATA[connectedWallet.type] || WALLET_METADATA.injected;
    if (nameEl) nameEl.textContent = meta.name;
    if (addrEl) addrEl.textContent = connectedWallet.address;

    const isBase = connectedWallet.chainId === 84532;
    const isEth = connectedWallet.chainId === 11155111;
    if (chainEl) {
      if (isBase) {
        chainEl.innerHTML = `<span style="color: var(--accent-emerald);">Base Sepolia 84532 (Active Network)</span>`;
      } else if (isEth) {
        chainEl.innerHTML = `<span style="color: var(--accent-emerald);">Sepolia 11155111 (Supported Network)</span>`;
      } else {
        chainEl.innerHTML = `<span style="color: var(--accent-rose);">Chain ${connectedWallet.chainId} (Mismatch)</span>`;
      }
    }
  } else {
    badge.className = "chip chip-unavailable";
    badge.textContent = "DISCONNECTED";
    if (nameEl) nameEl.textContent = "None";
    if (addrEl) addrEl.textContent = "Not connected";
    if (chainEl) chainEl.textContent = "--";
  }
}

function initOperatorKeySettings() {
  const input = document.getElementById("opKeyInput");
  const badge = document.getElementById("opKeyStatusBadge");
  const saveBtn = document.getElementById("saveOpKeyBtn");
  if (!input || !badge || !saveBtn) return;

  const current = localStorage.getItem("bulwark_operator_key") || "bulwark_sec_ops_2026_az";
  input.value = "";
  input.placeholder = current ? "•••••••••••••••• (Authorized Session Key)" : "Enter Operator Key";
  badge.textContent = current ? "AUTHENTICATED" : "UNAUTHENTICATED";
  badge.className = current ? "chip chip-policy" : "chip chip-unavailable";

  saveBtn.addEventListener("click", () => {
    const val = input.value.trim();
    if (val) {
      localStorage.setItem("bulwark_operator_key", val);
      input.value = "";
      input.placeholder = "•••••••••••••••• (Authorized Session Key)";
      badge.textContent = "AUTHENTICATED";
      badge.className = "chip chip-policy";
      showToast("Operator key saved", "success");
    } else {
      localStorage.removeItem("bulwark_operator_key");
      input.value = "";
      input.placeholder = "Enter Operator Key";
      badge.textContent = "UNAUTHENTICATED";
      badge.className = "chip chip-unavailable";
      showToast("Operator key cleared", "info");
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  loadDoctorData();
  initOperatorKeySettings();

  const doctorBtn = document.getElementById("runDoctorBtn");
  if (doctorBtn) {
    doctorBtn.addEventListener("click", loadDoctorData);
  }

  window.addEventListener("bulwarkAuthChanged", updateWalletDiagnostics);
  window.addEventListener("walletAccountChanged", updateWalletDiagnostics);
  window.addEventListener("walletChainChanged", updateWalletDiagnostics);
  setTimeout(updateWalletDiagnostics, 500);
});

