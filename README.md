# Nexora – Smart Collateral Allocation & Double-Pledge Prevention
*(Innovise Blockchain – PS 1: Smart Collateral Allocation & Double-Pledge Prevention)*

**Nexora** is an institutional-grade collateral allocation and encumbrance tracking platform built for the Innovise Blockchain Hackathon. It pairs a mathematical optimization solver (PuLP / HiGHS) with an immutable smart contract ledger (Solidity / Hardhat) to allocate multi-asset collateral across competing financial obligations at minimum funding cost while strictly preventing double-pledging.

---

## 🏛️ Architecture Overview

The system bridges financial optimization and cryptographic settlement:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Nexora Editorial Web UI                         │
│             (Vite + React 18 + Space Grotesk + JetBrains Mono)         │
│          http://localhost:5173  [Overview | Allocation | Compare]      │
│                                 [Security Firewall | Ledger]           │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTP / JSON
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                          FastAPI Gateway                               │
│                         http://localhost:8000                          │
│        /health · /scenarios · /reset · /optimise · /commit · /attack   │
└──────────────────┬────────────────────────────────┬────────────────────┘
                   │ In-memory & LP calls           │ Web3.py RPC
                   ▼                                ▼
┌───────────────────────────────────────┐ ┌──────────────────────────────┐
│     Two-Stage Optimizer Engine        │ │   CollateralLedger.sol       │
│         (PuLP 2.9.0 + HiGHS)          │ │       (Hardhat Node)         │
│  Stage 1: Min Priority Shortfall      │ │   http://127.0.0.1:8545      │
│  Stage 2: Min Annual Funding Cost     │ │   reserveBatch(), getAsset() │
│  + 3 Heuristics (Cash/Cheap/Scarcity) │ │   Prevents double-pledging   │
└───────────────────────────────────────┘ └──────────────────────────────┘
```

---

## 📋 Prerequisites

- **Node.js**: `v20.0.0` or higher (`v24.14.1` verified)
- **npm**: `v10.0.0` or higher
- **Python**: `3.11` or higher (`3.13.1` verified)

---

## 🛠️ Environment Setup

### 1. Python Virtual Environment (`optimiser/` & `api/`)
```bash
# Create the virtual environment using Python 3.11+
python3 -m venv .venv

# Activate the virtual environment
# On macOS / Linux:
source .venv/bin/activate
# On Windows:
# .venv\Scripts\activate

# Install pinned dependencies
pip install --upgrade pip
pip install -r optimiser/requirements.txt
```

### 2. Smart Contracts (`contracts/`)
```bash
cd contracts
npm install --legacy-peer-deps
npx hardhat compile
npx hardhat test
cd ..
```

### 3. Web Dashboard (`web/`)
```bash
cd web
npm install
npm run build
cd ..
```

---

## 🚀 How to Run

### Option 1: Single-Command Dev Runner (Recommended)
You can start all three services (Hardhat node, deployment/seed, FastAPI gateway, and Vite web dashboard) with a single command:
```bash
python3 scripts/dev.py
```
This script:
1. Boots the local Hardhat node on port `8545`.
2. Deploys `CollateralLedger.sol` and seeds scenario `ref.json`.
3. Launches the FastAPI backend on port `8000`.
4. Starts the Vite web dashboard on port `5173`.
5. Prints all service URLs; pressing <kbd>Ctrl+C</kbd> terminates the entire process tree cleanly.

### Option 2: Manual Multi-Terminal Startup
Alternatively, you can launch each component across separate terminal windows:

#### Terminal 1: Hardhat Blockchain Node
```bash
cd contracts && npx hardhat node
```
*Starts local JSON-RPC node at `http://127.0.0.1:8545` (Chain ID `31337`).*

#### Terminal 2: FastAPI Backend Engine
```bash
source .venv/bin/activate
PYTHONPATH=api:optimiser uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```
*Serves REST API at `http://localhost:8000` (Interactive docs at `http://localhost:8000/docs`).*

#### Terminal 3: React Web Dashboard
```bash
cd web && npm run dev
```
*Serves the green editorial dashboard at `http://localhost:5173`.*

