# Nexora – Smart Collateral Allocation & Double-Pledge Prevention
*(Innovise Blockchain – PS 1)*

**Nexora** is an institutional-grade collateral allocation and encumbrance tracking platform built for the Innovise Blockchain Hackathon. It pairs a mathematical optimization solver (PuLP/HiGHS) with an immutable smart contract ledger (Solidity/Hardhat) to allocate multi-asset collateral across competing financial obligations at minimum funding cost while strictly preventing double-pledging.

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
python3.13 -m venv .venv

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

---

## 🚀 How to Run

*(Step-by-step instructions for running the Hardhat local node, API backend, and React web dashboard will be added as each module is built.)*

1. **Local Blockchain Node**:
   ```bash
   cd contracts && npx hardhat node
   ```
2. **Deploy Contracts & Seed Scenarios**:
   ```bash
   # (Will run deployment & seeding script)
   ```
3. **Optimiser API Service**:
   ```bash
   # (Will launch FastAPI uvicorn server)
   ```
4. **Web Dashboard**:
   ```bash
   # (Will run Vite dev server)
   ```

---

## 📁 Repository Structure

```text
nexora/
├── README.md               # Project overview, prerequisites, and setup instructions
├── PROJECT.md              # Project context, frozen conventions, and technical specs
├── .gitignore              # Shared ignores (Node, Python, Hardhat, generated artifacts)
├── contracts/              # Hardhat 2.22.17, Solidity 0.8.24, OpenZeppelin 5.1.0
│   ├── contracts/          # CollateralLedger.sol
│   ├── test/               # CollateralLedger.test.js
│   └── package.json
├── optimiser/              # Allocation engine (PuLP 2.9.0, HiGHS, benchmarks)
│   ├── opt.py
│   ├── experiments.py
│   └── requirements.txt
├── api/                    # FastAPI backend service
├── web/                    # React + Vite + Tailwind + Recharts dashboard
├── data/
│   └── scenarios/          # Canonical and stress test scenario JSON files
├── shared/                 # Generated deployment addresses and ABI definitions
├── scripts/                # Deployment, seeding, and demo automation scripts
└── reference/              # Reference documentation, formulas, and evaluation results
```

---

## 🎯 Problem Statement (PS 1)

### 1. Problem Statement
Financial institutions often need to provide assets such as cash, government bonds, and corporate bonds as collateral to meet financial obligations. Selecting the right assets can be challenging because different assets have different market values, eligibility requirements, haircuts, and associated funding costs.

When multiple obligations must be satisfied simultaneously, inefficient allocation can increase costs, while conflicting reservations can result in the same asset being pledged beyond its available quantity.

Develop a blockchain-based system that optimizes collateral allocation across multiple financial obligations, minimizes estimated funding costs, identifies collateral shortfalls, and prevents conflicting asset reservations through smart contracts.

### 2. Problem Description
The system allows users to enter available collateral assets, their market values, applicable haircuts, funding costs, available quantities, and eligibility rules, along with the collateral requirements of multiple obligations.

- **Usable Collateral Value (Scaled Integer)**:
  $$\text{usable\_scaled} = \text{units} \times \text{price\_bps} \times (10000 - \text{haircut\_bps}) \quad (\text{Scale: } 10^8)$$
- **Cost-Optimal Allocation**: Recommends an allocation that satisfies all obligations at the lowest possible estimated funding cost.
- **Shortfall Detection**: If sufficient eligible collateral is unavailable, the system flags and reports the exact shortfall per obligation as a business result.
- **Blockchain Smart Contract Reservation**: Records collateral reservations immutably on-chain, tracks remaining available quantities, strictly rejects conflicting, duplicate, or excessive reservations, and maintains an auditable tamper-proof trail of allocation decisions.

### 3. Mandatory MVP Requirements
1. **Collateral Allocation and Optimization**: Algorithm calculating haircut-adjusted collateral values and allocating eligible assets across multiple obligations while minimizing estimated funding costs.
2. **Eligibility and Shortfall Detection**: Strict enforcement of eligibility rules, available quantity limits, and clear shortfall reporting when assets are insufficient.
3. **Blockchain-Based Reservation**: Smart contract recording reservations, tracking available balances, and rejecting over-pledging or conflicting reservations.
4. **Dashboard and Results**: Simple, intuitive interface displaying available assets, recommended allocations, funding costs, coverage, remaining collateral, and shortfalls.
5. **Testing and Evaluation**: Demonstrating successful allocations, shortfall scenarios, ineligibility handling, duplicate/excess rejection, and benchmark comparison against baseline heuristics.
