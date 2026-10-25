# PledgeGuard – Smart Collateral Allocation & Double-Pledge Prevention
*(Innovise Blockchain – PS 1)*

Welcome to **PledgeGuard**! This repository is built for the hackathon to solve collateral allocation efficiency while preventing double-pledging and fraudulent multi-pledging across financial institutions, lending protocols, and collateral management networks.

---

## 🎯 Problem Statement (PS 1)

### 1. Problem Statement
Financial institutions often need to provide assets such as cash, government bonds, and corporate bonds as collateral to meet financial obligations. Selecting the right assets can be challenging because different assets have different market values, eligibility requirements, haircuts, and associated funding costs.

When multiple obligations must be satisfied simultaneously, inefficient allocation can increase costs, while conflicting reservations can result in the same asset being pledged beyond its available quantity.

Develop a blockchain-based system that optimizes collateral allocation across multiple financial obligations, minimizes estimated funding costs, identifies collateral shortfalls, and prevents conflicting asset reservations through smart contracts.

### 2. Problem Description
The system should allow users to enter available collateral assets, their market values, applicable haircuts, funding costs, available quantities, and eligibility rules, along with the collateral requirements of multiple obligations.

- **Usable Collateral Value**: Calculates the usable value of each asset after applying haircuts:
  $$\text{Usable Value} = \text{Market Value} \times (1 - \text{Haircut})$$
- **Cost-Optimal Allocation**: Recommends an allocation that satisfies all obligations at the lowest possible estimated funding cost.
- **Shortfall Detection**: If sufficient eligible collateral is unavailable, the system flags and reports the exact shortfall per obligation.
- **Blockchain Smart Contract Reservation**: Records collateral reservations immutably on-chain, tracks remaining available quantities, strictly rejects conflicting, duplicate, or excessive reservations, and maintains an auditable tamper-proof trail of allocation decisions.

### 3. Mandatory MVP Requirements

1. **Collateral Allocation and Optimization**:
   - Algorithm calculating haircut-adjusted collateral values.
   - Optimal allocation across multiple obligations while minimizing estimated funding costs.
2. **Eligibility and Shortfall Detection**:
   - Strict enforcement of asset eligibility rules per obligation.
   - Available asset quantity limits respected.
   - Unmet collateral requirements identified and reported clearly as shortfalls.
3. **Blockchain-Based Reservation**:
   - Smart contracts to record reservations and track real-time available quantities.
   - Rejection logic preventing double-pledging or over-reservation of any asset.
   - Immutable and auditable on-chain event log.
4. **Dashboard and Results**:
   - Intuitive interface displaying available assets, recommended allocations, estimated funding costs, obligation coverage, remaining collateral, and identified shortfalls.
5. **Testing and Evaluation**:
   - Comprehensive test scenarios: successful multi-obligation allocation, insufficient-collateral scenarios, ineligible asset handling, and rejected duplicate/excess reservations.
   - Benchmark comparison: proposed optimization algorithm vs. a baseline heuristic (e.g., greedy/pro-rata) across estimated funding costs, collateral shortfalls, and asset utilization.

---

## 📁 Repository Structure

To move fast without stepping on each other's toes, we are running **parallel time-boxed explorations** before integrating into a single production codebase:

```text
pledgeguard/
├── README.md               # Root overview, problem statement, and collaboration rules
├── .gitignore              # Shared ignores (Node, Python, Hardhat, IDEs, OS)
├── explore/
│   ├── A/                  # Teammate 1 exploration track
│   │   └── README.md
│   ├── B/                  # Teammate 2 exploration track
│   │   └── README.md
│   └── C/                  # Teammate 3 exploration track
│       └── README.md
└── app/                    # Final unified solution (populated after team convergence)
    └── README.md
```

- **`explore/A`, `explore/B`, `explore/C`**: Separate sandbox folders, one per team member. Each person can experiment with different architectures, frameworks, contract designs, or algorithms freely inside their designated folder.
- **`app/`**: Where the final merged project will live after the team reviews all tracks and picks our winning direction.

---

## 📜 Team Collaboration Rules

1. **Isolation**: Each person only edits files inside their assigned folder (`explore/A/`, `explore/B/`, or `explore/C/`). Do not touch files in another teammate's folder unless explicitly asked.
2. **Pull First**: Always pull the latest changes before starting a work session:
   ```bash
   git pull origin main
   ```
3. **Commit & Push Early and Often**: Commit and push after every working step. Do not keep hours of work uncommitted locally:
   ```bash
   git add explore/<your-folder>/
   git commit -m "feat(<your-folder>): describe what you built"
   git push origin main
   ```
4. **Hands Off `app/`**: Absolutely nothing goes into `app/` until the entire team meets, compares the three approaches, and agrees on the final merged architecture.
