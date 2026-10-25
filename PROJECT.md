PROJECT CONTEXT 
We are building "Nexora" for a hackathon (Innovise, Blockchain PS 1: Smart Collateral
Allocation & Double-Pledge Prevention). Two halves:
1. An optimiser that allocates collateral assets to obligations at the lowest funding cost,
   respecting eligibility, haircuts and quantities, and reports exact shortfalls.
2. A Solidity smart contract on a local Hardhat chain that records reservations, tracks
   remaining quantities, and rejects excessive, duplicate, ineligible or stale reservations.

FROZEN CONVENTIONS (never change without asking me):
- 1 unit = ₹1 lakh face value. Quantities are whole numbers.
- price_bps: market price as share of face value, 10000 = par.
- haircut_bps: belongs to the pair (obligation, asset class). A missing rule = ineligible.
- funding_cost_bps: annual cost charged on MARKET value used.
- Usable value (scaled, integer) = units * price_bps * (10000 - haircut_bps). Scale 10^8.
- Covered  <=>  sum(usable_scaled) >= required_lakh * 10^8. Same integer test everywhere.
- Annual cost in lakh = units * price_bps/10000 * funding_cost_bps/10000.
- Shortfall is a business result: reported and recorded, never an error.
- IDs: readable strings off-chain (max 31 chars, A-Z 0-9 _), bytes32 on-chain via
  ethers.encodeBytes32String / Web3.to_bytes(text=id).ljust(32, b"\0").
- Chain: local Hardhat node, chainId 31337. No MetaMask; backend signs with Hardhat accounts:
  #0 admin+custodian+rules, #1 Allocator desk, #2 Desk 2 (attacker, also allocator), #3 Lender.

STACK: contracts/ (Hardhat 2.22.17, Solidity 0.8.24, OpenZeppelin 5.1.0) ·
optimiser/ + api/ (Python 3.11+, pulp==2.9.0, highspy, fastapi, uvicorn, web3, pytest) ·
web/ (React + Vite + Tailwind + Recharts) · data/scenarios/ (scenario JSON) · scripts/ · shared/ · reference/.

WORKING RULES: small steps; after each step tell me the exact command to run and what I
should see; never rename agreed fields; explain each new file in 2 sentences.
