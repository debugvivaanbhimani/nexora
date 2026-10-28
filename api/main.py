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
SHOCKED_SCENARIOS: Dict[str, Dict[str, Any]] = {}


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


class StressRequest(BaseModel):
    scenario_id: str = Field(default="ref", description="Scenario ID to stress test")
    repo_req_lakh: Optional[float] = Field(default=None, description="Override repo requirement in lakh")
    haircut_addon_bps: int = Field(default=0, description="Additive market haircut shock in basis points")
    use_baseline_qty: bool = Field(default=True, description="Whether to stress test against full scenario inventory")


class ShockRequest(BaseModel):
    scenario_id: str = Field(default="ref", description="Scenario ID to shock")
    class_moves: Dict[str, int] = Field(
        ...,
        description="Basis point change per asset class or asset ID (e.g. {'EQUITY': -2000, 'CORP_AAA': -500})",
    )


class ReoptimiseRequest(BaseModel):
    scenario_id: str = Field(default="ref", description="Scenario ID to re-optimise")
    plan_id: Optional[str] = Field(default=None, description="Previous plan ID to minimize churn from")
    churn_weight: float = Field(default=0.0002, description="Lakh per unit moved (default 0.0002 ≈ 2 bps)")


class CommitDiffRequest(BaseModel):
    plan_id: str = Field(..., description="Re-optimised Plan ID to commit on-chain")
    old_plan_id: Optional[str] = Field(default=None, description="Old plan ID to release")


class VerifyRequest(BaseModel):
    plan_id: str = Field(..., description="Plan ID to verify on-chain")
    simulate_tamper: bool = Field(default=False, description="Simulate rogue database edit for auditor demonstration")


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
    h = Web3.keccak(text=canonical_str).hex()
    return h if h.startswith("0x") else f"0x{h}"


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


@app.post("/stress")
def run_stress_test(req: StressRequest):
    """Run real-time stress testing with custom obligation amounts and haircut shocks."""
    scenario_path = SCENARIOS_DIR / f"{req.scenario_id.lower()}.json"
    if not scenario_path.exists():
        for f in SCENARIOS_DIR.glob("*.json"):
            if f.stem.lower() == req.scenario_id.lower():
                scenario_path = f
                break

    if not scenario_path.exists():
        raise HTTPException(status_code=404, detail=f"Scenario '{req.scenario_id}' not found.")

    with open(scenario_path, "r", encoding="utf-8") as f:
        scenario = json.load(f)

    # 1. Apply repo requirement override if requested
    if req.repo_req_lakh is not None and req.repo_req_lakh > 0:
        for ob in scenario.get("obligations", []):
            if ob.get("id") == "O3" or "repo" in ob.get("name", "").lower():
                ob["required_lakh"] = float(req.repo_req_lakh)

    # 2. Apply haircut shock if requested
    if req.haircut_addon_bps > 0:
        for rule in scenario.get("rules", []):
            rule["haircut_bps"] = min(9900, int(rule.get("haircut_bps", 0)) + int(req.haircut_addon_bps))

    # 3. Solve with requested inventory baseline or on-chain inventory
    free_qty = None
    if not req.use_baseline_qty:
        try:
            current_state = chain.state()
            free_qty = {s["asset_id"]: s["available"] for s in current_state}
        except Exception:
            free_qty = None

    opt_res = solve(scenario, method="optimiser", free_qty=free_qty)
    cheap_res = solve(scenario, method="cheapest_first", free_qty=free_qty)

    return {
        "scenario_id": req.scenario_id,
        "repo_req_lakh": req.repo_req_lakh,
        "haircut_addon_bps": req.haircut_addon_bps,
        "optimiser": opt_res,
        "cheapest_first": cheap_res,
    }


@app.post("/shock")
def apply_market_shock(req: ShockRequest):
    """Update scenario market prices and evaluate coverage on current committed plan."""
    scenario_path = SCENARIOS_DIR / f"{req.scenario_id.lower()}.json"
    if not scenario_path.exists():
        for f in SCENARIOS_DIR.glob("*.json"):
            if f.stem.lower() == req.scenario_id.lower():
                scenario_path = f
                break
    if not scenario_path.exists():
        raise HTTPException(status_code=404, detail=f"Scenario '{req.scenario_id}' not found.")

    with open(scenario_path, "r", encoding="utf-8") as f:
        scenario = json.load(f)

    # Apply class_moves
    new_prices = {}
    for a in scenario.get("assets", []):
        move = req.class_moves.get(a.get("class"), req.class_moves.get(a.get("id"), 0))
        if move != 0:
            a["price_bps"] = max(100, int(a.get("price_bps", 10000)) + int(move))
        new_prices[a["id"]] = a["price_bps"]

    SHOCKED_SCENARIOS[req.scenario_id.lower()] = scenario

    # Evaluate current committed plan under new prices
    plan = None
    if chain.LAST_COMMITTED_PLAN_ID and chain.LAST_COMMITTED_PLAN_ID in PLANS:
        plan = PLANS[chain.LAST_COMMITTED_PLAN_ID]
    elif PLANS:
        plan = list(PLANS.values())[-1]

    coverage_list = []
    under_covered = []
    total_shortfall = 0.0

    if plan:
        lines = plan.get("lines", [])
        rules = {(r["obligation_id"], r["class"]): r["haircut_bps"] for r in scenario.get("rules", [])}
        assets_map = {a["id"]: a for a in scenario.get("assets", [])}

        for ob in scenario.get("obligations", []):
            o_id = ob["id"]
            req_lakh = float(ob["required_lakh"])
            usable_scaled = 0
            for l in lines:
                if l["obligation_id"] == o_id:
                    aid = l["asset_id"]
                    if aid in assets_map and (o_id, assets_map[aid]["class"]) in rules:
                        h_bps = rules[(o_id, assets_map[aid]["class"])]
                        p_bps = assets_map[aid]["price_bps"]
                        usable_scaled += int(l["units"]) * p_bps * (10000 - h_bps)

            cov_lakh = round(usable_scaled / 1e8, 4)
            is_covered = cov_lakh >= req_lakh
            shortfall = 0.0 if is_covered else round(req_lakh - cov_lakh, 4)
            total_shortfall += shortfall

            cov_item = {
                "obligation_id": o_id,
                "name": ob.get("name", o_id),
                "required_lakh": req_lakh,
                "covered_lakh": cov_lakh,
                "shortfall_lakh": shortfall,
                "covered": is_covered,
            }
            coverage_list.append(cov_item)
            if not is_covered:
                under_covered.append(cov_item)

    return {
        "scenario_id": req.scenario_id,
        "class_moves": req.class_moves,
        "new_prices": new_prices,
        "coverage": coverage_list,
        "under_covered": under_covered,
        "total_shortfall_lakh": round(total_shortfall, 4),
        "evaluated_plan_id": plan.get("plan_id") if plan else None,
    }


