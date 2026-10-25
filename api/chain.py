"""Blockchain interaction layer for Nexora using Web3.py."""
import datetime
import json
import os
import re
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import eth_abi
from web3 import Web3
from web3.exceptions import ContractLogicError

BASE_DIR = Path(__file__).resolve().parent.parent
DEPLOYMENT_PATH = BASE_DIR / "shared" / "deployment.json"
ARTIFACT_PATH = (
    BASE_DIR
    / "contracts"
    / "artifacts"
    / "contracts"
    / "CollateralLedger.sol"
    / "CollateralLedger.json"
)
SCENARIOS_DIR = BASE_DIR / "data" / "scenarios"

RPC_URL = "http://127.0.0.1:8545"

# In-memory rejection log: stores failed transactions and attack results
REJECTIONS: List[Dict[str, Any]] = []
LAST_COMMITTED_PLAN_ID: Optional[str] = None


def get_web3() -> Web3:
    """Return a Web3 instance connected to the local Hardhat node."""
    return Web3(Web3.HTTPProvider(RPC_URL))


def get_deployment() -> Dict[str, Any]:
    """Read shared/deployment.json at call time (never at import time)."""
    if not DEPLOYMENT_PATH.exists():
        raise FileNotFoundError(
            f"Deployment file not found at {DEPLOYMENT_PATH}. Please run reset() or npm run deploy first."
        )
    with open(DEPLOYMENT_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def get_contract(w3: Optional[Web3] = None):
    """Return the CollateralLedger contract instance at the deployed address."""
    w3 = w3 or get_web3()
    dep = get_deployment()
    return w3.eth.contract(address=dep["address"], abi=dep["abi"])


def to_b32(val: str) -> bytes:
    """Convert a string identifier (max 31 chars) to bytes32 with right null-padding."""
    s = str(val).strip()[:31]
    return Web3.to_bytes(text=s).ljust(32, b"\0")


def from_b32(b: bytes) -> str:
    """Convert bytes32 back to a clean readable UTF-8 string."""
    if isinstance(b, str):
        return b.replace("\x00", "").strip()
    return b.rstrip(b"\0").decode("utf-8", errors="replace")


def _build_error_selector_map(abi: List[Dict[str, Any]]) -> Dict[str, Tuple[str, List[str], List[str]]]:
    """Compute 4-byte selectors for all custom errors defined in the ABI."""
    error_map = {}
    for item in abi:
        if item.get("type") == "error":
            name = item["name"]
            types = [inp["type"] for inp in item.get("inputs", [])]
            names = [inp["name"] for inp in item.get("inputs", [])]
            sig = f"{name}({','.join(types)})"
            selector = "0x" + Web3.keccak(text=sig)[:4].hex()
            error_map[selector] = (name, types, names)
    return error_map


def decode_error(exc: Exception, abi: List[Dict[str, Any]]) -> Tuple[str, Any]:
    """Decode custom errors from an execution revert exception.
    
    Returns (error_name, decoded_args_dict_or_list).
    """
    error_map = _build_error_selector_map(abi)

    # 1. Check raw error data if available
    raw_data_hex = None
    if hasattr(exc, "data"):
        data = exc.data
        if isinstance(data, dict) and "data" in data:
            raw_data_hex = data["data"]
        elif isinstance(data, str) and data.startswith("0x"):
            raw_data_hex = data
    if not raw_data_hex and hasattr(exc, "args") and len(exc.args) > 1:
        second_arg = exc.args[1]
        if isinstance(second_arg, dict) and "data" in second_arg:
            raw_data_hex = second_arg["data"]

    if raw_data_hex and len(raw_data_hex) >= 10:
        selector = raw_data_hex[:10]
        if selector in error_map:
            err_name, types, names = error_map[selector]
            try:
                data_payload = bytes.fromhex(raw_data_hex[10:])
                decoded_tuple = eth_abi.decode(types, data_payload)
                formatted_args = {}
                for i, t in enumerate(types):
                    val = decoded_tuple[i]
                    if t == "bytes32":
                        val = from_b32(val)
                    arg_name = names[i] if i < len(names) else f"arg{i}"
                    formatted_args[arg_name] = val
                return err_name, formatted_args
            except Exception:
                return err_name, {}

    # 2. String regex fallback
    msg = str(exc)
    match = re.search(r"reverted with custom error ['\"]?(\w+)\((.*?)\)['\"]?", msg)
    if match:
        err_name = match.group(1)
        raw_args_str = match.group(2)
        raw_parts = [p.strip().strip('"').strip("'") for p in raw_args_str.split(",") if p.strip()]
        cleaned_parts = []
        for p in raw_parts:
            if p.startswith("0x") and len(p) == 66:
                cleaned_parts.append(from_b32(bytes.fromhex(p[2:])))
            elif p.isdigit():
                cleaned_parts.append(int(p))
            else:
                cleaned_parts.append(p)
        return err_name, cleaned_parts

    # Fallback to string error
    if "revert" in msg.lower():
        clean_msg = msg.split("revert")[-1].strip(": '\"")
        return "Reverted", clean_msg
    return type(exc).__name__, msg


def reset(scenario_input: str) -> Dict[str, Any]:
    """Fast on-chain reset: deploys CollateralLedger and seeds assets/rules from the scenario in seconds."""
    global LAST_COMMITTED_PLAN_ID
    w3 = get_web3()
    if not w3.is_connected():
        raise ConnectionError(f"Cannot connect to Hardhat node at {RPC_URL}. Is it running?")

    # Locate scenario
    scen_path = Path(scenario_input)
    if not scen_path.is_file():
        # Try appending .json or matching in SCENARIOS_DIR
        candidate = SCENARIOS_DIR / f"{scenario_input.lower()}.json"
        if candidate.is_file():
            scen_path = candidate
        else:
            candidate2 = SCENARIOS_DIR / scenario_input
            if candidate2.is_file():
                scen_path = candidate2
            else:
                raise FileNotFoundError(f"Scenario not found for: {scenario_input}")

    with open(scen_path, "r", encoding="utf-8") as f:
        scenario = json.load(f)

    # Load compiled contract artifact
    if not ARTIFACT_PATH.exists():
        raise FileNotFoundError(f"Contract artifact not found at {ARTIFACT_PATH}. Please compile contracts first.")
    with open(ARTIFACT_PATH, "r", encoding="utf-8") as f:
        artifact = json.load(f)

    abi = artifact["abi"]
    bytecode = artifact["bytecode"]

    accounts = w3.eth.accounts
    admin = accounts[0]
    allocator = accounts[1]
    desk2 = accounts[2]
    lender = accounts[3]

    # Deploy contract directly via Web3 (instant, ~50ms)
    contract_factory = w3.eth.contract(abi=abi, bytecode=bytecode)
    tx_hash = contract_factory.constructor(admin).transact({"from": admin})
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash)
    contract_addr = receipt.contractAddress
    contract = w3.eth.contract(address=contract_addr, abi=abi)

    # Grant ALLOCATOR_ROLE to accounts #1 and #2
    allocator_role = contract.functions.ALLOCATOR_ROLE().call()
    tx1 = contract.functions.grantRole(allocator_role, allocator).transact({"from": admin})
    w3.eth.wait_for_transaction_receipt(tx1)
    tx2 = contract.functions.grantRole(allocator_role, desk2).transact({"from": admin})
    w3.eth.wait_for_transaction_receipt(tx2)

    # Write deployment.json
    deployment_data = {
        "address": contract_addr,
        "abi": abi,
        "chainId": w3.eth.chain_id,
        "accounts": {
            "admin": admin,
            "allocator": allocator,
            "desk2": desk2,
            "lender": lender,
        },
    }
    DEPLOYMENT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(DEPLOYMENT_PATH, "w", encoding="utf-8") as f:
        json.dump(deployment_data, f, indent=2)

    # Seed assets
    for a in scenario.get("assets", []):
        aid_b32 = to_b32(a["id"])
        cls_b32 = to_b32(a["class"])
        qty = int(a["quantity"])
        tx = contract.functions.registerAsset(aid_b32, cls_b32, qty).transact({"from": admin})
        w3.eth.wait_for_transaction_receipt(tx)

    # Seed eligibility rules
    elig_map: Dict[str, List[bytes]] = {}
    for r in scenario.get("rules", []):
        obl = r.get("obligation_id") or r.get("obligation")
        cls = r.get("class")
        if obl and cls:
            elig_map.setdefault(obl, []).append(to_b32(cls))

    for obl_id, classes_b32 in elig_map.items():
        tx = contract.functions.setEligibility(to_b32(obl_id), classes_b32, True).transact({"from": admin})
        w3.eth.wait_for_transaction_receipt(tx)

    # Clear in-memory rejection and state logs
    REJECTIONS.clear()
    LAST_COMMITTED_PLAN_ID = None

    return {
        "ok": True,
        "scenario_id": scenario.get("id", "UNKNOWN"),
        "address": contract_addr,
        "state": state(),
    }


