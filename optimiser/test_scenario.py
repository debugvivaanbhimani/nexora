"""Tests for scenario loading and validation."""
from pathlib import Path
import copy
import pytest
from scenario import load_scenario, validate

SCENARIOS_DIR = Path(__file__).resolve().parent.parent / "data" / "scenarios"


@pytest.mark.parametrize("filename", ["ref.json", "ref_short.json", "s1.json", "s2.json", "s3.json", "s5.json"])
def test_all_six_json_files_validate_cleanly(filename):
    path = SCENARIOS_DIR / filename
    assert path.exists(), f"Scenario file not found: {path}"
    data = load_scenario(path)
    errors = validate(data)
    assert errors == [], f"Validation failed for {filename}: {errors}"


def test_broken_duplicate_ids():
    ref_path = SCENARIOS_DIR / "s1.json"
    data = load_scenario(ref_path)
    # Duplicate an asset ID
    data["assets"].append(copy.deepcopy(data["assets"][0]))
    errors = validate(data)
    assert any("Duplicate asset ID" in e for e in errors)


def test_broken_id_format():
    ref_path = SCENARIOS_DIR / "s1.json"
    data = load_scenario(ref_path)
    # Set ID longer than 31 characters
    data["assets"][0]["id"] = "A" * 35
    errors = validate(data)
    assert any("is invalid; must be 1-31 alphanumeric" in e for e in errors)


def test_broken_quantity():
    ref_path = SCENARIOS_DIR / "s1.json"
    data = load_scenario(ref_path)
    # Set negative quantity and non-integer quantity
    data["assets"][0]["quantity"] = -50
    data["assets"][1]["quantity"] = 12.34
    errors = validate(data)
    assert any("invalid quantity '-50'" in e for e in errors)
    assert any("invalid quantity '12.34'" in e for e in errors)


def test_broken_price_and_haircut_bps():
    ref_path = SCENARIOS_DIR / "s1.json"
    data = load_scenario(ref_path)
    data["assets"][0]["price_bps"] = 25000
    data["rules"][0]["haircut_bps"] = 10000
    errors = validate(data)
    assert any("invalid price_bps '25000'" in e for e in errors)
    assert any("invalid haircut_bps '10000'" in e for e in errors)


def test_broken_priority_and_unknown_obligation_rule():
    ref_path = SCENARIOS_DIR / "s1.json"
    data = load_scenario(ref_path)
    data["obligations"][0]["priority"] = 5
    data["obligations"][0]["required_lakh"] = -100
    data["rules"].append({"obligation_id": "NON_EXISTENT_OBL", "class": "CASH", "haircut_bps": 0})
    errors = validate(data)
    assert any("invalid priority '5'" in e for e in errors)
    assert any("invalid required_lakh '-100'" in e for e in errors)
    assert any("references unknown obligation 'NON_EXISTENT_OBL'" in e for e in errors)
