# Computer Use Integration - Quick Setup

## Step 1: Replace Chat Interface

In your main layout or page component:

```typescript
// OLD - without computer use
import { ChatInterface } from "@/components/chat-interface";

// NEW - with computer use support
import { ChatInterface } from "@/components/chat-interface-computer-use";
```

## Step 2: Update Message Renderer (Optional)

If you're using `ChatMessages` directly:

```typescript
// OLD
import { ChatMessages } from "@/components/chat-messages";

// NEW - shows computer use steps
import { ChatMessages } from "@/components/chat-messages-computer-use";
```

## Step 3: Configure Environment

Add to `.env.local`:

```bash
# Already configured - for model selection
GROQ_API_KEY=gsk_...

# Optional - for GitHub operations
GITHUB_TOKEN=ghp_...

# Optional - for Slack integration
SLACK_BOT_TOKEN=xoxb_...
```

## Step 4: Test Computer Use

Try these prompts:

### File Operations
- "Create a file called test.txt with content 'Hello World'"
- "Read the package.json file"
- "Edit the file to add a new line"

### Terminal Commands
- "Run npm --version"
- "Create a new directory called my-project"
- "List all files in the current directory"

### GitHub
- "Create a new GitHub repository called my-repo"

### Regular Chat (no computer use)
- "What is the capital of France?"
- "Explain React hooks"

## How Auto-Detection Works

The system automatically decides if computer use is needed:

```
User Input
    ↓
Keyword Check (fast)
    ↓
Matches? → YES → Computer Use Agent
    ↓
NO → LLM Check (if enabled)
    ↓
Matches? → YES → Computer Use Agent
    ↓
NO → Regular Chat
```

## What's New

### 1. Auto-Detection
- No `/computer` command needed
- Invisible to the user
- Keyword-based + LLM-based detection

### 2. Real Tool Execution
- Terminal commands run on server
- Files are actually created/modified
- GitHub operations use real API
- Slack messages are posted

### 3. Inline UI
- Computer use steps appear in chat
- Collapsible for details
- Shows tool names, inputs, results
- Real-time streaming

### 4. Agent Loop
- Max 15 iterations
- Automatic error handling
- Transparent reasoning

## File Changes

### New Files
```
lib/agents/
├── computer-use-tools.ts
└── auto-detection.ts

app/api/
└── computer-use/route.ts

components/
├── computer-use-steps.tsx
├── chat-interface-computer-use.tsx
└── chat-messages-computer-use.tsx
```

### Modified Files
```
lib/agents/built-in-tools.ts
lib/chat-store.ts
package.json
```

## Available Tools

| Tool | Purpose | Example |
|------|---------|---------|
| `terminal` | Run shell commands | `npm install`, `git push` |
| `file_read` | Read files | Read source code |
| `file_write` | Create/overwrite files | Create new files |
| `file_edit` | Find and replace text | Update configuration |
| `browser_open` | Open URLs | Navigate websites |
| `github_create_repo` | Create GitHub repos | New project |
| `github_push_file` | Push to GitHub | Commit code |
| `slack_post` | Post to Slack | Send notifications |
| `mcp_call` | Call MCP tools | Use existing integrations |

## Troubleshooting

### Computer use not activating?
1. Check browser console for errors
2. Verify GROQ_API_KEY is set
3. Try keywords: "create", "write", "run", "execute", "git", "npm"

### Tools failing?
1. Check server logs
2. Verify environment variables
3. Ensure commands exist on system

### UI not showing steps?
1. Using `chat-interface-computer-use.tsx`?
2. Using `chat-messages-computer-use.tsx`?
3. Check browser console for React errors

## Performance

- Auto-detection: 10-50ms (keywords) or 500-1000ms (LLM)
- Tool execution: Depends on operation
- Terminal: 0-30 seconds
- File ops: <100ms
- Streaming: Real-time to UI

## Security

⚠️ This executes real commands on the server.

- Only use with trusted users
- Validate inputs before execution
- Use sandboxed environments
- Monitor resource usage
- Set file permissions
- Use timeouts

## Full Documentation

See `COMPUTER_USE_README.md` for:
- Detailed feature documentation
- Advanced configuration
- Custom tool creation
- Error handling
- Performance optimization
- Security best practices

## Next Steps

1. ✅ Replace chat interface
2. ✅ Set environment variables
3. ✅ Test with sample prompts
4. ✅ Customize keywords if needed
5. ✅ Read full documentation

Happy coding! 🚀
