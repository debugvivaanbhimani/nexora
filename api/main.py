"""FastAPI backend service for Nexora collateral allocation & blockchain ledger."""
import json
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from web3 import Web3

# Ensure optimiser and api modules are in python path
BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.append(str(BASE_DIR / "optimiser"))
sys.path.append(str(BASE_DIR / "api"))

import chain
from model import solve
from scenario import load_scenario

app = FastAPI(
    title="Nexora API",
    description="Institutional Collateral Allocation Engine & Double-Pledge Prevention Ledger",
    version="1.0.0",
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "*",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SCENARIOS_DIR = BASE_DIR / "data" / "scenarios"

# In-memory storage of generated plans and counter
PLANS: Dict[str, Dict[str, Any]] = {}
PLAN_COUNTER: int = 1


# Request Models
class ResetRequest(BaseModel):
    scenario_id: str = Field(default="ref", description="Scenario ID to reset on-chain")


class OptimiseRequest(BaseModel):
    scenario_id: str = Field(default="ref", description="Scenario ID to optimize")
    method: str = Field(default="optimiser", description="optimiser | cheapest_first | cash_first | scarcity_aware")


class CompareRequest(BaseModel):
    scenario_id: str = Field(default="ref", description="Scenario ID to benchmark across all 4 methods")


class CommitRequest(BaseModel):
    plan_id: str = Field(..., description="Plan ID generated from /optimise")


class AttackRequest(BaseModel):
    type: str = Field(
        ...,
        description="Attack type: double_pledge | duplicate | excessive | ineligible | stale",
    )


def _compute_canonical_hash(scenario_id: str, lines: List[Dict[str, Any]]) -> str:
    """Compute keccak256 hash of canonical JSON (sorted keys, no spaces, integers only: scenario + lines)."""
    canonical_obj = {
        "lines": [
            {
                "asset_id": str(l["asset_id"]),
                "obligation_id": str(l["obligation_id"]),
                "units": int(l["units"]),
            }
            for l in lines
        ],
        "scenario": str(scenario_id),
    }
    canonical_str = json.dumps(canonical_obj, sort_keys=True, separators=(",", ":"))
    return Web3.keccak(text=canonical_str).hex()


@app.get("/health")
def health():
    """Health check verifying connection to the local Hardhat node."""
    w3 = chain.get_web3()
    is_connected = w3.is_connected()
    chain_id = w3.eth.chain_id if is_connected else None
    block_num = w3.eth.block_number if is_connected else 0
    deployment_addr = None
    try:
        dep = chain.get_deployment()
        deployment_addr = dep.get("address")
    except Exception:
        pass

    return {
        "ok": is_connected,
        "status": "ok",
        "chain_connected": is_connected,
        "chain_id": chain_id,
        "block": block_num,
        "contract_address": deployment_addr,
    }


@app.get("/scenarios")
def list_scenarios():
    """List all available scenario files with summary counts."""
    scenarios = []
    if SCENARIOS_DIR.exists():
        for file in sorted(SCENARIOS_DIR.glob("*.json")):
            try:
                with open(file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    scenarios.append(
                        {
                            "id": data.get("id"),
                            "name": data.get("name"),
                            "description": data.get("description"),
                            "filename": file.name,
                            "asset_count": len(data.get("assets", [])),
                            "obligation_count": len(data.get("obligations", [])),
                            "rule_count": len(data.get("rules", [])),
                        }
                    )
            except Exception:
                continue
    return scenarios


@app.get("/scenarios/{scenario_id}")
def get_scenario(scenario_id: str):
    """Retrieve the full JSON specification for a specific scenario."""
    candidate = SCENARIOS_DIR / f"{scenario_id.lower()}.json"
    if not candidate.exists():
        # Case-insensitive fallback search
        for f in SCENARIOS_DIR.glob("*.json"):
            if f.stem.lower() == scenario_id.lower():
                candidate = f
                break

    if not candidate.exists():
        raise HTTPException(status_code=404, detail=f"Scenario '{scenario_id}' not found.")

    with open(candidate, "r", encoding="utf-8") as f:
        return json.load(f)


@app.post("/reset")
def reset_chain(req: ResetRequest):
    """Deploy fresh CollateralLedger and seed scenario assets and rules."""
    try:
        res = chain.reset(req.scenario_id)
        PLANS.clear()
        return res
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/optimise")
def run_optimise(req: OptimiseRequest):
    """Compute optimal collateral allocation using current on-chain free quantities."""
    global PLAN_COUNTER
    scenario_path = SCENARIOS_DIR / f"{req.scenario_id.lower()}.json"
    if not scenario_path.exists():
        for f in SCENARIOS_DIR.glob("*.json"):
            if f.stem.lower() == req.scenario_id.lower():
                scenario_path = f
                break

    if not scenario_path.exists():
        raise HTTPException(status_code=404, detail=f"Scenario '{req.scenario_id}' not found.")

    # 1. Fetch live free quantities from chain
    try:
        current_state = chain.state()
        free_qty = {s["asset_id"]: s["available"] for s in current_state}
    except Exception:
        free_qty = None

    # 2. Solve allocation
    result = solve(scenario_path, method=req.method, free_qty=free_qty)

    # 3. Assign plan ID and compute canonical hash
    plan_id = f"{req.scenario_id.lower()}-{req.method}-{PLAN_COUNTER}"
    PLAN_COUNTER += 1
    plan_hash = _compute_canonical_hash(req.scenario_id, result["lines"])

    result["plan_id"] = plan_id
    result["plan_hash"] = plan_hash

    # 4. Store in memory for commit
    PLANS[plan_id] = result
    return result


@app.post("/compare")
def compare_all(req: CompareRequest):
    """Benchmark all 4 allocation methods on the given scenario using on-chain free inventory."""
    scenario_path = SCENARIOS_DIR / f"{req.scenario_id.lower()}.json"
    if not scenario_path.exists():
        for f in SCENARIOS_DIR.glob("*.json"):
            if f.stem.lower() == req.scenario_id.lower():
                scenario_path = f
                break

    if not scenario_path.exists():
        raise HTTPException(status_code=404, detail=f"Scenario '{req.scenario_id}' not found.")

    try:
        current_state = chain.state()
        free_qty = {s["asset_id"]: s["available"] for s in current_state}
    except Exception:
        free_qty = None

    methods = ["optimiser", "cheapest_first", "cash_first", "scarcity_aware"]
    results = {}
    for m in methods:
        res = solve(scenario_path, method=m, free_qty=free_qty)
        plan_id = f"{req.scenario_id.lower()}-{m}-1"
        plan_hash = _compute_canonical_hash(req.scenario_id, res["lines"])
        res["plan_id"] = plan_id
        res["plan_hash"] = plan_hash
        PLANS[plan_id] = res
        results[m] = res
    return results


@app.post("/commit")
def commit_plan(req: CommitRequest):
    """Commit an existing plan_id to the smart contract via reserveBatch()."""
    if req.plan_id not in PLANS:
        raise HTTPException(
            status_code=404,
            detail=f"Plan '{req.plan_id}' not found in memory. Please run /optimise first.",
        )

    plan = PLANS[req.plan_id]
    result = chain.commit(plan, signer="allocator")
    return result


@app.get("/state")
def get_state():
    """Return on-chain status of all registered collateral assets."""
    try:
        return chain.state()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/events")
def get_events():
    """Return on-chain logs merged with rejection logs, newest first."""
    try:
        return chain.events()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/attack")
def execute_attack(req: AttackRequest):
    """Simulate a malicious attack from Desk 2 and verify smart contract rejection."""
    try:
        return chain.attack(req.type)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
