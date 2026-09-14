/**
 * Bulwark Dashboard Frontend Client
 */

async function fetchState() {
  try {
    const res = await fetch("/api/state");
    if (!res.ok) return;
    const data = await res.json();
    renderState(data);
  } catch (err) {
    console.error("Failed to fetch desk state:", err);
  }
}

function renderState(data) {
  // 1. Header Chips
  const keyChip = document.getElementById("keyChip");
  if (data.hasKey) {
    keyChip.className = "chip chip-keeperhub";
    keyChip.textContent = "[KEEPERHUB FACT] KEY ACTIVE";
  } else {
    keyChip.className = "chip chip-unavailable";
    keyChip.textContent = "[UNAVAILABLE] KEY NOT SET";
  }

  // 2. Desk KPIs
  if (data.capacity) {
    document.getElementById("deskBalanceVal").textContent = `$${(data.capacity.deskBalanceUsd || 0).toFixed(2)}`;
    document.getElementById("availableCapVal").textContent = `$${(data.capacity.availableUsd || 0).toFixed(2)}`;
    document.getElementById("reservedCapVal").textContent = `$${(data.capacity.reservedUsd || 0).toFixed(2)}`;
  }
  if (data.reputation) {
    document.getElementById("verifiedRescuesVal").textContent = data.reputation.totalExecutionsVerified || 0;
    document.getElementById("capitalDeployedVal").textContent = `$${(data.reputation.totalCapitalDeployedUsd || 0).toFixed(2)}`;
  }

  // 3. Panel 1: Monitored Positions
  const posContainer = document.getElementById("positionsList");
  if (!data.watchlist || data.watchlist.length === 0) {
    posContainer.innerHTML = `<div class="card"><span class="card-key">No positions on watchlist.</span></div>`;
  } else {
    posContainer.innerHTML = data.watchlist.map((p) => {
      const hfClass = p.healthFactor < 1.2 ? "hf-critical" : p.healthFactor < 1.5 ? "hf-caution" : "hf-healthy";
      return `
        <div class="card">
          <div class="card-row">
            <span class="card-key">Borrower:</span>
            <span class="card-val">${p.userAddress.slice(0, 8)}...${p.userAddress.slice(-6)}</span>
          </div>
          <div class="card-row">
            <span class="card-key">Health Factor:</span>
            <span class="hf-badge ${hfClass}">${p.healthFactor.toFixed(3)}</span>
          </div>
          <div class="card-row">
            <span class="card-key">Collateral Base:</span>
            <span class="card-val">$${p.totalCollateralUsd.toFixed(2)}</span>
          </div>
          <div class="card-row">
            <span class="card-key">Debt Base:</span>
            <span class="card-val">$${p.totalDebtUsd.toFixed(2)}</span>
          </div>
          <div class="card-row">
            <span class="card-key">Liquidation Threshold:</span>
            <span class="card-val">${(p.currentLiquidationThresholdBps / 100).toFixed(1)}%</span>
          </div>
          <div class="card-row">
            <span class="card-key">Source:</span>
            <span class="chip chip-chain">[CHAIN READ]</span>
          </div>
        </div>
      `;
    }).join("");
  }

  // 4. Panel 2: RescueGrants
  const grantsContainer = document.getElementById("grantsList");
  if (!data.grants || data.grants.length === 0) {
    grantsContainer.innerHTML = `<div class="card"><span class="card-key">No active grants in store.</span></div>`;
  } else {
    grantsContainer.innerHTML = data.grants.map((g) => {
      const statusClass = `status-${g.state.status.toLowerCase()}`;
      const isProposed = g.state.status === "proposed";
      const isArmed = g.state.status === "armed";
      return `
        <div class="card">
          <div class="card-row">
            <span class="card-key">Grant ID:</span>
            <span class="card-val">${g.grantId}</span>
          </div>
          <div class="card-row">
            <span class="card-key">Status:</span>
            <span class="status-badge ${statusClass}">${g.state.status}</span>
          </div>
          <div class="card-row">
            <span class="card-key">Capital Cap:</span>
            <span class="card-val">$${g.authority.capitalCapUsd} (Per-Action: $${g.authority.perActionCapUsd})</span>
          </div>
          <div class="card-row">
            <span class="card-key">Grant Hash:</span>
            <span class="card-val">${g.grantHash.slice(0, 12)}...</span>
          </div>
          <div class="card-row" style="margin-top: 6px; gap: 6px; justify-content: flex-end;">
            ${isProposed ? `<button onclick="approveGrant('${g.grantId}')" class="btn-sm btn-approve">Approve</button>` : ""}
            ${isArmed ? `<button onclick="dryRunGrant('${g.grantId}')" class="btn-sm btn-dry">Dry Run</button>` : ""}
            ${isArmed ? `<button onclick="executeGrant('${g.grantId}')" class="btn-sm btn-execute">Execute</button>` : ""}
            ${!["revoked", "invalidated", "settled"].includes(g.state.status) ? `<button onclick="revokeGrant('${g.grantId}')" class="btn-sm btn-revoke">Revoke</button>` : ""}
          </div>
        </div>
      `;
    }).join("");
  }

  // 5. Panel 3: Executions
  const execsContainer = document.getElementById("executionsList");
  if (!data.executions || data.executions.length === 0) {
    execsContainer.innerHTML = `<div class="card"><span class="card-key">${data.hasKey ? "No executions recorded." : "[UNAVAILABLE] Key required for executions."}</span></div>`;
  } else {
    execsContainer.innerHTML = data.executions.map((e) => {
      const explorerLink = e.txHash ? `https://sepolia.etherscan.io/tx/${e.txHash}` : null;
      return `
        <div class="card">
          <div class="card-row">
            <span class="card-key">Exec ID:</span>
            <span class="card-val">${e.executionId}</span>
          </div>
          <div class="card-row">
            <span class="card-key">Status:</span>
            <span class="status-badge status-${e.status}">${e.status}</span>
          </div>
          <div class="card-row">
            <span class="card-key">Amount:</span>
            <span class="card-val">$${e.amountUsd.toFixed(2)} (${e.action})</span>
          </div>
          <div class="card-row">
            <span class="card-key">Receipts:</span>
            <span class="card-val">${e.receiptVerified ? "Dual Verified" : "Pending / Unavailable"}</span>
          </div>
          ${explorerLink ? `
          <div class="card-row">
            <span class="card-key">Transaction:</span>
            <a href="${explorerLink}" target="_blank" rel="noopener" class="card-val" style="color: var(--accent-cyan); text-decoration: underline;">
              ${e.txHash.slice(0, 10)}...${e.txHash.slice(-6)} &nearr;
            </a>
          </div>` : ""}
          <div class="card-row">
            <span class="card-key">HF Delta:</span>
            <span class="card-val">${e.preHealthFactor ? e.preHealthFactor.toFixed(3) : "N/A"} &rarr; ${e.postHealthFactor ? e.postHealthFactor.toFixed(3) : "N/A"}</span>
          </div>
        </div>
      `;
    }).join("");
  }

  // 6. Panel 4: Audit Trail
  const auditContainer = document.getElementById("auditList");
  if (!data.audit || data.audit.length === 0) {
    auditContainer.innerHTML = `<div class="card"><span class="card-key">No audit records yet.</span></div>`;
  } else {
    auditContainer.innerHTML = data.audit.slice(-25).reverse().map((a) => {
      return `
        <div class="audit-entry">
          <div class="audit-meta">
            <span>${a.type}</span>
            <span class="chip chip-compiler">${a.provenance || "FACT"}</span>
          </div>
          <div style="color: var(--text-secondary);">${new Date(a.timestamp).toLocaleTimeString()} &middot; ${a.grantId || a.id}</div>
        </div>
      `;
    }).join("");
  }
}

