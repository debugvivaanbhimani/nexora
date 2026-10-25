#!/usr/bin/env python3
"""Cross-platform development orchestrator for the Nexora project.

Starts all required services:
  1. Hardhat blockchain node (port 8545)
  2. Deploys & seeds CollateralLedger with ref.json
  3. FastAPI backend gateway (port 8000)
  4. Vite React frontend (port 5173)

Prints live URLs and cleanly terminates all child processes on Ctrl+C.
"""

import os
import signal
import socket
import subprocess
import sys
import time
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
CONTRACTS_DIR = BASE_DIR / "contracts"
WEB_DIR = BASE_DIR / "web"
API_DIR = BASE_DIR / "api"
OPTIMISER_DIR = BASE_DIR / "optimiser"

# Colors
GREEN = "\033[92m"
CYAN = "\033[96m"
YELLOW = "\033[93m"
BOLD = "\033[1m"
RESET = "\033[0m"

PROCESSES = []


def is_port_open(host: str, port: int, timeout: float = 1.0) -> bool:
    """Check if a TCP port is open and listening."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(timeout)
        try:
            return sock.connect_ex((host, port)) == 0
        except Exception:
            return False


def wait_for_port(port: int, host: str = "127.0.0.1", timeout: float = 30.0) -> bool:
    """Wait for a service to start listening on a given port."""
    start = time.time()
    while time.time() - start < timeout:
        if is_port_open(host, port, 0.5):
            return True
        time.sleep(0.5)
    return False


def cleanup(sig=None, frame=None):
    """Gracefully terminate all spawned child processes."""
    print(f"\n{YELLOW}Shutting down Nexora development stack...{RESET}")
    for p in PROCESSES:
        try:
            if sys.platform == "win32":
                subprocess.call(["taskkill", "/F", "/T", "/PID", str(p.pid)])
            else:
                p.terminate()
                try:
                    p.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    p.kill()
        except Exception:
            pass
    print(f"{GREEN}All services stopped.{RESET}")
    sys.exit(0)


def main():
    signal.signal(signal.SIGINT, cleanup)
    signal.signal(signal.SIGTERM, cleanup)

    print(f"\n{BOLD}{CYAN}============================================================{RESET}")
    print(f"{BOLD}{CYAN}  Starting Nexora Full-Stack Development Services{RESET}")
    print(f"{BOLD}{CYAN}============================================================{RESET}\n")

    # 1. Start Hardhat Node
    if is_port_open("127.0.0.1", 8545):
        print(f" {GREEN}✓{RESET} Hardhat node already active on port 8545")
    else:
        print(" Starting Hardhat node (port 8545)...")
        hardhat_cmd = ["npx", "hardhat", "node"]
        if sys.platform == "win32":
            hardhat_cmd = ["npx.cmd", "hardhat", "node"]
        
        p_hardhat = subprocess.Popen(
            hardhat_cmd,
            cwd=str(CONTRACTS_DIR),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        PROCESSES.append(p_hardhat)

        if not wait_for_port(8545, timeout=25.0):
            print(f"{BOLD}\033[91mFailed to start Hardhat node within 25s!{RESET}")
            cleanup()

        print(f" {GREEN}✓{RESET} Hardhat node active on http://127.0.0.1:8545")

    # 2. Deploy & Seed CollateralLedger with ref.json
    print(" Deploying CollateralLedger and seeding scenario REF...")
    sys.path.insert(0, str(API_DIR))
    sys.path.insert(0, str(OPTIMISER_DIR))
    try:
        import chain
        reset_res = chain.reset("ref")
        print(f" {GREEN}✓{RESET} Deployed CollateralLedger to {reset_res['address'][:10]}… and seeded 6 assets")
    except Exception as exc:
        print(f"{YELLOW}Warning: Direct deploy failed ({exc}). Retrying via Hardhat scripts...{RESET}")
        deploy_cmd = ["node", "scripts/deploy.js"]
        subprocess.run(deploy_cmd, cwd=str(CONTRACTS_DIR), check=True)
        env = os.environ.copy()
        env["SCENARIO"] = str(BASE_DIR / "data" / "scenarios" / "ref.json")
        seed_cmd = ["npx", "hardhat", "run", "scripts/seed.js", "--network", "localhost"]
        if sys.platform == "win32":
            seed_cmd[0] = "npx.cmd"
        subprocess.run(seed_cmd, cwd=str(CONTRACTS_DIR), env=env, check=True)
        print(f" {GREEN}✓{RESET} Deployed & seeded via Hardhat scripts")

    # 3. Start FastAPI Backend Gateway
    if is_port_open("127.0.0.1", 8000):
        print(f" {GREEN}✓{RESET} FastAPI backend already active on port 8000")
    else:
        print(" Starting FastAPI backend gateway (port 8000)...")
        env = os.environ.copy()
        env["PYTHONPATH"] = f"{API_DIR}:{OPTIMISER_DIR}" + (f";{env.get('PYTHONPATH', '')}" if sys.platform == "win32" else f":{env.get('PYTHONPATH', '')}")
        
        uvicorn_cmd = [
            sys.executable,
            "-m",
            "uvicorn",
            "main:app",
            "--host",
            "0.0.0.0",
            "--port",
            "8000",
            "--reload",
        ]
        p_api = subprocess.Popen(
            uvicorn_cmd,
            cwd=str(API_DIR),
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        PROCESSES.append(p_api)

        if not wait_for_port(8000, timeout=20.0):
            print(f"{BOLD}\033[91mFailed to start FastAPI server within 20s!{RESET}")
            cleanup()

        print(f" {GREEN}✓{RESET} FastAPI server active on http://localhost:8000")

    # 4. Start Vite React Frontend
    if is_port_open("127.0.0.1", 5173):
        print(f" {GREEN}✓{RESET} Vite frontend already active on port 5173")
    else:
        print(" Starting Vite web frontend (port 5173)...")
        npm_cmd = ["npm", "run", "dev"]
        if sys.platform == "win32":
            npm_cmd = ["npm.cmd", "run", "dev"]

        p_web = subprocess.Popen(
            npm_cmd,
            cwd=str(WEB_DIR),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        PROCESSES.append(p_web)

        if not wait_for_port(5173, timeout=20.0):
            print(f"{BOLD}\033[91mFailed to start Vite dev server within 20s!{RESET}")
            cleanup()

        print(f" {GREEN}✓{RESET} Vite frontend active on http://localhost:5173")

    # Banner
    print(f"\n{BOLD}{GREEN}============================================================{RESET}")
    print(f"{BOLD}{GREEN}  Nexora Development Stack is Live!{RESET}")
    print(f"{BOLD}{GREEN}============================================================{RESET}")
    print(f"  {BOLD}• Web Dashboard:{RESET}    {CYAN}http://localhost:5173{RESET}")
    print(f"  {BOLD}• REST API Gateway:{RESET} {CYAN}http://localhost:8000{RESET}")
    print(f"  {BOLD}• API Documentation:{RESET}{CYAN}http://localhost:8000/docs{RESET}")
    print(f"  {BOLD}• Hardhat RPC Node:{RESET} {CYAN}http://127.0.0.1:8545{RESET}")
    print(f"{BOLD}{GREEN}============================================================{RESET}")
    print(f"\n {YELLOW}Press Ctrl+C to terminate all services.{RESET}\n")

    # Keep script alive
    while True:
        time.sleep(1)


if __name__ == "__main__":
    main()
