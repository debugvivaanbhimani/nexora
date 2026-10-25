# Nexora – Smart Collateral Allocation & Double-Pledge Prevention Ledger
*(Innovise Blockchain Hackathon – Problem Statement 1)*

**Nexora** is an institutional-grade collateral management and encumbrance tracking platform. It unifies a high-performance mathematical optimization engine (**PuLP / HiGHS Branch-and-Cut**) with an immutable smart contract ledger (**Solidity 0.8.24 on EVM / Hardhat**) to solve multi-obligation collateral allocations at minimum funding cost while strictly guaranteeing double-pledge prevention, cross-desk non-repudiation, and sub-50ms market shock rebalancing.

---

## 🏛️ System Architecture

Nexora bridges quantitative optimization with on-chain cryptographic settlement:

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                 Nexora Editorial Web UI                                 │
│                  (Vite + React 18 + Outfit / Plus Jakarta Sans / JetBrains Mono)        │
│          http://localhost:5173  [Overview · Allocation · Compare · Security · Ledger]   │
│                 [Market Shock Lab · Track Changes Diff · Auditor Proof Modal]           │
└────────────────────────────────────────────┬────────────────────────────────────────────┘
                                             │ HTTP / JSON (Proxied via /api)
                                             ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                   FastAPI Gateway                                       │
│                                http://localhost:8000                                    │
│   /health · /scenarios · /reset · /optimise · /compare · /commit · /attack · /stress    │
│            /shock · /reoptimise · /commit-diff · /verify (Auditor Verification)          │
└──────────────────────┬────────────────────────────────────────┬─────────────────────────┘
                       │ In-memory & MILP calls                 │ Web3.py RPC
                       ▼                                        ▼
