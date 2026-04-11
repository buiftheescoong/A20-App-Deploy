from pathlib import Path



def check_harness():
    print("Harness Check: Verifying system v2.0...")

    # 1. Kiểm tra môi trường Backend
    backend_env = Path("backend/.env")
    if backend_env.exists():
        print("[OK] Backend .env exists.")
    else:
        print("[WARN] Backend .env missing. Copy from .env.example")

    # 2. Kiểm tra môi trường Frontend
    frontend_env = Path("frontend/.env")
    if frontend_env.exists():
        print("[OK] Frontend .env exists.")
    else:
        print("[WARN] Frontend .env missing. Copy from .env.example")

    # 3. Kiểm tra Mock DB
    mock_db = Path("mock_db.json")
    if mock_db.exists():
        print("[OK] Mock database file exists.")
    else:
        print("[INFO] Mock database file will be created on first run.")

    # 4. Kiểm tra Git Hooks
    hook_file = Path(".git/hooks/pre-push")
    if hook_file.exists():
        print("[OK] Git pre-push hook installed.")
    else:
        print("[FAIL] Git pre-push hook missing (Run python harness.py setup)")

    print("\nHarness Check: Finished.")


if __name__ == "__main__":
    check_harness()
