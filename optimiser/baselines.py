"""Baseline heuristics for collateral allocation: cash_first, cheapest_first, scarcity_aware."""
import time
from typing import Any, Dict, List, Optional
from scenario import load_scenario

GOVT_CLASSES = {"TBILL", "GSEC", "GSEC_MID", "GSEC_LONG", "SDL"}


def solve_baseline(
    scenario_input: Any,
    method: str = "cheapest_first",
    free_qty: Optional[Dict[str, int]] = None,
) -> Dict[str, Any]:
    """Execute a baseline heuristic and return the standardized result dictionary."""
    start_time = time.perf_counter()
    scenario = load_scenario(scenario_input)

    assets = {a["id"]: dict(a) for a in scenario["assets"]}
    obligations = {o["id"]: dict(o) for o in scenario["obligations"]}
    rules = {(r["obligation_id"], r["class"]): r["haircut_bps"] for r in scenario["rules"]}

    # Quantities: respect free_qty overrides if provided
    remaining_qty = {}
    total_market_value_lakh = 0.0
    for a_id, a in assets.items():
        qty = free_qty[a_id] if (free_qty and a_id in free_qty) else a["quantity"]
        remaining_qty[a_id] = max(0, int(qty))
        total_market_value_lakh += (remaining_qty[a_id] * a["price_bps"]) / 10000.0

    # Determine obligation ordering and asset sorting based on method
    if method == "cash_first":
        obligation_order = list(obligations.keys())

        def sort_assets(o_id: str, eligible_asset_ids: List[str]) -> List[str]:
            def rank(a_id: str):
                cls = assets[a_id]["class"]
                tier = 0 if cls == "CASH" else (1 if cls in GOVT_CLASSES else 2)
                return (tier, assets[a_id]["funding_cost_bps"], a_id)

            return sorted(eligible_asset_ids, key=rank)

    elif method == "cheapest_first":
        obligation_order = list(obligations.keys())

        def sort_assets(o_id: str, eligible_asset_ids: List[str]) -> List[str]:
            return sorted(
                eligible_asset_ids,
                key=lambda a_id: (assets[a_id]["funding_cost_bps"], a_id),
            )

    elif method == "scarcity_aware":
        # Capacity per obligation
        def obl_capacity(o_id: str) -> float:
            cap = 0.0
            for a_id, a in assets.items():
                if (o_id, a["class"]) in rules:
                    val_unit = (a["price_bps"] * (10000 - rules[(o_id, a["class"])])) / 1e8
                    cap += remaining_qty[a_id] * val_unit
            return cap

        obligation_order = sorted(
            obligations.keys(),
            key=lambda o_id: (
                obl_capacity(o_id) / max(1e-9, obligations[o_id]["required_lakh"]),
                obligations[o_id].get("priority", 3),
            ),
        )

        demand = {a_id: sum(1 for o_id in obligations if (o_id, assets[a_id]["class"]) in rules) for a_id in assets}

        def sort_assets(o_id: str, eligible_asset_ids: List[str]) -> List[str]:
            return sorted(
                eligible_asset_ids,
                key=lambda a_id: (
                    demand[a_id],
                    assets[a_id]["funding_cost_bps"],
                    a_id,
                ),
            )
    else:
        raise ValueError(f"Unknown baseline method: {method}")

    # Greedy allocation loop (strictly integer units)
    allocation_map: Dict[tuple, int] = {}

    for o_id in obligation_order:
        ob = obligations[o_id]
        required_scaled = int(round(ob["required_lakh"] * 1e8))
        current_scaled = 0

        eligible_ids = [a_id for a_id in assets if (o_id, assets[a_id]["class"]) in rules]
        sorted_eligible_ids = sort_assets(o_id, eligible_ids)

        for a_id in sorted_eligible_ids:
            if current_scaled >= required_scaled or remaining_qty[a_id] <= 0:
                continue

            h_bps = rules[(o_id, assets[a_id]["class"])]
            val_unit_scaled = assets[a_id]["price_bps"] * (10000 - h_bps)
            if val_unit_scaled <= 0:
                continue

            needed_scaled = required_scaled - current_scaled
            units_needed = (needed_scaled + val_unit_scaled - 1) // val_unit_scaled
            take = min(remaining_qty[a_id], units_needed)

            if take > 0:
                allocation_map[(a_id, o_id)] = take
                remaining_qty[a_id] -= take
                current_scaled += take * val_unit_scaled

    # Build response lines and reasons
    allocated_other: Dict[str, List[str]] = {}
    for (a_id, o_id), u in allocation_map.items():
        allocated_other.setdefault(a_id, []).append(o_id)

    lines: List[Dict[str, Any]] = []
    total_funding_cost_lakh = 0.0
    allocated_market_value_lakh = 0.0

    for (a_id, o_id), units in allocation_map.items():
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
            allocation_map.get((a_id, o_id), 0) * assets[a_id]["price_bps"] * (10000 - rules[(o_id, assets[a_id]["class"])])
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
        "status": "optimal",
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