async function approveGrant(id) {
  try {
    const res = await fetch(`/api/grants/${encodeURIComponent(id)}/approve`, { method: "POST" });
    if (res.ok) fetchState();
  } catch (err) {
    alert("Error approving grant: " + err.message);
  }
}

async function revokeGrant(id) {
  try {
    const res = await fetch(`/api/grants/${encodeURIComponent(id)}/revoke`, { method: "POST" });
    if (res.ok) fetchState();
  } catch (err) {
    alert("Error revoking grant: " + err.message);
  }
}

async function dryRunGrant(id) {
  try {
    const res = await fetch(`/api/grants/${encodeURIComponent(id)}/dry`, { method: "POST" });
    const json = await res.json();
    alert("Simulation Result:\n" + JSON.stringify(json, null, 2));
    fetchState();
  } catch (err) {
    alert("Error running simulation: " + err.message);
  }
}

async function executeGrant(id) {
  try {
    const res = await fetch(`/api/grants/${encodeURIComponent(id)}/execute`, { method: "POST" });
    const json = await res.json();
    alert("Execution submitted:\n" + JSON.stringify(json.execution, null, 2));
    fetchState();
  } catch (err) {
    alert("Error executing grant: " + err.message);
  }
}

document.getElementById("tickBtn").addEventListener("click", async () => {
  try {
    const res = await fetch("/api/tick", { method: "POST" });
    const json = await res.json();
    fetchState();
  } catch (err) {
    console.error("Tick failed:", err);
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// WEB3 WALLET CONNECTION MANAGER (MetaMask, OKX, Coinbase, Rabby, Injected)
// ══════════════════════════════════════════════════════════════════════════════

let connectedWallet = {
  type: null,
  address: null,
  chainId: null,
  provider: null,
};

const WALLET_METADATA = {
  metamask: {
    name: "MetaMask",
    avatar: "🦊",
    downloadUrl: "https://metamask.io/download/",
  },
  okx: {
    name: "OKX Wallet",
    avatar: "🟩",
    downloadUrl: "https://www.okx.com/web3",
  },
  coinbase: {
    name: "Coinbase Wallet",
    avatar: "🔵",
    downloadUrl: "https://www.coinbase.com/wallet",
  },
  rabby: {
    name: "Rabby Wallet",
    avatar: "🐰",
    downloadUrl: "https://rabby.io/",
  },
  injected: {
    name: "Browser Wallet",
    avatar: "👛",
    downloadUrl: "",
  },
};

/**
 * Resolve the specific EIP-1193 provider for a given wallet type.
 */
function getWalletProvider(type) {
  if (typeof window === "undefined") return null;

  switch (type) {
    case "metamask": {
      if (window.ethereum?.providers && Array.isArray(window.ethereum.providers)) {
        return window.ethereum.providers.find((p) => p.isMetaMask && !p.isOkxWallet && !p.isRabby) || null;
      }
      return window.ethereum?.isMetaMask && !window.ethereum?.isOkxWallet && !window.ethereum?.isRabby ? window.ethereum : null;
    }
    case "okx": {
      return (
        window.okxwallet?.ethereum ||
        window.okxwallet ||
        (window.ethereum?.isOkxWallet ? window.ethereum : null)
      );
    }
    case "coinbase": {
      return (
        window.coinbaseWalletExtension ||
        (window.ethereum?.isCoinbaseWallet ? window.ethereum : null)
      );
    }
    case "rabby": {
      return window.rabby || (window.ethereum?.isRabby ? window.ethereum : null);
    }
    case "injected": {
      return window.ethereum || null;
    }
    default:
      return window.ethereum || null;
  }
}

/**
 * Inspects window and marks installed wallet options as "Detected".
 */
function detectInstalledWallets() {
  const wallets = ["metamask", "okx", "coinbase", "rabby", "injected"];
  wallets.forEach((w) => {
    const badge = document.getElementById(`badge-${w}`);
    if (!badge) return;
    const provider = getWalletProvider(w);
    if (provider) {
      badge.textContent = "Detected";
      badge.className = "wallet-badge detected";
    } else {
      badge.textContent = "Available";
      badge.className = "wallet-badge";
    }
  });
}

/**
 * Connect to the specified wallet.
 */
async function connectWallet(type) {
  const provider = getWalletProvider(type);
  const meta = WALLET_METADATA[type] || WALLET_METADATA.injected;

  if (!provider) {
    showWalletError(`No active extension found for ${meta.name}. Click to install or use Browser Injected.`);
    if (meta.downloadUrl) {
      window.open(meta.downloadUrl, "_blank");
    }
    return;
  }

  showWalletError(null);

  try {
    const accounts = await provider.request({ method: "eth_requestAccounts" });
    if (!accounts || accounts.length === 0) {
      throw new Error("No account was selected or unlocked in wallet.");
    }

    const address = accounts[0];
    const chainIdHex = await provider.request({ method: "eth_chainId" });
    const chainId = parseInt(chainIdHex, 16);

    connectedWallet = {
      type,
      address,
      chainId,
      provider,
    };

    localStorage.setItem("bulwark_wallet_type", type);
    listenToProviderEvents(provider);
    updateWalletUI();
  } catch (err) {
    console.error("Wallet connection failed:", err);
    showWalletError(err.message || "Failed to connect to wallet.");
  }
}

/**
 * Switch connected wallet to Ethereum Sepolia (11155111 / 0xaa36a7).
 */
async function switchToSepolia() {
  if (!connectedWallet.provider) return;
  try {
    await connectedWallet.provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0xaa36a7" }],
    });
  } catch (switchError) {
    // 4902 means chain has not been added yet
    if (switchError.code === 4902) {
      try {
        await connectedWallet.provider.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: "0xaa36a7",
              chainName: "Ethereum Sepolia",
              nativeCurrency: { name: "Sepolia ETH", symbol: "ETH", decimals: 18 },
              rpcUrls: ["https://ethereum-sepolia-rpc.publicnode.com"],
              blockExplorerUrls: ["https://sepolia.etherscan.io"],
            },
          ],
        });
      } catch (addError) {
        showWalletError("Failed to add Sepolia testnet to wallet.");
      }
    } else {
      showWalletError(switchError.message || "Failed to switch network.");
    }
  }
}

