/**
 * BULWARK Multi-Page Shared Utilities & Web3 Client
 * Manages global header, navigation state, desk KPIs, toasts, and Web3 wallet connections.
 */

// ── Web3 Wallet State & Metadata ──────────────────────────────────────────
const WALLET_METADATA = {
  metamask: {
    name: "MetaMask",
    avatar: "MM",
    downloadUrl: "https://metamask.io/download/",
    check: () => {
      if (typeof window === "undefined" || !window.ethereum) return false;
      if (window.ethereum.providers) {
        return window.ethereum.providers.some((p) => p.isMetaMask);
      }
      return !!window.ethereum.isMetaMask;
    },
    getProvider: () => {
      if (typeof window === "undefined" || !window.ethereum) return null;
      if (window.ethereum.providers) {
        return window.ethereum.providers.find((p) => p.isMetaMask) || null;
      }
      return window.ethereum.isMetaMask ? window.ethereum : null;
    },
  },
  okx: {
    name: "OKX Wallet",
    avatar: "OKX",
    downloadUrl: "https://www.okx.com/web3",
    check: () => typeof window !== "undefined" && !!(window.okxwallet || window.ethereum?.isOKExWallet),
    getProvider: () => {
      if (typeof window === "undefined") return null;
      if (window.okxwallet) return window.okxwallet;
      if (window.ethereum?.providers) {
        return window.ethereum.providers.find((p) => p.isOKExWallet) || null;
      }
      return window.ethereum?.isOKExWallet ? window.ethereum : null;
    },
  },
  coinbase: {
    name: "Coinbase Wallet",
    avatar: "CB",
    downloadUrl: "https://www.coinbase.com/wallet",
    check: () => typeof window !== "undefined" && !!(window.coinbaseWalletExtension || window.ethereum?.isCoinbaseWallet),
    getProvider: () => {
      if (typeof window === "undefined") return null;
      if (window.coinbaseWalletExtension) return window.coinbaseWalletExtension;
      if (window.ethereum?.providers) {
        return window.ethereum.providers.find((p) => p.isCoinbaseWallet) || null;
      }
      return window.ethereum?.isCoinbaseWallet ? window.ethereum : null;
    },
  },
  rabby: {
    name: "Rabby Wallet",
    avatar: "RB",
    downloadUrl: "https://rabby.io/",
    check: () => typeof window !== "undefined" && !!(window.rabby || window.ethereum?.isRabby),
    getProvider: () => {
      if (typeof window === "undefined") return null;
      if (window.rabby) return window.rabby;
      if (window.ethereum?.providers) {
        return window.ethereum.providers.find((p) => p.isRabby) || null;
      }
      return window.ethereum?.isRabby ? window.ethereum : null;
    },
  },
  injected: {
    name: "Browser Injected",
    avatar: "W3",
    check: () => typeof window !== "undefined" && !!window.ethereum,
    getProvider: () => (typeof window !== "undefined" ? window.ethereum || null : null),
  },
};

let connectedWallet = {
  type: null,
  address: null,
  chainId: null,
  provider: null,
};

function getWalletProvider(type) {
  const meta = WALLET_METADATA[type];
  if (!meta) return null;
  return meta.getProvider ? meta.getProvider() : null;
}

function detectInstalledWallets() {
  for (const [key, meta] of Object.entries(WALLET_METADATA)) {
    const badge = document.getElementById(`badge-${key}`);
    if (!badge) continue;

    if (meta.check && meta.check()) {
      badge.textContent = "Detected";
      badge.className = "wallet-badge detected";
    } else {
      badge.textContent = key === "injected" ? "Available" : "Not Installed";
      badge.className = "wallet-badge";
    }
  }
}

async function connectWallet(type) {
  showWalletError(null);
  const meta = WALLET_METADATA[type];
  if (!meta) return;

  const provider = getWalletProvider(type);
  if (!provider) {
    if (meta.downloadUrl) {
      showWalletError(`${meta.name} not detected. Click here to install: <a href="${meta.downloadUrl}" target="_blank" rel="noopener" style="color:var(--accent-cyan);">${meta.downloadUrl}</a>`);
    } else {
      showWalletError("No EIP-1193 Web3 provider found in browser.");
    }
    return;
  }

  try {
    const accounts = await provider.request({ method: "eth_requestAccounts" });
    if (!accounts || accounts.length === 0) {
      showWalletError("No Ethereum account authorized.");
      return;
    }

    const chainIdHex = await provider.request({ method: "eth_chainId" });
    const chainId = parseInt(chainIdHex, 16);

    connectedWallet = {
      type,
      address: accounts[0],
      chainId,
      provider,
    };

    localStorage.setItem("bulwark_wallet_type", type);
    listenToProviderEvents(provider);
    updateWalletUI();
    showToast(`Connected ${meta.name} (${accounts[0].slice(0, 6)}...${accounts[0].slice(-4)})`, "success");
  } catch (err) {
    console.error("Wallet connection failed:", err);
    showWalletError(err.message || "Failed to connect to wallet.");
  }
}