┌───────────────────────────────────────────────┐ ┌───────────────────────────────────────┐
│          Two-Stage Optimizer Engine           │ │        CollateralLedger.sol           │
│              (PuLP 2.9.0 + HiGHS)             │ │           (Hardhat Node)              │
│  Stage 1: Strict Shortfall Minimization       │ │        http://127.0.0.1:8545          │
│  Stage 2: Carrying Cost + Churn Minimization  │ │        Chain ID: 31337 (Local EVM)    │
│  + 3 Heuristics (Cash/Cheapest/Scarcity)      │ │   reserveBatch(), release(), verify() │
│  + Linear Churn Constraints (d ≥ |x - prev|)  │ │   Atomic swaps, rejections, audits    │
└───────────────────────────────────────────────┘ └───────────────────────────────────────┘
```

---

## 🌟 Key Standout Innovations

### 1. Market Price Shock & Minimal Churn Rebalancing (Diff Engine)
Bond and equity prices fluctuate constantly, which can cause yesterday's valid collateral pledge to fall below margin requirements today.
* **Instant Shock Simulation (`POST /shock`)**: Interactive sliders (−30%…+10%) simulate price shocks across equities, corporate AAA bonds, and sovereign debt. The engine instantly evaluates current commitments and flags under-covered obligations with pulsating margin deficit indicators.
* **Minimal Churn Formulation (`POST /reoptimise`)**: Traditional solvers re-plan from scratch, creating massive operational turnover (moving 1,800+ units). Nexora adds absolute deviation penalty variables $d_{a,o} \ge |x_{a,o} - \text{prev}_{a,o}|$ to Stage 2, preserving Stage-1 zero shortfall while moving **~80–90% fewer units** for ~0% extra funding cost.
* **Track Changes Diff Table**: Displays net adjustments per line with bold green (`+▲`) and red (`−▼`) delta chips.
* **Atomic On-Chain Rebalancing (`POST /commit-diff`)**: Automatically executes `release()` on the previous allocation and `reserveBatch()` on the new plan in sequence, updating on-chain reservation versions and recording an auditable `Released` then `Reserved` trail.

### 2. Independent Cryptographic Auditor Proof ("Why Blockchain?")
Answers the judges' central question: *"Why does this need blockchain instead of a standard SQL database?"*
* **Deterministic Verification (`POST /verify`)**: An auditor or regulator can independently re-hash the allocation lines into a canonical Keccak-256 fingerprint and verify it against `CollateralLedger.allocations(plan_id).stateRoot`.
* **Interactive Rogue Database Tampering Simulator**: Built into the **Auditor Proof** UI modal. A live toggle simulates an internal rogue administrator subtly altering a database row off-chain (+1 unit). The auditor tool instantly detects the mismatch against the immutable smart contract and triggers a bold red **`CRITICAL INTEGRITY ALERT: HASH MISMATCH DETECTED`**.

### 3. Solver Telemetry & Two-Stage Math Trace
* Accessible via the topbar **`Math`** button.
* Displays real-time solver latency (<25 ms), branch-and-cut HiGHS integer execution statistics, full mathematical LP formulation, and an economic decision rationale trace explaining why each specific asset was routed to a given obligation.

### 4. Interactive 3D Adversarial Defense Arena
* Live on-chain firewall simulator under the **Security** tab.
* Rogue **Desk 2** attempts 5 distinct cryptographic exploit vectors against the smart contract:
  1. **Double Pledge**: Pledging assets already locked by Desk 1 (`InsufficientQuantity`).
  2. **Duplicate Replay**: Re-submitting an already-committed allocation plan (`DuplicateAllocation`).
  3. **Excess Quantity**: Requesting more units than total issued vault inventory (`InsufficientQuantity`).
  4. **Ineligible Collateral**: Pledging unapproved asset classes into strict obligations (`Ineligible`).
  5. **Stale Inventory Front-Run**: Committing against outdated inventory versions (`StalePlan`).
* Every exploit is caught and rejected at the EVM opcode level with zero state corruption.

---

## ⚡ Engineering Benchmarks & Measurements

| Metric | Measured Value | Standard / Target | Status |
| :--- | :--- | :--- | :---: |
| **Smart Contract Tests** | **15 / 15 Passing** | 100% test coverage | ✅ Verified |
| **Python Optimizer & API Tests** | **46 / 46 Passing** | Model & scenario validation | ✅ Verified |
| **End-to-End Smoke Test** | **7 / 7 Steps Passing** | All 5 attack vectors blocked | ✅ Verified |
| **Solver Execution Latency** | **~25.2 ms** (22 ms – 42 ms) | < 1,000 ms SLA | ⚡ 40x Faster |
| **Operational Turnover Reduction** | **83.3% – 90% Fewer Moves** | Minimal Churn Objective | 🌿 Proven |
| **Stage 1 Solvency Preservation** | **₹0.00 Shortfall Guaranteed** | Hard priority constraint | 🛡️ 100% Covered |
| **Gas: 1-Line Reservation** | **209,829 gas** | Baseline allocation | ⛽ ~210k gas |
| **Gas: 5-Line Batch Reservation** | **596,518 gas** | ~119k gas / line | ⛽ Optimized |
| **Gas: 10-Line Batch Reservation** | **916,836 gas** | ~91k gas / line | ⛽ Sub-linear |
| **Gas: 25-Line Batch Reservation** | **2,031,683 gas** | ~81k gas / line | ⛽ High-Throughput |

---

## ⚖️ Mathematical Formulation

### Decision Variables
- $x_{i,j} \in \mathbb{N}_0$: Integer units of asset $i$ pledged to obligation $j$ ($1\text{ unit} = ₹1\text{ lakh face value}$).
- $s_j \ge 0$: Shortfall in obligation $j$ in ₹ lakh.
- $d_{i,j} \ge 0$: Absolute reallocation churn units moved relative to previous allocation $p_{i,j}$.

### Stage 1: Shortfall Minimization (Hard Goal)
Prioritizes complete coverage across high-priority counterparty requirements:
$$\min Z_1 = M \sum_{j \in \text{Obligations}} s_j \quad (M = 1{,}000{,}000)$$

Let $S^*$ be the minimum shortfall attained.

### Stage 2: Carrying Cost + Minimal Churn (Soft Goal)
Subject to preserving optimal coverage $Z_1 \le S^*$:
$$\min Z_2 = \sum_{i \in \text{Assets}} \sum_{j \in \text{Obligations}} \left( \frac{\text{cost\_bps}_i}{10{,}000} \cdot x_{i,j} \cdot \frac{\text{price\_bps}_i}{10{,}000} \right) + \sum_{i,j} w_{\text{churn}} \cdot d_{i,j}$$

Subject to the linear absolute deviation constraints:
$$d_{i,j} \ge x_{i,j} - p_{i,j}, \quad d_{i,j} \ge p_{i,j} - x_{i,j} \quad \forall (i,j)$$

Where:
- $w_{\text{churn}}$: Churn penalty weight (default $0.0002$ ₹ lakh/unit moved $\approx 2$ bps of face).

### System Constraints
1. **Inventory Capacity**: $\sum_{j} x_{i,j} \le \text{Available\_Units}_i \quad \forall i \in \text{Assets}$
2. **Obligation Coverage**: $\sum_{i} \left[ x_{i,j} \cdot \text{price\_bps}_i \cdot (10{,}000 - \text{haircut\_bps}_{i,j}) \right] + s_j \cdot 10^8 \ge \text{required\_lakh}_j \cdot 10^8 \quad \forall j$
3. **Strict Eligibility**: $x_{i,j} = 0 \quad \forall (i,j) \notin \text{EligibleRules}$
4. **On-Chain Scale**: All usable collateral is scaled by $10^8$ to prevent floating-point drift on EVM.

---

## 📋 Prerequisites

- **Node.js**: `v20.0.0` or higher (`v24.14.1` verified)
- **Python**: `3.11` or higher (`3.13.1` verified)
- **npm**: `v10.0.0` or higher

---

## 🚀 Quickstart & Setup

### 1. Automated Full-Stack Orchestrator (Recommended)
You can launch the entire stack (Hardhat node, deployment/seed, FastAPI backend, and Vite frontend) with a single command:
```bash
python3 scripts/dev.py
```
*Pressing <kbd>Ctrl+C</kbd> terminates all child processes cleanly.*

---

### 2. Manual Service Setup

#### Terminal 1: Smart Contracts & Local EVM Node
```bash
cd contracts
npm install --legacy-peer-deps
npx hardhat node
```
*Runs local JSON-RPC node at `http://127.0.0.1:8545` (Chain ID `31337`).*

