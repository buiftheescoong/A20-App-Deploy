import os
import sys
from pathlib import Path

def check_harness():
    print("Harness Check: Verifying system...")
    
    # 1. Kiểm tra thư mục log
    log_dir = Path(".ai-log")
    if log_dir.exists() and log_dir.is_dir():
        print("[OK] Log directory exists.")
    else:
        print("[FAIL] Log directory missing.")
        
    # 2. Kiểm tra Git Hooks
    hook_file = Path(".git/hooks/pre-push")
    if hook_file.exists():
        print("[OK] Git pre-push hook installed.")
    else:
        print("[FAIL] Git pre-push hook missing (Run scripts/setup_hooks.py)")

    # 3. Kiểm tra file Agent Guidelines
    agent_file = Path("AGENTS.md")
    if agent_file.exists():
        print("[OK] AGENTS.md exists.")
    else:
        print("[FAIL] AGENTS.md missing.")

    print("\nHarness Check: Finished.")

if __name__ == "__main__":
    check_harness()
