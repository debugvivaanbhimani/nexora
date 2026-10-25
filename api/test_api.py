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
