# DESIGN.md — BULWARK High-Conviction Design System

## 1. Benchmarks & Synthesized Principles
This design system is synthesized from three benchmark interfaces renowned for craft, density, and clarity:
1. **Linear.app:** Obsidian dark aesthetics, razor-sharp 1px borders, monospace metadata micro-labels, keyboard-first affordances, and zero decorative fluff.
2. **Uniswap & Aave V3 Terminal:** High-contrast financial typography, tabular numbers, clear risk heatmaps (Green $\to$ Amber $\to$ Crimson), and intuitive token & network badges.
3. **Vercel Console & Stripe Dashboard:** Immaculate typography hierarchy, clear visual states (empty, loading, hover, focus, disabled), and transparent cryptographic audit logs.

---

## 2. Core Design Decisions

### 2.1 What We Deliberately DO NOT Do (Anti-AI Tells)
* ❌ **NO Multi-Color Rainbow Pastels:** No purple-pink-violet-cyan mush gradients on every button. Gradients are strictly purposeful: subtle single-hue glows or financial data curves.
* ❌ **NO Arbitrary Border Radii:** No mixing 4px, 16px, 24px, and 9999px on the same screen. Radii are strictly constrained to 3 deterministic tokens: `4px` (chips/badges), `8px` (buttons/inputs), `12px` (cards/modals).
* ❌ **NO Full-Page Scroll Locks:** Removed `overflow: hidden` on `html, body`. Pages must scroll naturally on small laptop displays and mobile screens.
* ❌ **NO Low-Contrast Gray Text:** Secondary and muted text must maintain WCAG AAA compliance against dark surfaces.
* ❌ **NO Div Soup or Fake Placeholders:** Semantic `<header>`, `<nav>`, `<main>`, `<section>`, `<article>`, `<table>`.

---

## 3. The Visual System Tokens

### 3.1 Color Palette (Dark Obsidian Theme)
```css
:root {
  /* Canvas & Surfaces */
  --bg-canvas: #08090d;          /* True deep obsidian base */
  --bg-surface: #0f121a;         /* Card & panel background */
  --bg-surface-elevated: #161a26;/* Modals, tooltips, elevated cards */
  --bg-surface-hover: #1c2233;   /* Interactive hover state */

  /* Borders & Dividers */
  --border-subtle: #1e2436;      /* Default card boundary */
  --border-muted: #283046;       /* Secondary separation lines */
  --border-focus: #3b82f6;       /* Keyboard focus ring */
  --border-hover: #475569;       /* Hover highlight */

  /* High-Contrast Typography */
  --text-primary: #f8fafc;        /* 98% white for headings & values */
  --text-secondary: #cbd5e1;      /* 80% slate for readable body */
  --text-muted: #64748b;          /* 45% slate for labels & units */
  --text-inverse: #020617;        /* For high-contrast bright buttons */

  /* Financial Semantics */
  --brand-primary: #3b82f6;       /* Electric blue primary accent */
  --brand-primary-hover: #2563eb;
  --brand-glow: rgba(59, 130, 246, 0.25);

  --risk-safe: #10b981;           /* Green: HF >= 2.00 / Proven */
  --risk-safe-bg: rgba(16, 185, 129, 0.12);
  --risk-safe-border: rgba(16, 185, 129, 0.35);

  --risk-warning: #f59e0b;        /* Amber: 1.35 <= HF < 2.00 / Proposed */
  --risk-warning-bg: rgba(245, 158, 11, 0.12);
  --risk-warning-border: rgba(245, 158, 11, 0.35);

  --risk-critical: #ef4444;       /* Crimson: HF < 1.35 / In Danger */
  --risk-critical-bg: rgba(239, 68, 68, 0.15);
  --risk-critical-border: rgba(239, 68, 68, 0.45);

  --accent-cyan: #06b6d4;         /* Data & RPC telemetry */
  --accent-cyan-bg: rgba(6, 182, 212, 0.12);
}
```

### 3.2 Spacing Scale (Base Unit: 4px)
Strict geometric scale:
* `2px` (`0.5x`): Micro-padding / icon gaps
* `4px` (`1x`): Chip padding / tight tag margins
* `8px` (`2x`): Button padding vertical / gap between inputs
* `12px` (`3x`): Compact card padding / nav item gaps
* `16px` (`4x`): Standard card internal padding / gutter
* `20px` (`5x`): Section gaps / container padding
* `24px` (`6x`): Grid gap / major panel separation
* `32px` (`8x`): Header margins / hero spacing
* `48px` (`12x`): Section break padding

### 3.3 Typography Hierarchy & Tabular Numbers
* **UI & Headings:** `Inter`, system-ui, -apple-system, sans-serif
* **Numbers, Hashes, Code, Hex & Financial Data:** `'JetBrains Mono'`, monospace with `font-variant-numeric: tabular-nums` (guarantees digits align vertically in tables and tickers).
* **Font Weights:** Maximum 2 weights per context:
  * Regular (`400`) for explanations, timestamps, and secondary text.
  * SemiBold (`600`) for headings, primary numbers, and CTA labels.
* **Scale:**
  * `11px`: Micro-tags, provenance badges, timestamp metadata.
  * `12px`: Secondary table cells, chip text, form field labels.
  * `14px`: Standard body copy, button labels, list items.
  * `16px`: Card section headers, key input values.
  * `20px`: Major card headers, primary metric values.
  * `28px`: Hero titles, main health factor metric readout.
  * `36px`: Primary hero title on landing page.

---

## 4. Component Standards & Micro-Interactions

### 4.1 Status Chips & Live Indicators
* **Structure:** `padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;`
* **Pulsing Indicator Dot:** 6px circle with a subtle 1.5s expanding keyframe ping, indicating real-time node heartbeat.

### 4.2 Interactive Buttons
* **Default:** Solid background, 1px subtle top border highlight, `transition: all 120ms ease;`.
* **Hover:** Subtle brightness boost (`+8%`) and border sharpen.
* **Active:** Micro-press down (`transform: translateY(1px);`) for tactile click feedback.
* **Focus-Visible:** `outline: 2px solid var(--brand-primary); outline-offset: 2px;`.

### 4.3 Tables & Data Lists
* Full-width with subtle horizontal separators (`border-bottom: 1px solid var(--border-subtle)`).
* `font-variant-numeric: tabular-nums` on all currency, block number, and percentage cells.
* Monospace truncation on Ethereum addresses (`0x1234...5678`) with instant 1-click clipboard copy and tooltip feedback.

### 4.4 Financial Health Factor Meter
* Dynamic gradient bar visualizing risk zones:
  * Crimson `[0.00 – 1.00]`: Liquidation Zone
  * Amber `[1.00 – 1.35]`: Critical Danger / Automated Trigger
  * Blue `[1.35 – 2.00]`: Underwriting Recovery Band
  * Emerald Green `[2.00+]`: Bounded Safe Harbor

---

## 5. Mobile & Responsive Layout Invariants
* On viewport `< 768px`:
  * Navigation shifts into a scrollable horizontal pill track.
  * Multi-column command center grids stack into a single vertical stream.
  * Table rows gain horizontal scrolling or card view fallback with sticky headers.