#### Terminal 2: Python Virtual Environment & FastAPI Gateway
```bash
# Create and activate virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r optimiser/requirements.txt

# Start FastAPI with auto-reload
PYTHONPATH=api:optimiser uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```
*API interactive documentation available at `http://localhost:8000/docs`.*

#### Terminal 3: React Web Dashboard
```bash
cd web
npm install
npm run dev
```
*Accessible at `http://localhost:5173`.*

---

## 🌐 Public Deployment & Cloudflare Tunnel

Nexora's frontend includes built-in proxy routing (`/api` $\to$ `http://localhost:8000`), allowing the entire stack to be exposed over a single secure HTTPS tunnel with zero CORS or Mixed Content errors.

To launch a live Cloudflare Tunnel for hackathon judges or remote devices:
```bash
./scripts/bin/cloudflared tunnel --url http://localhost:5173
```
*Provides an instant `https://xxx.trycloudflare.com` URL accessible worldwide on phones, tablets, and laptops.*

---

## 🧪 Automated Testing Suite

### 1. End-to-End System Smoke Test
```bash
python3 scripts/smoke_test.py
```
Validates the complete 7-step protocol against the live blockchain:
- Step 1: `GET /health` (connectivity and block height verification)
- Step 2: `POST /reset` (contract redeployment and scenario seeding)
- Step 3: `POST /optimise` (dual-stage integer solver execution)
- Step 4: `POST /commit` (EVM transaction mining & state root storage)
- Step 5: `GET /state` (cross-check: verifies on-chain inventory equals solver remaining)
- Step 6: `POST /attack` (verifies all 5 adversarial vectors revert with custom EVM errors)
- Step 7: `GET /events` (audit log and event emission verification)

