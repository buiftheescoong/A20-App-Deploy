import subprocess
import sys
from pathlib import Path


def run_cmd(cmd, cwd=None):
    try:
        result = subprocess.run(
            cmd, shell=True, cwd=cwd, capture_output=True, text=True, encoding="utf-8"
        )
        return result.returncode == 0, result.stdout, result.stderr
    except Exception as e:
        return False, "", str(e)


def run_tests():
    print("Test Runner v2.0: Running automated tests...")

    all_passed = True

    # 1. Backend Tests
    backend_dir = Path("backend")
    print("\n[Backend] Running pytest...")
    passed, out, err = run_cmd(f"{sys.executable} -m pytest", cwd=backend_dir)
    if passed:
        print("[OK] Backend tests passed.")
    else:
        print("[FAIL] Backend tests failed.")
        print(out)
        print(err)
        all_passed = False

    # 2. Frontend Linting (as a proxy for tests if no tests are defined)
    frontend_dir = Path("frontend")
    if (frontend_dir / "package.json").exists():
        print("\n[Frontend] Running lint...")
        passed, out, err = run_cmd("npm run lint", cwd=frontend_dir)
        if passed:
            print("[OK] Frontend lint passed.")
        else:
            print("[FAIL] Frontend lint failed.")
            all_passed = False

    return all_passed


if __name__ == "__main__":
    if not run_tests():
        sys.exit(1)
    sys.exit(0)