def state() -> List[Dict[str, Any]]:
    """Return on-chain state for every registered asset: total, reserved, available, version."""
    w3 = get_web3()
    contract = get_contract(w3)
    asset_ids = contract.functions.listAssets().call()

    result = []
    for aid_bytes in asset_ids:
        data = contract.functions.getAsset(aid_bytes).call()
        # Asset struct: (assetClass, total, reserved, version, exists)
        cls_b32, total, reserved, version, exists = data
        avail = total - reserved
        result.append(
            {
                "asset_id": from_b32(aid_bytes),
                "class": from_b32(cls_b32),
                "total": int(total),
                "reserved": int(reserved),
                "available": int(avail),
                "version": int(version),
            }
        )
    return result


def commit(plan: Dict[str, Any], signer: str = "allocator") -> Dict[str, Any]:
    """Atomically commit an allocation plan via reserveBatch()."""
    global LAST_COMMITTED_PLAN_ID
    w3 = get_web3()
    dep = get_deployment()
    contract = get_contract(w3)

    account = dep["accounts"].get(signer, dep["accounts"]["allocator"])
    plan_id = plan.get("plan_id", f"PLAN_{int(time.time())}")
    alloc_id_b32 = to_b32(plan_id)

    # Plan hash: bytes32
    raw_hash = plan.get("plan_hash")
    if raw_hash and isinstance(raw_hash, str) and raw_hash.startswith("0x") and len(raw_hash) == 66:
        plan_hash_b32 = bytes.fromhex(raw_hash[2:])
    elif raw_hash and isinstance(raw_hash, bytes) and len(raw_hash) == 32:
        plan_hash_b32 = raw_hash
    else:
        plan_hash_b32 = Web3.keccak(text=json.dumps(plan, sort_keys=True))

    lines = plan.get("lines", [])
    if not lines:
        return {"ok": False, "error": "EmptyBatch", "args": []}

    asset_ids_b32 = [to_b32(l["asset_id"]) for l in lines]
    obl_ids_b32 = [to_b32(l["obligation_id"]) for l in lines]
    units = [int(l["units"]) for l in lines]

    # Current asset versions
    expected_versions = [
        int(contract.functions.getAsset(aid).call()[3]) for aid in asset_ids_b32
    ]

    # 1. Simulate via eth_call
    try:
        contract.functions.reserveBatch(
            alloc_id_b32,
            asset_ids_b32,
            obl_ids_b32,
            units,
            expected_versions,
            plan_hash_b32,
        ).call({"from": account})
    except Exception as exc:
        err_name, err_args = decode_error(exc, dep["abi"])
        entry = {
            "type": "Rejected",
            "reason": err_name,
            "args": err_args,
            "actor": account,
            "time": int(time.time()),
        }
        REJECTIONS.append(entry)
        return {"ok": False, "error": err_name, "args": err_args}

    # 2. Send transaction
    tx_hash = contract.functions.reserveBatch(
        alloc_id_b32,
        asset_ids_b32,
        obl_ids_b32,
        units,
        expected_versions,
        plan_hash_b32,
    ).transact({"from": account})
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash)

    LAST_COMMITTED_PLAN_ID = plan_id
    return {"ok": True, "tx_hash": tx_hash.hex(), "block": receipt.blockNumber}