---

## 🧪 Testing & Verification

All modules have comprehensive automated test suites:

### 1. End-to-End System Smoke Test
```bash
python3 scripts/smoke_test.py
```
Executes the full sequential protocol against the live stack:
- Step 1: `GET /health` (connectivity & chain verification)
- Step 2: `POST /reset` (contract deployment & scenario seeding)
- Step 3: `POST /optimise` (two-stage mathematical solver)
- Step 4: `POST /commit` (EVM transaction mining & version incrementing)
- Step 5: `GET /state` (**Cross-Check**: validates on-chain available for every asset equals optimizer remaining)
- Step 6: `POST /attack` (validates all 5 adversarial exploit vectors revert with exact custom EVM errors)
- Step 7: `GET /events` (audit log verification)

### 2. Smart Contract Tests (15/15 Passed)
```bash
cd contracts && npx hardhat test
```
Tests deployment, role access control, asset registration, eligibility rules, single & batch reservations, asset version incrementing, duplicate allocation prevention, and custom EVM error reverts.

### 3. Optimizer & API Integration Tests (45/45 Passed)
```bash
source .venv/bin/activate
pytest optimiser api
```
Tests:
- **Optimizer (`optimiser/test_model.py`)**: Two-stage mathematical solver convergence, integer quantities, scaled integer usable values ($10^8$), priority waterfall protection, and comparison with baselines.
- **Scenario Schema Validation (`optimiser/test_scenario.py`)**: Pydantic validation across all 6 scenario files.
- **API Full Lifecycle (`api/test_api.py`)**: `/health`, `/scenarios`, `/reset`, `/optimise`, `/compare`, `/commit`, `/state`, and all 5 `/attack` simulations.

### 4. Web Dashboard Production Build
```bash
cd web && npm run build
```
Validates TypeScript/JSX transforms, font bundling, and CSS compiling with 0 errors.

---

## 📊 Key Dashboard Features & Views

The frontend provides an institutional green editorial UI with 5 purpose-built operational views:

1. **Overview (Collateral Control Room)**:
   - Real-time **Collateral Position** hero banner with circular utilisation gauge and obligations secured count.
   - Live KPI cards: **Annual funding cost** (₹ lakh/yr), **Effective cost**, and **Uncovered exposure**.
   - **Available Collateral**: Real-time asset inventory cards showing free units, version badges (`v1`, `v2`), capacity utilization progress bars, and locked badges when depleted.
   - **Obligations Priority Waterfall**: Percentage coverage bars and shortfall amounts per counterparty.

2. **Allocation (Collateral Flow Analysis)**:
   - Interactive visual flow mapping collateral assets to obligations.
   - Path thickness represents usable collateral value after haircuts ($10^8$ scaling).
   - Method switcher tabs comparing `Nexora AI` against `Cash first`, `Cheapest first`, and `Scarcity aware`.

3. **Compare (Strategy Benchmarking)**:
   - Side-by-side benchmark bar charts comparing all 4 allocation methods across **Effective cost**, **Shortfall**, and **Utilisation**.
   - Clear insight evidence explaining why greedy heuristics leave Repo short by ₹2,666 lakh while Nexora AI achieves 100% coverage.

4. **Security (Adversarial Double-Pledge Firewall)**:
   - Interactive policy engine validating on-chain protection against 5 attack vectors executed by hostile `Desk 2`:
     - **Double pledge**: Catching insufficient quantity attempts (`InsufficientQuantity`).
     - **Replay allocation**: Catching duplicate allocation IDs (`DuplicateAllocation`).
     - **Excess quantity**: Catching requests exceeding total issuance (`InsufficientQuantity`).
     - **Break eligibility**: Catching ineligible collateral pledged against repo rules (`Ineligible`).
     - **Stale inventory**: Catching commits against outdated inventory versions (`StalePlan`).

5. **Ledger (Immutable Audit Trail)**:
   - Sealed plan hash copy badge (`keccak256`).
   - Block-by-block transaction table displaying event types (`Reserved`, `AllocationCommitted`, `AssetRegistered`, `Rejected`), actors (`Desk 1`, `Desk 2`, `Admin`), reasons, and IST timestamps.

