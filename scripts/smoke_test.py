#!/usr/bin/env python3
"""End-to-end smoke test for Nexora collateral allocation & blockchain ledger.

Workflow:
  1. GET  /health   - Verify Hardhat connectivity
  2. POST /reset    - Re-deploy & seed scenario REF on-chain
  3. POST /optimise - Run 2-stage LP solver for REF
  4. POST /commit   - Commit plan to smart contract
  5. GET  /state    - CROSS-CHECK: on-chain available == optimiser remaining
  6. POST /attack   - Verify all 5 attack vectors revert with custom EVM errors
  7. GET  /events   - Verify on-chain logs merged with rejection audit trail

Exits with code 0 on full PASS, 1 on any failure.
"""

import sys
import time
from typing import Any, Dict
import urllib.request
import urllib.error
import json

BASE_URL = "http://localhost:8000"

# ANSI Colors
GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
CYAN = "\033[96m"
BOLD = "\033[1m"
RESET = "\033[0m"


def log_pass(msg: str) -> None:
    print(f" {GREEN}✓ PASS{RESET} {msg}")


def log_fail(msg: str) -> None:
    print(f" {RED}✗ FAIL{RESET} {RED}{msg}{RESET}")


def http_req(path: str, data: Dict[str, Any] = None) -> Dict[str, Any]:
    url = f"{BASE_URL}{path}"
    headers = {"Content-Type": "application/json"}
    body = json.dumps(data).encode("utf-8") if data is not None else None
    req = urllib.request.Request(url, data=body, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        err_content = e.read().decode("utf-8")
        try:
            return json.loads(err_content)
        except Exception:
            raise RuntimeError(f"HTTP {e.code}: {err_content}")
    except Exception as exc:
        raise RuntimeError(f"Failed to connect to {url}: {exc}")


def run_smoke_test() -> int:
    print(f"\n{BOLD}{CYAN}============================================================{RESET}")
    print(f"{BOLD}{CYAN}  Nexora End-to-End System Smoke Test{RESET}")
    print(f"{BOLD}{CYAN}============================================================{RESET}\n")

    failures = 0

    # 1. Health check
    try:
        h = http_req("/health")
        if h.get("ok") and h.get("chain_connected") and h.get("chain_id") == 31337:
            log_pass(f"Step 1: /health - Chain connected (Chain ID {h.get('chain_id')}, Block #{h.get('block')})")
        else:
            log_fail(f"Step 1: /health - Unexpected response: {h}")
            failures += 1
    except Exception as e:
        log_fail(f"Step 1: /health failed: {e}")
        return 1

    # 2. Reset scenario REF
    try:
        r = http_req("/reset", {"scenario_id": "ref"})
        if r.get("ok") and r.get("scenario_id") == "REF" and r.get("address"):
            log_pass(f"Step 2: /reset - Deployed CollateralLedger to {r.get('address')[:10]}… and seeded REF")
        else:
            log_fail(f"Step 2: /reset - Failed: {r}")
            failures += 1
    except Exception as e:
        log_fail(f"Step 2: /reset failed: {e}")
        return 1

    # 3. Optimise scenario REF
    plan_id = None
    plan = None
    try:
        plan = http_req("/optimise", {"scenario_id": "ref", "method": "optimiser"})
        plan_id = plan.get("plan_id")
        totals = plan.get("totals", {})
        if plan.get("status") == "optimal" and plan_id and totals.get("shortfall_lakh") == 0:
            runtime = plan.get("runtime_ms", 0)
            cost = totals.get("funding_cost_lakh", 0)
            log_pass(f"Step 3: /optimise - Optimal plan '{plan_id}' solved in {runtime} ms (Cost: ₹{cost:.2f}L, Shortfall: 0)")
        else:
            log_fail(f"Step 3: /optimise - Failed or non-optimal: {plan}")
            failures += 1
    except Exception as e:
        log_fail(f"Step 3: /optimise failed: {e}")
        return 1

    # 4. Commit plan to smart contract
    try:
        commit_res = http_req("/commit", {"plan_id": plan_id})
        if commit_res.get("ok") and commit_res.get("tx_hash") and commit_res.get("block"):
            log_pass(f"Step 4: /commit - Plan sealed in block #{commit_res.get('block')} (tx: {commit_res.get('tx_hash')[:10]}…)")
        else:
            log_fail(f"Step 4: /commit - Failed: {commit_res}")
            failures += 1
    except Exception as e:
        log_fail(f"Step 4: /commit failed: {e}")
        return 1

    # 5. On-chain state & CROSS-CHECK with optimiser remaining
    try:
        state_list = http_req("/state")
        if isinstance(state_list, dict) and "assets" in state_list:
            state_list = state_list["assets"]

        on_chain_available = {a["asset_id"]: a["available"] for a in state_list}
        optimiser_remaining = {r["asset_id"]: r["units"] for r in plan.get("remaining", [])}

        mismatches = []
        for aid, rem_units in optimiser_remaining.items():
            chain_units = on_chain_available.get(aid)
            if chain_units != rem_units:
                mismatches.append(f"{aid}: on-chain {chain_units} != optimiser {rem_units}")

        if mismatches:
            log_fail(f"Step 5: /state - CROSS-CHECK FAILED! Asset quantity mismatches:\n         " + "\n         ".join(mismatches))
            failures += 1
        else:
            sample = ", ".join(f"{k}:{v}" for k, v in list(on_chain_available.items())[:3])
            log_pass(f"Step 5: /state - CROSS-CHECK PASS: on-chain available == optimiser remaining for all assets ({sample}…)")
    except Exception as e:
        log_fail(f"Step 5: /state failed: {e}")
        failures += 1

    # 6. Test all 5 attack vectors
    expected_attacks = {
        "double_pledge": "InsufficientQuantity",
        "duplicate": "DuplicateAllocation",
        "excessive": "InsufficientQuantity",
        "ineligible": "Ineligible",
        "stale": "StalePlan",
    }

    print(f"\n {BOLD}Adversarial Firewall Control Testing:{RESET}")
    for attack_type, expected_err in expected_attacks.items():
        try:
            atk_res = http_req("/attack", {"type": attack_type})
            if atk_res.get("ok") is False and atk_res.get("error") == expected_err:
                log_pass(f"Step 6 ({attack_type}): Blocked with EVM error '{expected_err}'")
            else:
                log_fail(f"Step 6 ({attack_type}): Expected error '{expected_err}', got: {atk_res}")
                failures += 1
        except Exception as e:
            log_fail(f"Step 6 ({attack_type}) failed: {e}")
            failures += 1

    # 7. Query audit events
    try:
        events = http_req("/events")
        if isinstance(events, list) and len(events) >= 10:
            types = {e.get("type") for e in events}
            has_reserved = "Reserved" in types
            has_committed = "AllocationCommitted" in types
            has_rejected = "Rejected" in types
            if has_reserved and has_committed and has_rejected:
                log_pass(f"Step 7: /events - Retrieved {len(events)} audit logs (Reserved, AllocationCommitted, Rejected)")
            else:
                log_fail(f"Step 7: /events - Missing event types. Found: {types}")
                failures += 1
        else:
            log_fail(f"Step 7: /events - Insufficient logs retrieved: {len(events) if isinstance(events, list) else events}")
            failures += 1
    except Exception as e:
        log_fail(f"Step 7: /events failed: {e}")
        failures += 1

    print(f"\n{BOLD}{CYAN}============================================================{RESET}")
    if failures == 0:
        print(f"{BOLD}{GREEN}  ALL SMOKE TEST STEPS PASSED SUCCESSFULLY! (0 failures){RESET}")
        print(f"{BOLD}{CYAN}============================================================{RESET}\n")
        return 0
    else:
        print(f"{BOLD}{RED}  SMOKE TEST FAILED with {failures} error(s)!{RESET}")
        print(f"{BOLD}{CYAN}============================================================{RESET}\n")
        return 1


if __name__ == "__main__":
    sys.exit(run_smoke_test())
