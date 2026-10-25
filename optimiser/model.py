"""Two-stage optimal collateral allocation engine using PuLP and HiGHS."""
import time
from typing import Any, Dict, List, Optional
import pulp

from scenario import load_scenario
from baselines import solve_baseline


def solve(
    scenario_input: Any,
    method: str = "optimiser",
    free_qty: Optional[Dict[str, int]] = None,
) -> Dict[str, Any]:
    """Solve the collateral allocation problem using either the two-stage optimiser or a baseline."""
    if method != "optimiser":
        return solve_baseline(scenario_input, method=method, free_qty=free_qty)

    start_time = time.perf_counter()
    scenario = load_scenario(scenario_input)

    assets = {a["id"]: dict(a) for a in scenario["assets"]}
    obligations = {o["id"]: dict(o) for o in scenario["obligations"]}
    rules = {(r["obligation_id"], r["class"]): r["haircut_bps"] for r in scenario["rules"]}

    # Quantities: respect free_qty overrides if provided
    total_market_value_lakh = 0.0
    qty = {}
    for a_id, a in assets.items():
        q = free_qty[a_id] if (free_qty and a_id in free_qty) else a["quantity"]
        qty[a_id] = max(0, int(q))
        total_market_value_lakh += (qty[a_id] * a["price_bps"]) / 10000.0

    # Eligible pairs
    eligible_pairs = [
        (a_id, o_id)
        for o_id, ob in obligations.items()
        for a_id, a in assets.items()
        if (o_id, a["class"]) in rules and qty[a_id] > 0
    ]

    # Quick check if no eligible pairs exist at all
    if not eligible_pairs:
        coverage_list = []
        total_shortfall_lakh = 0.0
        for o_id, ob in obligations.items():
            req = float(ob["required_lakh"])
            total_shortfall_lakh += req
            # Check if any asset class matched obligation
            has_matching_class = any(
                (o_id, a["class"]) in rules for a in assets.values()
            )
            obl_reason = (
                "eligible inventory exhausted"
                if has_matching_class
                else "no eligible assets"
            )
            coverage_list.append(
                {
                    "obligation_id": o_id,
                    "required_lakh": round(req, 4),
                    "usable_scaled": 0,
                    "covered_lakh": 0.0,
                    "covered": False,
                    "shortfall_lakh": round(req, 5),
                    "reason": obl_reason,
                }
            )

        remaining_list = [{"asset_id": a_id, "units": qty[a_id]} for a_id in assets]
        runtime_ms = round((time.perf_counter() - start_time) * 1000, 2)
        return {
            "scenario_id": scenario.get("id", "UNKNOWN"),
            "method": method,
            "status": "optimal",
            "lines": [],
            "coverage": coverage_list,
            "remaining": remaining_list,
            "totals": {
                "funding_cost_lakh": 0.0,
                "shortfall_lakh": round(total_shortfall_lakh, 4),
                "effective_cost_lakh": round(total_shortfall_lakh * 0.09, 4),
                "utilisation_pct": 0.0,
            },
            "runtime_ms": runtime_ms,
        }

    # Variables
    x = {
        (a_id, o_id): pulp.LpVariable(
            f"x_{a_id}_{o_id}", lowBound=0, upBound=qty[a_id], cat="Integer"
        )
        for (a_id, o_id) in eligible_pairs
    }
    s = {o_id: pulp.LpVariable(f"s_{o_id}", lowBound=0, cat="Continuous") for o_id in obligations}

    def usable_coeff(a_id: str, o_id: str) -> float:
        h_bps = rules[(o_id, assets[a_id]["class"])]
        return (assets[a_id]["price_bps"] * (10000 - h_bps)) / 1e8

    cost_coeff = {
        a_id: (assets[a_id]["price_bps"] / 10000.0) * (assets[a_id]["funding_cost_bps"] / 10000.0)
        for a_id in assets
    }

    # Stage 1: Minimize priority-weighted shortfall
    W = {1: 100.0, 2: 10.0, 3: 1.0}
    m1 = pulp.LpProblem("Stage1_MinShortfall", pulp.LpMinimize)
    m1 += pulp.lpSum(W.get(obligations[o_id].get("priority", 3), 1.0) * s[o_id] for o_id in obligations)

    for o_id, ob in obligations.items():
        m1 += (
            pulp.lpSum(
                x[a_id, o_id] * usable_coeff(a_id, o_id)
                for a_id in assets
                if (a_id, o_id) in x
            )
            + s[o_id]
            >= ob["required_lakh"],
            f"cov1_{o_id}",
        )

    for a_id in assets:
        m1 += (
            pulp.lpSum(x[a_id, o_id] for o_id in obligations if (a_id, o_id) in x) <= qty[a_id],
            f"qty1_{a_id}",
        )

    solver = pulp.HiGHS(msg=False, timeLimit=10)
    m1.solve(solver)

    if m1.status not in (pulp.LpStatusOptimal, 1):
        # Fallback to scarcity aware if solver issues arise
        res = solve_baseline(scenario, method="scarcity_aware", free_qty=free_qty)
        res["status"] = "fallback"
        return res

    S_star = sum(
        W.get(obligations[o_id].get("priority", 3), 1.0) * (s[o_id].value() or 0.0)
        for o_id in obligations
    )

    # Stage 2: Minimize funding cost subject to minimal shortfall
    m2 = pulp.LpProblem("Stage2_MinFundingCost", pulp.LpMinimize)
    m2 += pulp.lpSum(x[a_id, o_id] * cost_coeff[a_id] for (a_id, o_id) in x)

    for o_id, ob in obligations.items():
        m2 += (
            pulp.lpSum(
                x[a_id, o_id] * usable_coeff(a_id, o_id)
                for a_id in assets
                if (a_id, o_id) in x
            )
            + s[o_id]
            >= ob["required_lakh"],
            f"cov2_{o_id}",
        )

    for a_id in assets:
        m2 += (
            pulp.lpSum(x[a_id, o_id] for o_id in obligations if (a_id, o_id) in x) <= qty[a_id],
            f"qty2_{a_id}",
        )

    m2 += (
        pulp.lpSum(
            W.get(obligations[o_id].get("priority", 3), 1.0) * s[o_id] for o_id in obligations
        )
        <= S_star + 1e-4,
        "shortfall_cap",
    )

    solver2 = pulp.HiGHS(msg=False, timeLimit=10, gapRel=0.0001)
    m2.solve(solver2)

    status_str = "optimal"
    if m2.status not in (pulp.LpStatusOptimal, 1):
        if "Time" in str(pulp.LpStatus[m2.status]):
            status_str = "time_limit"
        else:
            status_str = "fallback"

    # Extract allocations
    allocation_map: Dict[tuple, int] = {}
    remaining_qty = dict(qty)

    for (a_id, o_id), var in x.items():
        val = var.value()
        val_int = int(round(val)) if val and val > 1e-6 else 0
        if val_int > 0:
            allocation_map[(a_id, o_id)] = val_int
            remaining_qty[a_id] -= val_int

    # Integer verification & rounding adjustment
    for o_id, ob in obligations.items():
        req_scaled = int(round(ob["required_lakh"] * 1e8))
        usable_scaled = sum(
            allocation_map.get((a_id, o_id), 0)
            * assets[a_id]["price_bps"]
            * (10000 - rules[(o_id, assets[a_id]["class"])])
            for a_id in assets
            if (o_id, assets[a_id]["class"]) in rules
        )

        if usable_scaled < req_scaled:
            # Check if short only by rounding (< 1 unit of usable value)
            shortfall_lakh = (req_scaled - usable_scaled) / 1e8
            if shortfall_lakh < 1.0:
                eligible_stock = [
                    a_id
                    for a_id in assets
                    if (o_id, assets[a_id]["class"]) in rules and remaining_qty[a_id] > 0
                ]
                eligible_stock.sort(
                    key=lambda a_id: (assets[a_id]["funding_cost_bps"], a_id)
                )

                for _ in range(5):
                    if usable_scaled >= req_scaled or not eligible_stock:
                        break
                    best_a = eligible_stock[0]
                    allocation_map[(best_a, o_id)] = allocation_map.get((best_a, o_id), 0) + 1
                    remaining_qty[best_a] -= 1
                    usable_scaled += assets[best_a]["price_bps"] * (
                        10000 - rules[(o_id, assets[best_a]["class"])]
                    )
                    if remaining_qty[best_a] <= 0:
                        eligible_stock.pop(0)

    # Build response lines and reasons
    allocated_other: Dict[str, List[str]] = {}
    for (a_id, o_id), u in allocation_map.items():
        if u > 0:
            allocated_other.setdefault(a_id, []).append(o_id)

    lines: List[Dict[str, Any]] = []
    total_funding_cost_lakh = 0.0
    allocated_market_value_lakh = 0.0

    for (a_id, o_id), units in sorted(allocation_map.items()):
        if units <= 0:
            continue
        a = assets[a_id]
        h_bps = rules[(o_id, a["class"])]
        usable_unit_scaled = a["price_bps"] * (10000 - h_bps)
        line_usable_scaled = units * usable_unit_scaled
        line_usable_lakh = round(line_usable_scaled / 1e8, 5)

        mkt_val = (units * a["price_bps"]) / 10000.0
        ann_cost = mkt_val * (a["funding_cost_bps"] / 10000.0)

        allocated_market_value_lakh += mkt_val
        total_funding_cost_lakh += ann_cost

        # Line reason
        cheaper_diverted = []
        for other_a_id, other_a in assets.items():
            if (o_id, other_a["class"]) in rules and other_a["funding_cost_bps"] < a["funding_cost_bps"]:
                other_obls = [x for x in allocated_other.get(other_a_id, []) if x != o_id]
                if other_obls:
                    cheaper_diverted.extend(other_obls)

        if cheaper_diverted:
            reason = f"used because cheaper eligible assets are allocated to {', '.join(sorted(set(cheaper_diverted)))}"
        else:
            reason = "cheapest eligible asset still free"

        lines.append(
            {
                "asset_id": a_id,
                "obligation_id": o_id,
                "units": units,
                "market_value_lakh": round(mkt_val, 4),
                "haircut_bps": h_bps,
                "usable_lakh": line_usable_lakh,
                "annual_cost_lakh": round(ann_cost, 5),
                "reason": reason,
            }
        )

    # Coverage records
    coverage_list: List[Dict[str, Any]] = []
    total_shortfall_lakh = 0.0

    for o_id, ob in obligations.items():
        req_scaled = int(round(ob["required_lakh"] * 1e8))
        usable_scaled = sum(
            allocation_map.get((a_id, o_id), 0)
            * assets[a_id]["price_bps"]
            * (10000 - rules[(o_id, assets[a_id]["class"])])
            for a_id in assets
            if (o_id, assets[a_id]["class"]) in rules
        )
        covered = usable_scaled >= req_scaled
        covered_lakh = round(usable_scaled / 1e8, 5)
        shortfall_lakh = 0.0 if covered else round(max(0.0, ob["required_lakh"] - covered_lakh), 5)
        total_shortfall_lakh += shortfall_lakh

        # Obligation reason
        eligible_assets_for_o = [a_id for a_id in assets if (o_id, assets[a_id]["class"]) in rules]
        if not eligible_assets_for_o:
            obl_reason = "no eligible assets"
        elif not covered and sum(remaining_qty[a_id] for a_id in eligible_assets_for_o) == 0:
            obl_reason = "eligible inventory exhausted"
        else:
            obl_reason = ""

        coverage_list.append(
            {
                "obligation_id": o_id,
                "required_lakh": round(float(ob["required_lakh"]), 4),
                "usable_scaled": int(usable_scaled),
                "covered_lakh": covered_lakh,
                "covered": covered,
                "shortfall_lakh": shortfall_lakh,
                "reason": obl_reason,
            }
        )

    remaining_list = [{"asset_id": a_id, "units": remaining_qty[a_id]} for a_id in assets]

    utilisation_pct = (
        round((allocated_market_value_lakh / total_market_value_lakh) * 100, 2)
        if total_market_value_lakh > 0
        else 0.0
    )
    effective_cost_lakh = round(total_funding_cost_lakh + (total_shortfall_lakh * 0.09), 4)
    runtime_ms = round((time.perf_counter() - start_time) * 1000, 2)

    return {
        "scenario_id": scenario.get("id", "UNKNOWN"),
        "method": method,
        "status": status_str,
        "lines": lines,
        "coverage": coverage_list,
        "remaining": remaining_list,
        "totals": {
            "funding_cost_lakh": round(total_funding_cost_lakh, 4),
            "shortfall_lakh": round(total_shortfall_lakh, 4),
            "effective_cost_lakh": effective_cost_lakh,
            "utilisation_pct": utilisation_pct,
        },
        "runtime_ms": runtime_ms,
    }
