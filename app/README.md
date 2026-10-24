# PledgeGuard – Production Application (`app/`)

> **Note**: This folder is currently a placeholder. No code should be placed in here during the exploration phase until the team agrees on the final direction.

---

## Planned Architecture

Once the team selects the winning approach from `explore/A`, `explore/B`, and `explore/C`, this folder will host the consolidated production solution with the following structure:

```text
app/
├── contracts/        # Smart contracts (Solidity / Hardhat / Foundry) for double-pledge registry & enforcement
├── optimiser/        # Collateral allocation & optimisation engine (Python / linear programming / solvers)
├── api/              # Backend services & indexing layer (Node.js / FastAPI / GraphQL / REST)
├── web/              # Frontend user interface and protocol dashboard
├── data/             # Mock datasets, test portfolios, sample loan requests, and benchmarks
└── deck/             # Pitch deck, presentation slides, architecture diagrams, and demo documentation
```

---

## Integration Workflow

1. Team conducts demo and review of `explore/A`, `explore/B`, and `explore/C`.
2. Decision logged on which components/patterns are chosen.
3. Modules migrated into `app/contracts/`, `app/optimiser/`, `app/api/`, and `app/web/`.