@app.post("/reoptimise")
def reoptimise_plan(req: ReoptimiseRequest):
    """Re-optimise collateral under current shocked prices minimizing operational churn."""
    global PLAN_COUNTER
    scenario = SHOCKED_SCENARIOS.get(req.scenario_id.lower())
    if not scenario:
        scenario_path = SCENARIOS_DIR / f"{req.scenario_id.lower()}.json"
        if not scenario_path.exists():
            for f in SCENARIOS_DIR.glob("*.json"):
                if f.stem.lower() == req.scenario_id.lower():
                    scenario_path = f
                    break
        if not scenario_path.exists():
            raise HTTPException(status_code=404, detail=f"Scenario '{req.scenario_id}' not found.")
        with open(scenario_path, "r", encoding="utf-8") as f:
            scenario = json.load(f)

    # Find previous plan to minimize churn against
    base_plan = None
    if req.plan_id and req.plan_id in PLANS:
        base_plan = PLANS[req.plan_id]
    elif chain.LAST_COMMITTED_PLAN_ID and chain.LAST_COMMITTED_PLAN_ID in PLANS:
        base_plan = PLANS[chain.LAST_COMMITTED_PLAN_ID]
    elif PLANS:
        base_plan = list(PLANS.values())[-1]
    else:
        base_plan = solve(scenario, method="optimiser")

    prev_lines = base_plan.get("lines", [])

    # For re-optimisation, the new plan replaces the previous allocation upon commit-diff,
    # so the full scenario inventory is available to reallocate.
    free_qty = None

    # 1. Churn-weighted solve
    churn_result = solve(
        scenario,
        method="optimiser",
        free_qty=free_qty,
        prev_allocation=prev_lines,
        churn_weight=req.churn_weight,
    )

    # 2. From-scratch solve for comparison
    scratch_result = solve(
        scenario,
        method="optimiser",
        free_qty=free_qty,
        prev_allocation=prev_lines,
        churn_weight=0.0,
    )

    new_plan_id = f"{req.scenario_id.lower()}-reoptimised-{PLAN_COUNTER}"
    PLAN_COUNTER += 1
    plan_hash = _compute_canonical_hash(req.scenario_id, churn_result["lines"])
    churn_result["plan_id"] = new_plan_id
    churn_result["plan_hash"] = plan_hash
    PLANS[new_plan_id] = churn_result

    scratch_moved = scratch_result.get("units_moved", 0)
    churn_moved = churn_result.get("units_moved", 0)
    units_saved = max(0, scratch_moved - churn_moved)
    reduction_pct = round((units_saved / max(1, scratch_moved)) * 100, 1)
    extra_cost = round(
        max(0.0, churn_result["totals"]["funding_cost_lakh"] - scratch_result["totals"]["funding_cost_lakh"]),
        4,
    )

    return {
        "plan": churn_result,
        "diff": churn_result.get("diff", []),
        "units_moved": churn_moved,
        "scratch_units_moved": scratch_moved,
        "units_saved": units_saved,
        "reduction_pct": reduction_pct,
        "extra_cost_lakh": extra_cost,
        "prev_plan_id": base_plan.get("plan_id"),
    }


@app.post("/commit-diff")
def commit_diff_plan(req: CommitDiffRequest):
    """Apply the re-optimised diff on-chain: releases old allocation and commits the new one."""
    if req.plan_id not in PLANS:
        raise HTTPException(
            status_code=404,
            detail=f"Plan '{req.plan_id}' not found in memory. Please run /reoptimise first.",
        )
    plan = PLANS[req.plan_id]
    result = chain.commit_diff(plan, old_plan_id=req.old_plan_id, signer="allocator")
    return result


@app.post("/verify")
def verify_allocation(req: VerifyRequest):
    """Cryptographic auditor verification: checks client-recomputed plan hash against on-chain root."""
    if req.plan_id not in PLANS:
        raise HTTPException(
            status_code=404,
            detail=f"Plan '{req.plan_id}' not found in memory.",
        )
    plan = dict(PLANS[req.plan_id])
    plan_hash = plan.get("plan_hash")
    if req.simulate_tamper:
        # Alter the hash to simulate a corrupt database record
        plan_hash = "0x" + "bad0" * 16

    result = chain.verify_plan(req.plan_id, plan_hash)
    return result