def events() -> List[Dict[str, Any]]:
    """Retrieve on-chain logs from block 0 merged with in-memory rejection logs, newest first."""
    w3 = get_web3()
    dep = get_deployment()
    contract = get_contract(w3)

    event_logs: List[Dict[str, Any]] = []
    current_block = w3.eth.block_number if w3.is_connected() else 0

    accounts_map = {}
    if dep and "accounts" in dep:
        accounts = dep["accounts"]
        accounts_map[accounts.get("admin", "").lower()] = "Admin"
        accounts_map[accounts.get("allocator", "").lower()] = "Desk 1"
        accounts_map[accounts.get("desk2", "").lower()] = "Desk 2"
        accounts_map[accounts.get("lender", "").lower()] = "Lender"

    # Map of event names to contract event definitions
    event_names = ["Reserved", "Released", "AllocationCommitted", "AssetRegistered"]
    for ev_name in event_names:
        event_obj = getattr(contract.events, ev_name)
        try:
            logs = event_obj.get_logs(from_block=0)
            for log in logs:
                block_info = w3.eth.get_block(log.blockNumber)
                args_dict = dict(log.args)
                # Clean up bytes32 fields
                cleaned_args = {}
                for k, v in args_dict.items():
                    if isinstance(v, bytes) and len(v) == 32:
                        cleaned_args[k] = from_b32(v)
                    else:
                        cleaned_args[k] = v

                aid = cleaned_args.get("assetId") or cleaned_args.get("asset")
                oid = cleaned_args.get("obligationId") or cleaned_args.get("obligation")
                units = cleaned_args.get("qty") if "qty" in cleaned_args else cleaned_args.get("units")
                allocator_addr = str(cleaned_args.get("allocator", "")).lower()
                actor = accounts_map.get(allocator_addr, "Desk 1")
                reason = (
                    "Collateral reserved"
                    if ev_name == "Reserved"
                    else (
                        "Plan sealed"
                        if ev_name == "AllocationCommitted"
                        else ("Asset registered" if ev_name == "AssetRegistered" else ev_name)
                    )
                )

                ts = block_info.timestamp
                dt_iso = datetime.datetime.fromtimestamp(ts, tz=datetime.timezone.utc).isoformat()
                raw_hash = log.transactionHash.hex() if log.transactionHash else ""
                clean_hex = raw_hash[2:] if raw_hash.startswith("0x") else raw_hash
                short_hash = f"0x{clean_hex[:6]}…{clean_hex[-4:]}" if clean_hex else "—"

                event_logs.append(
                    {
                        "type": ev_name,
                        "block": log.blockNumber,
                        "tx_hash": short_hash,
                        "full_tx_hash": log.transactionHash.hex() if log.transactionHash else "",
                        "time": dt_iso,
                        "timestamp": ts,
                        "actor": actor,
                        "reason": reason,
                        "asset_id": aid,
                        "obligation_id": oid,
                        "units": units,
                        "args": cleaned_args,
                    }
                )
        except Exception:
            continue

    formatted_rejections = []
    for r in list(REJECTIONS):
        r_actor = str(r.get("actor", "")).lower()
        actor_name = accounts_map.get(r_actor, r.get("actor", "Desk 2"))
        ts = r.get("time", int(time.time()))
        dt_iso = (
            datetime.datetime.fromtimestamp(ts, tz=datetime.timezone.utc).isoformat()
            if isinstance(ts, (int, float))
            else str(ts)
        )
        args = r.get("args", {})
        aid = args.get("asset") if isinstance(args, dict) else None
        oid = args.get("obligation") if isinstance(args, dict) else None
        units = args.get("requested") if isinstance(args, dict) else None

        formatted_rejections.append(
            {
                "type": "Rejected",
                "block": r.get("block", current_block),
                "tx_hash": "—",
                "time": dt_iso,
                "timestamp": ts if isinstance(ts, (int, float)) else 0,
                "actor": actor_name,
                "reason": r.get("reason", "Rejected"),
                "asset_id": aid,
                "obligation_id": oid,
                "units": units,
                "args": args,
            }
        )

    # Merge with rejection entries
    combined = event_logs + formatted_rejections
    # Sort newest first
    combined.sort(key=lambda e: e.get("timestamp", 0), reverse=True)
    return combined


