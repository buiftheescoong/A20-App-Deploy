import os
from pathlib import Path


def setup():
    hook_content = """#!/bin/bash
# Vibe Coding Harness 2.0: Pre-push checks

echo "🚀 Running Pre-push Guardrail..."

# 1. Chẩn đoán hệ thống
"venv/Scripts/python.exe" scripts/verify_harness.py

# 2. Chạy Linting (Tự động format hoặc cảnh báo)
"venv/Scripts/python.exe" harness.py lint

# 3. Chạy Toàn bộ Tests
"venv/Scripts/python.exe" scripts/run_all_tests.py

TEST_RESULT=$?

if [ $TEST_RESULT -ne 0 ]; then
    echo "❌ Tests Failed. Push Aborted."
    exit 1
fi

# 4. Gửi AI logs
echo "📤 Submitting AI logs..."
python scripts/submit_log.py

echo "✅ All checks passed. Pushing..."
exit 0
"""

    hook_path = Path(".git/hooks/pre-push")

    print(f"Setup: Creating hook at {hook_path}...")

    # Đảm bảo thư mục tồn tại
    hook_path.parent.mkdir(parents=True, exist_ok=True)

    with open(hook_path, "w", encoding="utf-8", newline="\n") as f:
        f.write(hook_content)

    # Cố gắng set executable (trên Windows có thể không cần nhưng tốt cho Git Bash)
    try:
        os.chmod(hook_path, 0o755)
    except Exception:
        pass

    # Tạo thư mục log
    log_dir = Path(".ai-log")
    log_dir.mkdir(exist_ok=True)
    (log_dir / ".gitkeep").touch()

    print("Setup: Hook created successfully.")


if __name__ == "__main__":
    setup()
