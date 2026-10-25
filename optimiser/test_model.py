"""Comprehensive tests for the two-stage optimiser and baseline heuristics."""
from pathlib import Path
import pytest
from model import solve
from scenario import load_scenario

SCENARIOS_DIR = Path(__file__).resolve().parent.parent / "data" / "scenarios"
SCENARIO_FILES = ["ref.json", "ref_short.json", "s1.json", "s2.json", "s3.json", "s5.json"]


def test_ref_optimiser():
    res = solve(SCENARIOS_DIR / "ref.json", method="optimiser")
    assert res["status"] == "optimal"
    assert all(c["covered"] for c in res["coverage"])
    assert res["totals"]["shortfall_lakh"] == 0.0
    assert abs(res["totals"]["funding_cost_lakh"] - 275.97) <= 0.5


def test_ref_short_optimiser_priority_protection():
    res = solve(SCENARIOS_DIR / "ref_short.json", method="optimiser")
    assert res["status"] == "optimal"
    cov_map = {c["obligation_id"]: c for c in res["coverage"]}
    # Priority 1 (O1) and Priority 2 (O2) must be fully covered
    assert cov_map["O1"]["covered"] is True
    assert cov_map["O2"]["covered"] is True
    # Priority 3 (O3) takes the unavoidable shortfall
    assert cov_map["O3"]["covered"] is False
    assert abs(cov_map["O3"]["shortfall_lakh"] - 1665.11) <= 0.5


def test_ref_cheapest_first_baseline():
    res = solve(SCENARIOS_DIR / "ref.json", method="cheapest_first")
    cov_map = {c["obligation_id"]: c for c in res["coverage"]}
    assert abs(cov_map["O3"]["shortfall_lakh"] - 2666.0) <= 0.5
    assert abs(res["totals"]["funding_cost_lakh"] - 102.75) <= 0.5


def test_s1_optimiser():
    res = solve(SCENARIOS_DIR / "s1.json", method="optimiser")
    assert all(c["covered"] for c in res["coverage"])
    assert res["totals"]["shortfall_lakh"] == 0.0
    assert abs(res["totals"]["funding_cost_lakh"] - 116.16) <= 0.5


def test_s2_optimiser():
    res = solve(SCENARIOS_DIR / "s2.json", method="optimiser")
    cov_map = {c["obligation_id"]: c for c in res["coverage"]}
    assert cov_map["X"]["covered"] is True
    assert cov_map["Y"]["covered"] is False
    assert abs(cov_map["Y"]["shortfall_lakh"] - 2171.5) <= 0.5
    assert abs(res["totals"]["funding_cost_lakh"] - 201.0) <= 0.5


def test_s3_ineligible_collateral_optimiser():
    res = solve(SCENARIOS_DIR / "s3.json", method="optimiser")
    assert len(res["lines"]) == 0
    assert len(res["coverage"]) == 1
    assert res["coverage"][0]["shortfall_lakh"] == 2000.0
    assert res["coverage"][0]["reason"] == "no eligible assets"


def test_s5_discounted_price_optimiser():
    res = solve(SCENARIOS_DIR / "s5.json", method="optimiser")
    assert all(c["covered"] for c in res["coverage"])
    assert res["totals"]["shortfall_lakh"] == 0.0
    assert abs(res["totals"]["funding_cost_lakh"] - 119.52) <= 0.5


@pytest.mark.parametrize("filename", SCENARIO_FILES)
@pytest.mark.parametrize("method", ["optimiser", "cash_first", "cheapest_first", "scarcity_aware"])
def test_property_tests(filename, method):
    scen_path = SCENARIOS_DIR / filename
    scen = load_scenario(scen_path)
    res = solve(scen_path, method=method)

    assets = {a["id"]: a for a in scen["assets"]}
    rules = {(r["obligation_id"], r["class"]): r["haircut_bps"] for r in scen["rules"]}

    # Property 1: No ineligible pair is ever allocated
    for line in res["lines"]:
        a_id = line["asset_id"]
        o_id = line["obligation_id"]
        assert a_id in assets, f"Unknown asset {a_id}"
        a_cls = assets[a_id]["class"]
        assert (o_id, a_cls) in rules, f"Ineligible pair allocated: {a_id} ({a_cls}) to {o_id}"
        assert line["haircut_bps"] == rules[(o_id, a_cls)]
        assert line["units"] > 0

    # Property 2: Total allocated units per asset <= initial quantity
    allocated_per_asset = {}
    for line in res["lines"]:
        allocated_per_asset[line["asset_id"]] = allocated_per_asset.get(line["asset_id"], 0) + line["units"]

    for a_id, a in assets.items():
        total_used = allocated_per_asset.get(a_id, 0)
        assert total_used <= a["quantity"], f"Over-allocation for asset {a_id}: {total_used} > {a['quantity']}"

    # Property 3: Remaining units match
    for rem in res["remaining"]:
        a_id = rem["asset_id"]
        assert rem["units"] == assets[a_id]["quantity"] - allocated_per_asset.get(a_id, 0)

    # Property 4: Determinism (same input produces identical output)
    res2 = solve(scen_path, method=method)
    assert res["totals"] == res2["totals"]
    assert len(res["lines"]) == len(res2["lines"])
