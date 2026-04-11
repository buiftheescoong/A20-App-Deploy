import os
from pathlib import Path

def setup():
    hook_content = """#!/bin/bash
# Vibe Coding Harness: Pre-push checks

echo "🚀 Đang chạy các bước kiểm tra trước khi push..."

# 1. Chẩn đoán hệ thống harness
python scripts/verify_harness.py

# 2. Chạy kiểm tra tự động
python scripts/run_tests.py
TEST_RESULT=$?

if [ $TEST_RESULT -ne 0 ]; then
    echo "❌ Kiểm tra thất bại. Lệnh push bị hủy."
    exit 1
fi

# 3. Gửi AI logs
echo "📤 Đang gửi AI logs..."
python scripts/submit_log.py

echo "✅ Tất cả các bước kiểm tra đã hoàn tất. Đang thực hiện push..."
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
    except:
        pass
        
    # Tạo thư mục log
    log_dir = Path(".ai-log")
    log_dir.mkdir(exist_ok=True)
    (log_dir / ".gitkeep").touch()
    
    print("Setup: Hook created successfully.")

if __name__ == "__main__":
    setup()

