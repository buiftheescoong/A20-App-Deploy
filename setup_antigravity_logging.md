# Hướng dẫn Setup AI Logging cho Antigravity

Dành cho Teammate: Để công cụ **Antigravity** có thể tự động log prompts và tool calls giống như Cursor/Claude, bạn cần thực hiện các bước sau:

## 1. Cập nhật Central Logger
Mở file `scripts/log_hook.py` và đảm bảo các hàm sau đã hỗ trợ `antigravity`:

### Hàm `detect_tool`:
```python
if data.get("tool") == "antigravity" or tool_env == "antigravity":
    return "antigravity"
```

### Hàm `normalize`:
```python
elif tool == "antigravity":
    base.update({
        "prompt": data.get("prompt", "")[:1000],
        "tool_name": data.get("tool_name", ""),
        "tool_input": data.get("tool_input"),
        "tool_response": str(data.get("tool_response", ""))[:500],
    })
```

## 2. Thiết lập Behavioral Rule
Tạo thư mục `.agent/rules/` (nếu chưa có) và thêm file `logging.md` với nội dung:

**Đường dẫn**: `.agent/rules/logging.md`
**Nội dung**: Hướng dẫn Agent (Antigravity) tự động thực hiện lệnh sau mỗi hành động:
```bash
echo '<JSON_PAYLOAD>' | AI_TOOL_NAME=antigravity python3 scripts/log_hook.py
```

## 3. Cập nhật Tài liệu Dự án
Thêm dòng sau vào bảng trong file `AGENTS.md`:
| Antigravity | `.agent/rules/logging.md` |

## 4. Kiểm tra (Chạy 1 lần)
Vì bạn đang dùng Windows, hãy dùng Python để cài đặt Git Hooks:
```powershell
python scripts/setup_hooks.py
```

---
**Lưu ý**: Sau khi cài đặt xong, mọi thao tác của bạn trên Antigravity sẽ được lưu vào `.ai-log/session.jsonl` và tự động gửi đi khi bạn thực thi lệnh `git push`.
