#!/bin/bash
# Thiết lập Git pre-push hook cho Vibe Coding Harness
set -e

HOOK_FILE=".git/hooks/pre-push"

echo "🔧 Đang thiết lập Git hooks..."

cat > "$HOOK_FILE" << 'EOF'
#!/bin/bash
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
EOF

chmod +x "$HOOK_FILE"
echo "✅ Git pre-push hook đã được cài đặt tại $HOOK_FILE"

# Tạo thư mục .ai-log nếu chưa tồn tại
mkdir -p .ai-log
touch .ai-log/.gitkeep

echo "[ai-log] Thiết lập hoàn tất. Hãy đảm bảo AI_LOG_SERVER đã được cấu hình trong file .env."