/**
 * Disconnect current wallet.
 */
function disconnectWallet() {
  connectedWallet = {
    type: null,
    address: null,
    chainId: null,
    provider: null,
  };
  localStorage.removeItem("bulwark_wallet_type");
  updateWalletUI();
}

/**
 * Update UI headers, buttons, and modal elements to reflect connection status.
 */
function updateWalletUI() {
  const btn = document.getElementById("connectWalletBtn");
  const label = document.getElementById("walletBtnLabel");
  const icon = document.getElementById("walletBtnIcon");

  const connectedSection = document.getElementById("walletConnectedSection");
  const listSection = document.getElementById("walletListSection");
  const avatarEl = document.getElementById("walletAvatar");
  const nameEl = document.getElementById("connectedWalletName");
  const chainTagEl = document.getElementById("connectedChainTag");
  const addressEl = document.getElementById("connectedAddressFull");
  const switchBtn = document.getElementById("switchNetworkBtn");

  if (connectedWallet.address) {
    const meta = WALLET_METADATA[connectedWallet.type] || WALLET_METADATA.injected;
    const shortAddr = `${connectedWallet.address.slice(0, 6)}...${connectedWallet.address.slice(-4)}`;

    // Header Button
    btn.className = "btn-wallet connected";
    label.textContent = shortAddr;
    icon.textContent = meta.avatar;

    // Modal Connected Section
    connectedSection.style.display = "flex";
    avatarEl.textContent = meta.avatar;
    nameEl.textContent = meta.name;
    addressEl.textContent = connectedWallet.address;

    const isSepolia = connectedWallet.chainId === 11155111;
    if (isSepolia) {
      chainTagEl.className = "chip chip-chain";
      chainTagEl.textContent = "Sepolia 11155111";
      switchBtn.style.display = "none";
    } else {
      chainTagEl.className = "chip chip-unavailable";
      chainTagEl.textContent = `Chain ${connectedWallet.chainId || "Unknown"} (Wrong Network)`;
      switchBtn.style.display = "block";
    }

    // Active state on options
    document.querySelectorAll(".wallet-option").forEach((opt) => {
      if (opt.getAttribute("data-wallet") === connectedWallet.type) {
        opt.classList.add("active");
        const b = opt.querySelector(".wallet-badge");
        if (b) {
          b.textContent = "Connected";
          b.className = "wallet-badge active";
        }
      } else {
        opt.classList.remove("active");
      }
    });
  } else {
    // Header Button
    btn.className = "btn-wallet";
    label.textContent = "Connect Wallet";
    icon.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="4"></rect><path d="M16 12h.01"></path><path d="M2 10h20"></path></svg>`;

    // Modal Connected Section
    connectedSection.style.display = "none";
    document.querySelectorAll(".wallet-option").forEach((opt) => {
      opt.classList.remove("active");
    });
    detectInstalledWallets();
  }
}

function showWalletError(msg) {
  const errEl = document.getElementById("walletErrorMsg");
  if (!errEl) return;
  if (msg) {
    errEl.textContent = msg;
    errEl.style.display = "block";
  } else {
    errEl.textContent = "";
    errEl.style.display = "none";
  }
}

function listenToProviderEvents(provider) {
  if (!provider || !provider.on) return;

  provider.on("accountsChanged", (accounts) => {
    if (!accounts || accounts.length === 0) {
      disconnectWallet();
    } else {
      connectedWallet.address = accounts[0];
      updateWalletUI();
    }
  });

  provider.on("chainChanged", (chainIdHex) => {
    connectedWallet.chainId = parseInt(chainIdHex, 16);
    updateWalletUI();
  });
}

/**
 * Auto-reconnect if a wallet was previously connected.
 */
async function autoReconnectWallet() {
  const savedType = localStorage.getItem("bulwark_wallet_type");
  if (!savedType) return;

  const provider = getWalletProvider(savedType);
  if (!provider) return;

  try {
    const accounts = await provider.request({ method: "eth_accounts" });
    if (accounts && accounts.length > 0) {
      const chainIdHex = await provider.request({ method: "eth_chainId" });
      connectedWallet = {
        type: savedType,
        address: accounts[0],
        chainId: parseInt(chainIdHex, 16),
        provider,
      };
      listenToProviderEvents(provider);
      updateWalletUI();
    }
  } catch (err) {
    console.warn("Silent auto-reconnect failed:", err);
  }
}

// ── Modal Event Listeners ──────────────────────────────────────────────────
const modalBackdrop = document.getElementById("walletModal");
const connectBtn = document.getElementById("connectWalletBtn");
const closeBtn = document.getElementById("closeWalletModal");
const disconnectBtn = document.getElementById("disconnectWalletBtn");
const switchBtn = document.getElementById("switchNetworkBtn");
const scanMyPosBtn = document.getElementById("scanConnectedPosBtn");

connectBtn.addEventListener("click", () => {
  detectInstalledWallets();
  showWalletError(null);
  modalBackdrop.style.display = "flex";
});

closeBtn.addEventListener("click", () => {
  modalBackdrop.style.display = "none";
});

modalBackdrop.addEventListener("click", (e) => {
  if (e.target === modalBackdrop) {
    modalBackdrop.style.display = "none";
  }
});

disconnectBtn.addEventListener("click", () => {
  disconnectWallet();
});

switchBtn.addEventListener("click", () => {
  switchToSepolia();
});

scanMyPosBtn.addEventListener("click", () => {
  if (connectedWallet.address) {
    modalBackdrop.style.display = "none";
    // Trigger tick for user's address
    fetch("/api/tick", { method: "POST" })
      .then(() => fetchState())
      .catch(console.error);
  }
});

// Option Click Handlers
document.querySelectorAll(".wallet-option").forEach((opt) => {
  opt.addEventListener("click", () => {
    const walletType = opt.getAttribute("data-wallet");
    connectWallet(walletType);
  });
});

// ── App Initialization ─────────────────────────────────────────────────────
fetchState();
setInterval(fetchState, 3000);
detectInstalledWallets();
autoReconnectWallet();

