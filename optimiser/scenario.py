"""Scenario loading and validation for Nexora collateral allocation."""
import json
import re
import warnings
from pathlib import Path
from typing import Any, Dict, List, Union

ID_PATTERN = re.compile(r"^[A-Za-z0-9_]{1,31}$")


def load_scenario(path_or_dict: Union[str, Path, Dict[str, Any]]) -> Dict[str, Any]:
    """Load and return a scenario dictionary from a file path or dict."""
    if isinstance(path_or_dict, dict):
        return json.loads(json.dumps(path_or_dict))
    path = Path(path_or_dict)
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def validate(scenario: Dict[str, Any]) -> List[str]:
    """Validate a scenario against frozen schema requirements.
    
    Returns an empty list if valid, or a list of plain-English error descriptions.
    """
    errors: List[str] = []

    if not isinstance(scenario, dict):
        return ["Scenario must be a dictionary."]

    # Scenario ID
    scen_id = scenario.get("id")
    if not scen_id or not isinstance(scen_id, str) or not ID_PATTERN.match(scen_id):
        errors.append(f"Scenario ID '{scen_id}' is invalid; must be 1-31 alphanumeric characters or underscores.")

    assets = scenario.get("assets", [])
    if not isinstance(assets, list):
        errors.append("Field 'assets' must be a list.")
        assets = []

    obligations = scenario.get("obligations", [])
    if not isinstance(obligations, list):
        errors.append("Field 'obligations' must be a list.")
        obligations = []

    rules = scenario.get("rules", [])
    if not isinstance(rules, list):
        errors.append("Field 'rules' must be a list.")
        rules = []

    # 1. Assets Validation
    seen_asset_ids = set()
    asset_classes = set()
    for idx, asset in enumerate(assets):
        if not isinstance(asset, dict):
            errors.append(f"Asset at index {idx} must be an object.")
            continue

        aid = asset.get("id")
        if not aid or not isinstance(aid, str) or not ID_PATTERN.match(aid):
            errors.append(f"Asset ID '{aid}' at index {idx} is invalid; must be 1-31 alphanumeric characters or underscores.")
        elif aid in seen_asset_ids:
            errors.append(f"Duplicate asset ID '{aid}' found.")
        else:
            seen_asset_ids.add(aid)

        cls = asset.get("class")
        if not cls or not isinstance(cls, str):
            errors.append(f"Asset '{aid}' has invalid class; must be a non-empty string.")
        else:
            asset_classes.add(cls)

        qty = asset.get("quantity")
        if not isinstance(qty, int) or isinstance(qty, bool) or qty < 0:
            errors.append(f"Asset '{aid}' has invalid quantity '{qty}'; must be an integer >= 0.")

        price_bps = asset.get("price_bps")
        if not isinstance(price_bps, int) or isinstance(price_bps, bool) or not (1 <= price_bps <= 20000):
            errors.append(f"Asset '{aid}' has invalid price_bps '{price_bps}'; must be an integer between 1 and 20000.")

        funding_cost_bps = asset.get("funding_cost_bps")
        if not isinstance(funding_cost_bps, int) or isinstance(funding_cost_bps, bool) or funding_cost_bps < 0:
            errors.append(f"Asset '{aid}' has invalid funding_cost_bps '{funding_cost_bps}'; must be an integer >= 0.")

    # 2. Obligations Validation
    seen_obligation_ids = set()
    for idx, obl in enumerate(obligations):
        if not isinstance(obl, dict):
            errors.append(f"Obligation at index {idx} must be an object.")
            continue

        oid = obl.get("id")
        if not oid or not isinstance(oid, str) or not ID_PATTERN.match(oid):
            errors.append(f"Obligation ID '{oid}' at index {idx} is invalid; must be 1-31 alphanumeric characters or underscores.")
        elif oid in seen_obligation_ids:
            errors.append(f"Duplicate obligation ID '{oid}' found.")
        else:
            seen_obligation_ids.add(oid)

        req = obl.get("required_lakh")
        if not isinstance(req, (int, float)) or isinstance(req, bool) or req <= 0:
            errors.append(f"Obligation '{oid}' has invalid required_lakh '{req}'; must be > 0.")

        priority = obl.get("priority")
        if priority not in {1, 2, 3}:
            errors.append(f"Obligation '{oid}' has invalid priority '{priority}'; must be 1, 2, or 3.")

    # 3. Rules Validation
    rule_classes = set()
    for idx, rule in enumerate(rules):
        if not isinstance(rule, dict):
            errors.append(f"Rule at index {idx} must be an object.")
            continue

        obl_id = rule.get("obligation_id")
        if obl_id not in seen_obligation_ids:
            errors.append(f"Rule at index {idx} references unknown obligation '{obl_id}'.")

        cls = rule.get("class")
        if not cls or not isinstance(cls, str):
            errors.append(f"Rule at index {idx} has invalid class; must be a non-empty string.")
        else:
            rule_classes.add(cls)

        h_bps = rule.get("haircut_bps")
        if not isinstance(h_bps, int) or isinstance(h_bps, bool) or not (0 <= h_bps <= 9999):
            errors.append(f"Rule for obligation '{obl_id}' and class '{cls}' has invalid haircut_bps '{h_bps}'; must be an integer between 0 and 9999.")

    # 4. Warn on classes not present in any asset
    unused_classes = rule_classes - asset_classes
    if unused_classes:
        warnings.warn(
            f"Rules reference classes not present in any asset: {sorted(unused_classes)}",
            UserWarning,
            stacklevel=2,
        )

    return errors
