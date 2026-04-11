import sys
import subprocess
import shutil

from pathlib import Path

# Cấu hình đường dẫn
ROOT_DIR = Path(__name__).parent
BACKEND_DIR = ROOT_DIR / "backend"
FRONTEND_DIR = ROOT_DIR / "frontend"


def get_python_exe():
    # Ưu tiên venv trong các thư mục phổ biến
    paths = [
        ROOT_DIR / "venv" / "Scripts" / "python.exe",  # Windows
        ROOT_DIR / ".venv" / "Scripts" / "python.exe",
        ROOT_DIR / "venv" / "bin" / "python",          # Linux/Mac
        ROOT_DIR / ".venv" / "bin" / "python",
    ]
    for p in paths:
        if p.exists():
            return str(p)
    return sys.executable

def run_cmd(cmd, cwd=None):
    # Thay thế lệnh 'python' hoặc sys.executable bằng venv python nếu cần
    python_exe = get_python_exe()
    if cmd.startswith("python "):
        cmd = cmd.replace("python ", f'"{python_exe}" ', 1)
    elif cmd.startswith(f'"{sys.executable}"'):
        cmd = cmd.replace(f'"{sys.executable}"', f'"{python_exe}"', 1)
    elif cmd.startswith(sys.executable):
        cmd = cmd.replace(sys.executable, f'"{python_exe}"', 1)
        
    print(f"Executing: {cmd} in {cwd or ROOT_DIR}")
    try:
        subprocess.run(cmd, shell=True, cwd=cwd, check=True)
    except subprocess.CalledProcessError as e:
        print(f"Error: Command failed with exit code {e.returncode}")
        sys.exit(e.returncode)



def setup():
    print("--- Setting up Harness 2.0 Environment ---")

    # 1. Setup Python venv and deps
    print("\n[1/3] Setting up Backend...")
    run_cmd(f"{sys.executable} -m pip install -r backend/requirements.txt")
    run_cmd(
        f"{sys.executable} -m pip install black flake8 pytest pytest-asyncio pydantic-settings"
    )

    # 2. Setup Frontend deps
    print("\n[2/3] Setting up Frontend...")
    if shutil.which("npm"):
        run_cmd("npm install", cwd=FRONTEND_DIR)
    else:
        print("Warning: npm not found. Skipping frontend install.")

    # 3. Setup Git Hooks
    print("\n[3/3] Setting up Git Hooks...")
    run_cmd(f"{sys.executable} scripts/setup_hooks.py")

    print("\nSetup Complete!")


def lint():
    print("--- Running Linting & Formatting ---")

    # Backend linting
    print("\n[Backend] Running Black & Flake8...")
    run_cmd("black .")
    run_cmd("flake8 . --exclude=node_modules,venv,.venv")

    # Frontend linting
    if (FRONTEND_DIR / "package.json").exists() and shutil.which("npm"):
        print("\n[Frontend] Running Prettier...")
        run_cmd("npx prettier --write .", cwd=FRONTEND_DIR)

    print("\nLinting Complete!")


def test():
    print("--- Running All Tests ---")
    run_cmd(f"{sys.executable} scripts/run_all_tests.py")


def dev():
    print("--- Starting Dev Environment (Parallel) ---")
    print("Open 2 terminals to run backend and frontend:")
    print("Terminal 1 (Backend): cd backend && uvicorn app.main:app --reload")
    print("Terminal 2 (Frontend): cd frontend && npm run dev")

    # Vì subprocess.run là blocking, chúng ta chỉ in ra hướng dẫn hoặc dùng Popen
    # Ở đây chúng ta in hướng dẫn để user chủ động quan sát log của từng bên.


def main():
    if len(sys.argv) < 2:
        print("Usage: python harness.py [setup|lint|test|dev]")
        sys.exit(1)

    cmd = sys.argv[1]
    if cmd == "setup":
        setup()
    elif cmd == "lint":
        lint()
    elif cmd == "test":
        test()
    elif cmd == "dev":
        dev()
    else:
        print(f"Unknown command: {cmd}")
        sys.exit(1)


if __name__ == "__main__":
    main()