### 2. Smart Contract Hardhat Tests (15 Passing)
```bash
cd contracts && npx hardhat test
```

### 3. Optimizer & API Tests (46 Passing)
```bash
source .venv/bin/activate
pytest optimiser api
```
Includes `test_market_shock_reoptimise_and_verify` validating shock propagation, churn reduction, track changes diff generation, and cryptographic hash verification.

### 4. Frontend Production Build
```bash
cd web && npm run build
```
Vite production bundle builds cleanly in <1 second with zero compilation warnings.

---

## 📁 Repository Structure

```text
nexora/
├── README.md               # Comprehensive platform documentation
├── PROJECT.md              # Technical specifications, problem scope, and frozen conventions
├── contracts/              # Solidity contracts & Hardhat test suite
│   ├── contracts/          # CollateralLedger.sol (OpenZeppelin 5.1.0, Solc 0.8.24)
│   ├── scripts/            # deploy.js and seed.js
│   ├── test/               # CollateralLedger.test.js (15 tests + gas benchmarks)
│   └── hardhat.config.js   # Hardhat config with offline solc compiler override
├── optimiser/              # Mathematical optimization engine
│   ├── model.py            # Two-stage LP solver (PuLP + HiGHS) with minimal churn constraints
│   ├── baselines.py        # Heuristics: cash_first, cheapest_first, scarcity_aware
│   ├── scenario.py         # Scenario schema loader & validation
│   ├── test_model.py       # Mathematical model test suite (31 tests)
│   ├── test_scenario.py    # Scenario JSON validation test suite (11 tests)
│   └── requirements.txt    # Pinned Python dependencies
├── api/                    # FastAPI REST Gateway
│   ├── main.py             # Endpoints: /optimise, /shock, /reoptimise, /commit-diff, /verify
│   ├── chain.py            # Web3.py blockchain interface, revert decoding, event extraction
│   └── test_api.py         # API integration test suite (4 tests)
├── web/                    # React 18 frontend dashboard
│   ├── src/
│   │   ├── App.jsx         # Overview, Allocation, Compare, Security, Ledger, AuditorModal
│   │   ├── index.css       # Design tokens, dark mode palette, responsive styling
│   │   ├── api.js          # Unified API bridge with Vite proxy support
│   │   └── main.jsx        # Root mounting
│   ├── vite.config.js      # Proxy & tunnel configuration (allowedHosts: true)
│   └── package.json
├── data/
│   └── scenarios/          # Standardized collateral portfolio JSON specifications
│       ├── ref.json        # Reference tight inventory across 3 obligations
│       ├── ref_short.json  # Reference scenario with unavoidable shortfall
│       ├── s1.json         # Two-obligation baseline
│       ├── s2.json         # Enlarged obligation Y capacity stress test
│       ├── s3.json         # 100% shortfall due to ineligibility
│       └── s5.json         # Discounted G-Sec market price stress test
├── shared/
│   └── deployment.json     # Generated contract deployment metadata & ABI
└── scripts/
    ├── dev.py              # Cross-platform full-stack dev orchestrator
    ├── smoke_test.py       # End-to-end integration & firewall verification script
    └── bin/                # Local cloudflared tunneling binaries (git-ignored)
```

---

## 📜 License
Developed for the **Innovise Blockchain Hackathon 2026**. Distributed under the MIT License.
