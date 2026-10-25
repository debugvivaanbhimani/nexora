"""Integration tests for the Nexora FastAPI backend service."""
from pathlib import Path
import pytest
from starlette.testclient import TestClient
import sys

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.append(str(BASE_DIR / "api"))
sys.path.append(str(BASE_DIR / "optimiser"))

import main
import chain

client = TestClient(main.app)


def test_api_health():
    res = client.get("/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert data["chain_connected"] is True
    assert data["chain_id"] == 31337


def test_api_scenarios_listing():
    res = client.get("/scenarios")
    assert res.status_code == 200
    scenarios = res.json()
    assert len(scenarios) >= 6
    ids = [s["id"] for s in scenarios]
    assert "REF" in ids
    assert "S1" in ids


def test_api_full_workflow_and_attacks():
    # 1. Reset
    reset_res = client.post("/reset", json={"scenario_id": "ref"})
    assert reset_res.status_code == 200
    assert reset_res.json()["ok"] is True

    # 2. State before
    state_0 = {a["asset_id"]: a["available"] for a in client.get("/state").json()}
    assert state_0["CASH"] == 3000

    # 3. Optimise
    opt_res = client.post("/optimise", json={"scenario_id": "ref", "method": "optimiser"})
    assert opt_res.status_code == 200
    plan = opt_res.json()
    plan_id = plan["plan_id"]
    assert "ref-optimiser-" in plan_id
    assert abs(plan["totals"]["funding_cost_lakh"] - 275.97) <= 0.5

    # 4. Compare
    cmp_res = client.post("/compare", json={"scenario_id": "ref"})
    assert cmp_res.status_code == 200
    cmp_data = cmp_res.json()
    assert "optimiser" in cmp_data
    assert "cheapest_first" in cmp_data

    # 5. Commit
    cmt_res = client.post("/commit", json={"plan_id": plan_id})
    assert cmt_res.status_code == 200
    assert cmt_res.json()["ok"] is True
    assert "tx_hash" in cmt_res.json()

    # 6. State after (availability reduced)
    state_1 = {a["asset_id"]: a["available"] for a in client.get("/state").json()}
    assert state_1["CASH"] < state_0["CASH"]

    # 7. Attacks
    expected_attacks = {
        "double_pledge": "InsufficientQuantity",
        "duplicate": "DuplicateAllocation",
        "excessive": "InsufficientQuantity",
        "ineligible": "Ineligible",
        "stale": "StalePlan",
    }
    for at_type, exp_err in expected_attacks.items():
        atk_res = client.post("/attack", json={"type": at_type})
        assert atk_res.status_code == 200
        res_data = atk_res.json()
        assert res_data["ok"] is False
        assert res_data["error"] == exp_err

    # 8. Events
    ev_res = client.get("/events")
    assert ev_res.status_code == 200
    events = ev_res.json()
    assert len(events) >= 10
    types = [e["type"] for e in events]
    assert "Reserved" in types
    assert "AllocationCommitted" in types
    assert "Rejected" in types


def test_market_shock_reoptimise_and_verify():
    """Test market price shock, churn-minimizing reoptimisation, commit-diff, and auditor proof."""
    # 1. Reset
    client.post("/reset", json={"scenario_id": "ref"})

    # 2. Optimise baseline & commit
    opt = client.post("/optimise", json={"scenario_id": "ref"}).json()
    base_id = opt["plan_id"]
    cmt = client.post("/commit", json={"plan_id": base_id}).json()
    assert cmt["ok"] is True

    # 3. Auditor verification before shock
    ver = client.post("/verify", json={"plan_id": base_id}).json()
    assert ver["ok"] is True
    assert ver["verified"] is True
    assert ver["tampered"] is False

    # 4. Tamper detection test
    tamper = client.post("/verify", json={"plan_id": base_id, "simulate_tamper": True}).json()
    assert tamper["ok"] is True
    assert tamper["tampered"] is True
    assert tamper["verified"] is False

    # 5. Apply market price shock (-20% Equity, -5% Corp AAA)
    shock = client.post(
        "/shock",
        json={"scenario_id": "ref", "class_moves": {"EQUITY": -2000, "CORP_AAA": -500}},
    ).json()
    assert shock["total_shortfall_lakh"] > 0
    assert len(shock["under_covered"]) >= 1

    # 6. Re-optimise with churn minimization
    reopt = client.post(
        "/reoptimise",
        json={"scenario_id": "ref", "plan_id": base_id, "churn_weight": 0.0002},
    ).json()
    new_plan = reopt["plan"]
    assert new_plan["plan_id"] != base_id
    assert new_plan["totals"]["shortfall_lakh"] == 0 or new_plan["totals"]["shortfall_lakh"] < shock["total_shortfall_lakh"]
    assert reopt["units_moved"] <= reopt["scratch_units_moved"]
    assert len(reopt["diff"]) > 0

    # 7. Commit diff on-chain
    diff_res = client.post("/commit-diff", json={"plan_id": new_plan["plan_id"]}).json()
    assert diff_res["ok"] is True
    assert diff_res["released_plan_id"] == base_id

    # 8. Auditor verification of re-optimised plan
    ver2 = client.post("/verify", json={"plan_id": new_plan["plan_id"]}).json()
    assert ver2["ok"] is True
    assert ver2["verified"] is True
    assert ver2["tampered"] is False