async function switchToSepolia() {
  if (!connectedWallet.provider) return;
  try {
    await connectedWallet.provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0xaa36a7" }],
    });
  } catch (switchError) {
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

function disconnectWallet() {
  connectedWallet = {
    type: null,
    address: null,
    chainId: null,
    provider: null,
  };
  localStorage.removeItem("bulwark_wallet_type");
  updateWalletUI();
  showToast("Wallet disconnected", "info");
}

function updateWalletUI() {
  const btn = document.getElementById("connectWalletBtn");
  const label = document.getElementById("walletBtnLabel");
  const icon = document.getElementById("walletBtnIcon");

  const connectedSection = document.getElementById("walletConnectedSection");
  const avatarEl = document.getElementById("walletAvatar");
  const nameEl = document.getElementById("connectedWalletName");
  const chainTagEl = document.getElementById("connectedChainTag");
  const addressEl = document.getElementById("connectedAddressFull");
  const switchBtn = document.getElementById("switchNetworkBtn");

  if (!btn) return;

  if (connectedWallet.address) {
    const meta = WALLET_METADATA[connectedWallet.type] || WALLET_METADATA.injected;
    const shortAddr = `${connectedWallet.address.slice(0, 6)}...${connectedWallet.address.slice(-4)}`;

    btn.className = "btn-wallet connected";
    if (label) label.textContent = shortAddr;
    if (icon) icon.textContent = meta.avatar;

    if (connectedSection) {
      connectedSection.style.display = "flex";
      if (avatarEl) avatarEl.textContent = meta.avatar;
      if (nameEl) nameEl.textContent = meta.name;
      if (addressEl) addressEl.textContent = connectedWallet.address;

      const isSepolia = connectedWallet.chainId === 11155111;
      if (chainTagEl) {
        if (isSepolia) {
          chainTagEl.className = "chip chip-chain";
          chainTagEl.textContent = "Sepolia 11155111";
        } else {
          chainTagEl.className = "chip chip-unavailable";
          chainTagEl.textContent = `Chain ${connectedWallet.chainId || "Unknown"} (Wrong Network)`;
        }
      }
      if (switchBtn) switchBtn.style.display = isSepolia ? "none" : "block";
    }

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
    btn.className = "btn-wallet";
    if (label) label.textContent = "Connect Wallet";
    if (icon) {
      icon.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="4"></rect><path d="M16 12h.01"></path><path d="M2 10h20"></path></svg>`;
    }

    if (connectedSection) connectedSection.style.display = "none";
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
    errEl.innerHTML = msg;
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
      // Notify page listeners
      window.dispatchEvent(new CustomEvent("walletAccountChanged", { detail: { address: accounts[0] } }));
    }
  });

  provider.on("chainChanged", (chainIdHex) => {
    connectedWallet.chainId = parseInt(chainIdHex, 16);
    updateWalletUI();
    window.dispatchEvent(new CustomEvent("walletChainChanged", { detail: { chainId: connectedWallet.chainId } }));
  });
}

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

// ── Global Toast Notifications ─────────────────────────────────────────────
function showToast(message, type = "info") {
  let container = document.getElementById("toastContainer");
  if (!container) {
    container = document.createElement("div");
    container.id = "toastContainer";
    container.className = "toast-container";
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.className = `toast ${type === "error" ? "toast-error" : type === "success" ? "toast-success" : ""}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transition = "opacity 0.3s ease-out";
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ── Desk State & KPIs Helper ────────────────────────────────────────────────
async function fetchDeskState() {
  try {
    const res = await fetch("/api/state");
    if (!res.ok) return null;
    const data = await res.json();
    renderDeskKpis(data);
    return data;
  } catch (err) {
    console.error("Failed to fetch desk state:", err);
    return null;
  }
}

function renderDeskKpis(data) {
  if (!data) return;

  // Header Chips
  const keyChip = document.getElementById("keyChip");
  if (keyChip) {
    if (data.hasKey) {
      keyChip.className = "chip chip-keeperhub";
      keyChip.textContent = "KEY ACTIVE";
    } else {
      keyChip.className = "chip chip-unavailable";
      keyChip.textContent = "KEY NOT SET";
    }
  }

  // Desk KPI Top Bar
  if (data.capacity) {
    const balanceEl = document.getElementById("deskBalanceVal");
    const availEl = document.getElementById("availableCapVal");
    const resEl = document.getElementById("reservedCapVal");
    if (balanceEl) balanceEl.textContent = `$${(data.capacity.deskBalanceUsd || 0).toFixed(2)}`;
    if (availEl) availEl.textContent = `$${(data.capacity.availableUsd || 0).toFixed(2)}`;
    if (resEl) resEl.textContent = `$${(data.capacity.reservedUsd || 0).toFixed(2)}`;
  }
  if (data.reputation) {
    const rescuesEl = document.getElementById("verifiedRescuesVal");
    const capDepEl = document.getElementById("capitalDeployedVal");
    if (rescuesEl) rescuesEl.textContent = data.reputation.totalExecutionsVerified || 0;
    if (capDepEl) capDepEl.textContent = `$${(data.reputation.totalCapitalDeployedUsd || 0).toFixed(2)}`;
  }
}

// ── Active Navigation Highlighter ──────────────────────────────────────────
function highlightActiveNav() {
  const path = window.location.pathname;
  document.querySelectorAll(".nav-tab").forEach((tab) => {
    const href = tab.getAttribute("href");
    if (href === path || (href === "/" && (path === "" || path === "/index.html" || path === "/dashboard"))) {
      tab.classList.add("active");
    } else if (href !== "/" && path.startsWith(href)) {
      tab.classList.add("active");
    } else {
      tab.classList.remove("active");
    }
  });
}

// ── Global Tick Action ──────────────────────────────────────────────────────
async function triggerTick() {
  const btn = document.getElementById("tickBtn");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Scanning...";
  }
  try {
    const res = await fetch("/api/tick", { method: "POST" });
    const data = await res.json();
    showToast(`Scan complete: ${data.scanned} positions scanned, ${data.underwritten} underwritten.`, "success");
    await fetchDeskState();
  } catch (err) {
    console.error("Tick failed:", err);
    showToast("Guardian scan tick failed.", "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Trigger Tick";
    }
  }
}

// ── Inject Liquid Background Blobs ─────────────────────────────────────────
function injectLiquidCanvas() {
  if (document.querySelector(".liquid-canvas")) return;
  const canvas = document.createElement("div");
  canvas.className = "liquid-canvas";
  canvas.innerHTML = `
    <div class="blob blob-1"></div>
    <div class="blob blob-2"></div>
    <div class="blob blob-3"></div>
  `;
  document.body.prepend(canvas);
}

// ── Setup Shared Handlers on Page Load ──────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  injectLiquidCanvas();
  highlightActiveNav();

  // Tick Button
  const tickBtn = document.getElementById("tickBtn");
  if (tickBtn) {
    tickBtn.addEventListener("click", triggerTick);
  }

  // Wallet Modal Handlers
  const modalBackdrop = document.getElementById("walletModal");
  const connectBtn = document.getElementById("connectWalletBtn");
  const closeBtn = document.getElementById("closeWalletModal");
  const disconnectBtn = document.getElementById("disconnectWalletBtn");
  const switchBtn = document.getElementById("switchNetworkBtn");
  const scanMyPosBtn = document.getElementById("scanConnectedPosBtn");

  if (connectBtn && modalBackdrop) {
    connectBtn.addEventListener("click", () => {
      detectInstalledWallets();
      showWalletError(null);
      modalBackdrop.style.display = "flex";
    });
  }

  if (closeBtn && modalBackdrop) {
    closeBtn.addEventListener("click", () => {
      modalBackdrop.style.display = "none";
    });
  }

  if (modalBackdrop) {
    modalBackdrop.addEventListener("click", (e) => {
      if (e.target === modalBackdrop) {
        modalBackdrop.style.display = "none";
      }
    });
  }

  if (disconnectBtn) {
    disconnectBtn.addEventListener("click", disconnectWallet);
  }

  if (switchBtn) {
    switchBtn.addEventListener("click", switchToSepolia);
  }

  if (scanMyPosBtn && modalBackdrop) {
    scanMyPosBtn.addEventListener("click", () => {
      if (connectedWallet.address) {
        modalBackdrop.style.display = "none";
        // If on /positions, trigger local scan, else navigate
        if (window.location.pathname.startsWith("/positions")) {
          const scanInput = document.getElementById("scanAddressInput");
          if (scanInput) {
            scanInput.value = connectedWallet.address;
            const runScanBtn = document.getElementById("runScanBtn");
            if (runScanBtn) runScanBtn.click();
          }
        } else {
          window.location.href = `/positions?scan=${connectedWallet.address}`;
        }
      }
    });
  }

  document.querySelectorAll(".wallet-option").forEach((opt) => {
    opt.addEventListener("click", () => {
      const walletType = opt.getAttribute("data-wallet");
      connectWallet(walletType);
    });
  });

  detectInstalledWallets();
  autoReconnectWallet();
  fetchDeskState();
});
