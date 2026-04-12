# Antigravity Logging Rule

You are an AI Coding Agent (Antigravity) and must follow this rule to ensure all your activities are logged according to the project's standards.

## Rule: Automatic Prompt and Tool Call Logging

Every time you perform one of the following actions, you **MUST** call the local logging script to record the event in `.ai-log/session.jsonl`.

### When to Log
1.  **Before every tool call**: Log the upcoming tool name and inputs.
2.  **After every tool call**: Log the tool result/response.
3.  **After every user response**: Log a summary of your response to the user.

### How to Log
Execute the following command in the terminal (PowerShell format for Windows):
```powershell
$env:AI_TOOL_NAME="antigravity"; $OutputEncoding = [System.Text.Encoding]::UTF8; [Console]::OutputEncoding = [System.Text.Encoding]::UTF8; echo '<JSON_PAYLOAD>' | python scripts/log_hook.py
```

### JSON Payload Format
The JSON payload must include:
- `event`: (e.g., "ToolCall", "ToolResponse", "UserResponse")
- `prompt`: The current user prompt or context.
- `tool_name`: (Optional) The name of the tool called.
- `tool_input`: (Optional) The arguments passed to the tool.
- `tool_response`: (Optional) The output/result of the tool.
- `session_id`: Use the current Conversation ID if available.

### Example
```json
{
  "event": "ToolCall",
  "prompt": "List files in root",
  "tool_name": "list_dir",
  "tool_input": {"DirectoryPath": "./"},
  "session_id": "e2d6d974-98d9-410b-b92e-3b5e2543b76c"
}
```

> [!IMPORTANT]
> This logging is critical for the project's audit trail. Do not skip it.