def attack(attack_type: str) -> Dict[str, Any]:
    """Execute a simulated malicious attack from Desk 2 (Account #2).
    
    All attacks are designed to be caught and rejected by CollateralLedger.
    """
    global LAST_COMMITTED_PLAN_ID
    w3 = get_web3()
    dep = get_deployment()
    contract = get_contract(w3)
    desk2 = dep["accounts"]["desk2"]

    asset_states = state()
    if not asset_states:
        return {"ok": False, "error": "NoAssetsRegistered", "args": []}

    attack_plan_id = to_b32(f"ATTACK_{attack_type.upper()}_{int(time.time())}")
    empty_hash = b"\0" * 32

    # 1. Double pledge attack
    if attack_type == "double_pledge":
        # Find asset with least free units
        target_asset = min(asset_states, key=lambda a: a["available"])
        target_aid = to_b32(target_asset["asset_id"])
        excess_qty = target_asset["available"] + 1

        # Use an obligation that accepts this asset's class
        all_obls = [to_b32("O1"), to_b32("O2"), to_b32("O3"), to_b32("X"), to_b32("Y"), to_b32("Z")]
        target_obl = all_obls[0]
        for candidate_obl in all_obls:
            if contract.functions.eligible(candidate_obl, to_b32(target_asset["class"])).call():
                target_obl = candidate_obl
                break

        try:
            contract.functions.reserveBatch(
                attack_plan_id,
                [target_aid],
                [target_obl],
                [excess_qty],
                [target_asset["version"]],
                empty_hash,
            ).call({"from": desk2})
        except Exception as exc:
            err_name, err_args = decode_error(exc, dep["abi"])
            REJECTIONS.append(
                {"type": "Rejected", "reason": err_name, "args": err_args, "actor": desk2, "time": int(time.time())}
            )
            return {"ok": False, "error": err_name, "args": err_args}

    # 2. Duplicate allocation ID attack
    elif attack_type == "duplicate":
        dup_id = to_b32(LAST_COMMITTED_PLAN_ID or "PLAN_DUPLICATE_TARGET")
        target_asset = asset_states[0]
        target_aid = to_b32(target_asset["asset_id"])
        target_obl = to_b32("O1")

        # If not already on-chain, commit one first so it truly exists
        if not contract.functions.allocations(dup_id).call()[3]:
            # Commit a 1-unit plan first
            try:
                contract.functions.reserveBatch(
                    dup_id,
                    [target_aid],
                    [target_obl],
                    [1],
                    [target_asset["version"]],
                    empty_hash,
                ).transact({"from": dep["accounts"]["allocator"]})
            except Exception:
                pass

        try:
            contract.functions.reserveBatch(
                dup_id,
                [target_aid],
                [target_obl],
                [1],
                [contract.functions.getAsset(target_aid).call()[3]],
                empty_hash,
            ).call({"from": desk2})
        except Exception as exc:
            err_name, err_args = decode_error(exc, dep["abi"])
            REJECTIONS.append(
                {"type": "Rejected", "reason": err_name, "args": err_args, "actor": desk2, "time": int(time.time())}
            )
            return {"ok": False, "error": err_name, "args": err_args}

    # 3. Excessive reservation attack
    elif attack_type == "excessive":
        target_asset = asset_states[0]
        target_aid = to_b32(target_asset["asset_id"])
        excess_qty = target_asset["total"] + 1
        target_obl = to_b32("O1")
        for candidate_obl in [to_b32("O1"), to_b32("O2"), to_b32("O3"), to_b32("X")]:
            if contract.functions.eligible(candidate_obl, to_b32(target_asset["class"])).call():
                target_obl = candidate_obl
                break

        try:
            contract.functions.reserveBatch(
                attack_plan_id,
                [target_aid],
                [target_obl],
                [excess_qty],
                [target_asset["version"]],
                empty_hash,
            ).call({"from": desk2})
        except Exception as exc:
            err_name, err_args = decode_error(exc, dep["abi"])
            REJECTIONS.append(
                {"type": "Rejected", "reason": err_name, "args": err_args, "actor": desk2, "time": int(time.time())}
            )
            return {"ok": False, "error": err_name, "args": err_args}

    # 4. Ineligible asset attack
    elif attack_type == "ineligible":
        # Find an asset and obligation pair that is strictly ineligible
        ineligible_aid = None
        ineligible_obl = None
        current_version = 1

        for a in asset_states:
            for obl_name in ["O1", "O3", "Y", "Z"]:
                obl_b32 = to_b32(obl_name)
                cls_b32 = to_b32(a["class"])
                if not contract.functions.eligible(obl_b32, cls_b32).call():
                    ineligible_aid = to_b32(a["asset_id"])
                    ineligible_obl = obl_b32
                    current_version = a["version"]
                    break
            if ineligible_aid:
                break

        if not ineligible_aid:
            # Fallback pair: EQUITY to O3
            ineligible_aid = to_b32("NIFTY50_BASKET")
            ineligible_obl = to_b32("O3")

        try:
            contract.functions.reserveBatch(
                attack_plan_id,
                [ineligible_aid],
                [ineligible_obl],
                [1],
                [current_version],
                empty_hash,
            ).call({"from": desk2})
        except Exception as exc:
            err_name, err_args = decode_error(exc, dep["abi"])
            REJECTIONS.append(
                {"type": "Rejected", "reason": err_name, "args": err_args, "actor": desk2, "time": int(time.time())}
            )
            return {"ok": False, "error": err_name, "args": err_args}

    # 5. Stale plan attack
    elif attack_type == "stale":
        target_asset = asset_states[0]
        target_aid = to_b32(target_asset["asset_id"])
        # Pass version - 1 or 0
        stale_version = max(0, target_asset["version"] - 1)
        target_obl = to_b32("O1")
        for candidate_obl in [to_b32("O1"), to_b32("O2"), to_b32("O3"), to_b32("X")]:
            if contract.functions.eligible(candidate_obl, to_b32(target_asset["class"])).call():
                target_obl = candidate_obl
                break

        try:
            contract.functions.reserveBatch(
                attack_plan_id,
                [target_aid],
                [target_obl],
                [1],
                [stale_version],
                empty_hash,
            ).call({"from": desk2})
        except Exception as exc:
            err_name, err_args = decode_error(exc, dep["abi"])
            REJECTIONS.append(
                {"type": "Rejected", "reason": err_name, "args": err_args, "actor": desk2, "time": int(time.time())}
            )
            return {"ok": False, "error": err_name, "args": err_args}

    else:
        return {"ok": False, "error": "UnknownAttackType", "args": [attack_type]}

    return {"ok": True, "error": None, "message": "Attack unexpectedly succeeded"}
