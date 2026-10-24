# PledgeGuard – Smart Collateral Allocation & Double-Pledge Prevention
*(Innovise Blockchain PS 1)*

Welcome to **PledgeGuard**! This repository is built for the hackathon to solve collateral allocation efficiency while preventing double-pledging and fraudulent multi-pledging across decentralized finance (DeFi) and institutional lending protocols.

---

## 📁 Repository Structure

To move fast without stepping on each other's toes, we are running **parallel time-boxed explorations** before integrating into a single production codebase:

```text
pledgeguard/
├── README.md               # Root overview and collaboration rules
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
