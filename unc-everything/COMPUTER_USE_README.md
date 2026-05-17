# Computer Use Implementation Guide

## Overview

This project now includes **Real Computer Use** capabilities that allow the AI agent to execute actual commands, file operations, browser automation, and more. The system is **invisible to the user** - they just chat normally, and the AI automatically decides if computer use is needed.

## Key Features

### 1. **Auto-Detection** (No `/computer` command needed)
- Fast keyword-based detection first
- Falls back to LLM-based classification if needed
- Automatically routes requests to Computer Use Agent when appropriate

### 2. **Real Tool Execution**
- **Terminal**: Execute bash commands, npm, git, etc.
- **File Operations**: Read, write, edit files on the server
- **Browser Automation**: Open URLs, navigate pages
- **GitHub**: Create repos, push files
- **Slack**: Post messages to channels
- **MCP Integration**: Call MCP tools seamlessly

### 3. **Inline Chat UI**
- Computer use steps appear as collapsible blocks in chat
- Shows iteration count, tool name, input, and results
- Compact by default, expandable for details
- Real-time streaming of agent progress

### 4. **Agent Loop**
- Max 15 iterations to prevent infinite loops
- Each step is streamed to the UI
- Automatic error handling and recovery
- Transparent reasoning and tool calls

## File Structure

### New Files Created

```
lib/agents/
├── computer-use-tools.ts       # Real tool implementations
├── auto-detection.ts            # Detects if computer use is needed
└── (existing: agent-service.ts, built-in-tools.ts)

app/api/
├── computer-use/route.ts        # Computer use agent endpoint
└── (existing: chat/route.ts)

components/
├── computer-use-steps.tsx       # UI component for displaying steps
├── chat-interface-computer-use.tsx  # Updated chat interface
└── chat-messages-computer-use.tsx   # Updated message renderer

lib/
└── chat-store.ts                # Updated with ComputerUseStep type
```

### Modified Files

- `lib/agents/built-in-tools.ts` - Now includes computer use tools
- `lib/chat-store.ts` - Added `ComputerUseStep` interface and `computerUseSteps` field to Message
- `package.json` - Added `puppeteer` and `node-fetch` dependencies

## How It Works

### 1. User sends a message
```
User: "Create a React app called my-app"
```

### 2. Auto-detection runs
```
System: Does this need computer use? 
→ YES (matches "create.*app" pattern)
```

### 3. Computer Use Agent is triggered
```
Agent: I'll create a React app for you
→ Tool: terminal({ command: "npx create-react-app my-app" })
→ Result: "Created successfully..."
→ Tool: file_read({ path: "my-app/package.json" })
→ Result: "{ ... }"
→ Final: "Done! Created React app at ./my-app"
```

### 4. UI shows steps inline
```
🖥️ Computer Agent • 3 steps • Running...
  ├─ 1. terminal: npx create-react-app my-app
  ├─ 2. file_read: my-app/package.json
  └─ 3. Complete: Done! Created React app at ./my-app
```

## Available Tools

### Terminal
```typescript
terminal({
  command: "npm install express",
  cwd: "/app",
  timeout: 30000
})
```

### File Operations
```typescript
file_read({ path: "/app/src/index.js" })
file_write({ path: "/app/src/index.js", content: "..." })
file_edit({ path: "/app/src/index.js", oldString: "...", newString: "..." })
```

### Browser
```typescript
browser_open({ url: "https://example.com" })
```

### GitHub
```typescript
github_create_repo({ name: "my-repo", description: "...", private: false })
github_push_file({ owner: "user", repo: "repo", path: "file.js", content: "...", message: "..." })
```

### Slack
```typescript
slack_post({ channel: "#general", text: "Hello!" })
```

### MCP
```typescript
mcp_call({ server: "github", tool: "list_repos", params: {} })
```

## Configuration

### Environment Variables

```bash
# For GitHub operations
GITHUB_TOKEN=ghp_...

# For Slack integration
SLACK_BOT_TOKEN=xoxb-...

# For model selection (already configured)
GROQ_API_KEY=gsk_...
```

### Auto-Detection Tuning

Edit `lib/agents/auto-detection.ts` to adjust:
- Keywords that trigger computer use
- LLM model used for classification
- Detection confidence threshold

## Integration with Existing Code

### Using the New Chat Interface

Replace the import in your main layout:

```typescript
// Old
import { ChatInterface } from "@/components/chat-interface";

// New (with computer use support)
import { ChatInterface } from "@/components/chat-interface-computer-use";
```

### Using the New Message Renderer

```typescript
// Old
import { ChatMessages } from "@/components/chat-messages";

// New (with computer use steps)
import { ChatMessages } from "@/components/chat-messages-computer-use";
```

## Error Handling

The system handles errors gracefully:

```
Tool execution fails
  ↓
Error is captured with context
  ↓
Agent receives error message
  ↓
Agent can retry or explain issue
  ↓
User sees clear error message in chat
```

## Performance Considerations

- **Auto-detection**: ~10-50ms (keyword-based), ~500-1000ms (LLM-based)
- **Tool execution**: Depends on operation (terminal: 0-30s, file ops: <100ms)
- **Streaming**: Real-time updates to UI as steps complete
- **Max iterations**: 15 (prevents runaway loops)

## Security Notes

⚠️ **Important**: This implementation executes real commands on the server.

- Only enable computer use for trusted users
- Validate all user inputs before execution
- Use sandboxed environments for untrusted code
- Monitor resource usage (CPU, memory, disk)
- Set appropriate file permissions
- Use timeouts to prevent hanging processes

## Testing

### Test Auto-Detection

```bash
curl -X POST http://localhost:3000/api/computer-use \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "Create a file called test.txt"}],
    "preferredModel": "llama-3.3-70b-versatile",
    "preferredProvider": "groq"
  }'
```

### Test Individual Tools

```typescript
import { terminalTool } from "@/lib/agents/computer-use-tools";

const result = await terminalTool.execute({
  command: "echo 'Hello World'"
});
console.log(result);
```

## Troubleshooting

### Computer use not triggering
1. Check auto-detection keywords in `auto-detection.ts`
2. Verify LLM API keys are set
3. Check browser console for errors

### Tools failing
1. Verify environment variables are set
2. Check file permissions for file operations
3. Ensure commands exist on system (npm, git, etc.)
4. Check timeout settings

### UI not showing steps
1. Verify `chat-interface-computer-use.tsx` is being used
2. Check `chat-messages-computer-use.tsx` is imported
3. Verify `ComputerUseSteps` component is rendering

## Future Enhancements

- [ ] Vision-based tool calling (screenshot analysis)
- [ ] Parallel tool execution
- [ ] Tool result caching
- [ ] Custom tool registration
- [ ] Tool execution history/audit log
- [ ] Rate limiting per user
- [ ] Rollback/undo functionality

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review tool logs in browser console
3. Check server logs for execution errors
4. Verify environment variables are set correctly