---

## 📁 Repository Structure

```text
nexora/
├── README.md               # Project overview, setup, and testing documentation
├── PROJECT.md              # Problem statement, frozen conventions, and technical specs
├── .gitignore              # Shared repository ignores
├── contracts/              # Smart contracts & Hardhat environment
│   ├── contracts/          # CollateralLedger.sol (OpenZeppelin 5.1.0, Solc 0.8.24)
│   ├── scripts/            # deploy.js and seed.js
│   ├── test/               # CollateralLedger.test.js (15 tests)
│   ├── hardhat.config.js   # Hardhat config with offline solc compiler override
│   └── package.json
├── optimiser/              # Mathematical allocation solver & baselines
│   ├── model.py            # Two-stage LP solver (PuLP 2.9.0 + HiGHS)
│   ├── baselines.py        # Heuristics: cash_first, cheapest_first, scarcity_aware
│   ├── scenario.py         # Scenario schema loader & validation
│   ├── test_model.py       # Mathematical model test suite (31 tests)
│   ├── test_scenario.py    # Scenario JSON validation test suite (11 tests)
│   └── requirements.txt    # Pinned Python dependencies
├── api/                    # FastAPI backend service
│   ├── main.py             # REST API routing (/health, /scenarios, /optimise, /commit, /attack)
│   ├── chain.py            # Web3.py blockchain interaction, error decoding, and attack simulation
│   └── test_api.py         # Full API integration test suite (3 tests)
├── web/                    # React 18 web dashboard
│   ├── src/
│   │   ├── App.jsx         # Institutional green editorial UI (Overview, Flow, Compare, Security, Ledger)
│   │   ├── index.css       # Design system, CSS tokens, and typography
│   │   ├── api.js          # Live API bridge to FastAPI with fallback
│   │   └── main.jsx        # App mounting & toast configuration
│   ├── package.json
│   └── vite.config.js
├── data/
│   └── scenarios/          # Benchmark & stress scenario JSON specifications
│       ├── ref.json        # Reference tight inventory across 3 obligations
│       ├── ref_short.json  # Reference scenario with unavoidable shortfall
│       ├── s1.json         # Two-obligation baseline
│       ├── s2.json         # Enlarged obligation Y capacity stress test
│       ├── s3.json         # 100% shortfall due to ineligibility
│       └── s5.json         # Discounted G-Sec market price stress test
├── shared/
│   └── deployment.json     # Generated deployment metadata, contract address, and ABI
├── scripts/                # Development & testing automation
│   ├── dev.py              # Cross-platform full-stack dev runner (Hardhat + Seed + API + Web)
│   └── smoke_test.py       # End-to-end smoke test & on-chain state cross-checker
└── reference/              # Reference specifications and verification data
```

---

## ⚖️ Frozen Mathematical Conventions

- **Units**: $1\text{ unit} = ₹1\text{ lakh face value}$. Whole numbers only.
- **Price ($\text{price\_bps}$)**: Market price as share of face value ($10000 = \text{par}$).
- **Haircut ($\text{haircut\_bps}$)**: Haircut applied to the pair $(\text{obligation}, \text{asset\_class})$. Missing rule = ineligible.
- **Funding Cost ($\text{funding\_cost\_bps}$)**: Annual cost charged on **market value used**:
  $$\text{annual\_cost\_lakh} = \frac{\text{units} \times \text{price\_bps} \times \text{funding\_cost\_bps}}{10^8}$$
- **Usable Value (Scaled Integer)**:
  $$\text{usable\_scaled} = \text{units} \times \text{price\_bps} \times (10000 - \text{haircut\_bps}) \quad (\text{Scale: } 10^8)$$
- **Coverage Condition**:
  $$\sum \text{usable\_scaled} \ge \text{required\_lakh} \times 10^8$$
- **Effective Cost (Objective Metric)**:
  $$\text{effective\_cost\_lakh} = \text{funding\_cost\_lakh} + \text{shortfall\_penalty} \times \text{shortfall\_lakh} \quad (\text{penalty} = 0.09)$$
