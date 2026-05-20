# Render Terminal Integration Guide

## Overview

Your app now has a **real, interactive terminal** that connects to your Render.com web terminal. The bot can execute actual commands like deployment, npm scripts, git operations, and anything else you can run in a terminal.

## What's New

### 1. **Interactive Terminal Blocks in Chat**
- Terminal output now appears as code blocks in messages
- Users can click the **⚡ Execute** button to run commands
- Use **Ctrl+Enter** or **Cmd+Enter** to quickly run commands
- Full real-time output and error display

### 2. **Real Render Integration**
- Connected to your Render web terminal via `/api/terminal`
- Uses your `RENDER_TERMINAL_URL` and `RENDER_API_KEY` environment variables
- Supports all commands: `npm`, `git`, `deploy`, `ls`, `cat`, etc.

### 3. **Bot-Driven Terminal Automation**
The AI can now output terminal blocks that execute automatically or on demand:

```
User: "Deploy the app"

Bot: Let me deploy your application...

```terminal
$ npm run build && vercel deploy
Next.js build completed...
Deployment successful!
```

Click the ⚡ button to execute, or it can auto-run with proper setup.

## Architecture

### Files Created

1. **`/app/api/terminal/route.ts`**
   - API endpoint that forwards commands to your Render terminal
   - Handles authentication with `RENDER_API_KEY`
   - Manages timeouts and error handling
   - Returns command output and error messages

2. **`/hooks/use-terminal.ts`**
   - React hook for executing terminal commands
   - Manages loading states and results
   - Provides `execute()` and `clear()` methods
   - Handles client-side command flow

3. **Updated `/components/terminal-block.tsx`**
   - Now interactive with command input field
   - Execute button with real-time feedback
   - Shows running status with pulsing indicator
   - Copy button for command output

4. **Updated `/components/message-content.tsx`**
   - Terminal blocks now support `interactive={true}` prop
   - Parses terminal markdown syntax from AI responses

## How It Works

### User Flow
1. User asks bot to do something (e.g., "deploy the app")
2. Bot generates response with terminal block:
   ```
   ```terminal
   $ npm run build && vercel deploy
   ```
   ```
3. User sees terminal block in chat with ⚡ Execute button
4. Click button → Command runs on Render terminal → Output shows

### Bot Flow
1. Bot writes markdown with terminal block syntax
2. Message content parser detects `​```terminal` blocks
3. Renders as interactive TerminalBlock component
4. Execution is manual (click button) or can be automated

## Usage Examples

### Example 1: Deploy Command
```markdown
Let me deploy your app...

```terminal
$ npm run build && vercel deploy --prod
> built successfully
> deployment complete
```
```

### Example 2: Check Status
```markdown
Here's your app status:

```terminal
$ pm2 status
┌─────────────────┬──────┬─────────┐
│ App             │ Pid  │ Status  │
├─────────────────┼──────┼─────────┤
│ uncgpt          │ 1234 │ online  │
└─────────────────┴──────┴─────────┘
```
```

### Example 3: Git Operations
```markdown
Here's the latest commit:

```terminal
$ git log --oneline -1
a1b2c3d feat: Add terminal integration
```
```

## Terminal Command Syntax

Your bot can generate terminal blocks using this markdown syntax:

```markdown
```terminal
$ your-command-here
output goes here
```
```

Error handling:

```markdown
```terminal
$ failing-command
some output
[ERROR]: Error message here
```
```

## Environment Variables

These are already configured in your project settings:

- `RENDER_TERMINAL_URL`: `https://ai-terminal-api.onrender.com/execute`
- `RENDER_API_KEY`: Your secret key

Check your project settings (top right) under **"Vars"** to verify they're set.

## Features

✅ **Interactive execution** - Click buttons to run commands  
✅ **Real-time feedback** - See output as it happens  
✅ **Error display** - Clear error messages  
✅ **Full command support** - Deploy, npm, git, docker, etc.  
✅ **Copy functionality** - Copy commands to clipboard  
✅ **Collapse/expand** - Hide verbose output when needed  
✅ **Running indicator** - Visual feedback during execution  
✅ **Keyboard shortcuts** - Ctrl/Cmd+Enter to execute  

## How to Use in Your Bot Prompts

Tell your bot to generate terminal blocks:

```
You can use terminal blocks to show command execution:

```terminal
$ command-to-run
expected output here
```

Use this when the user asks you to:
- Deploy the app
- Run build processes
- Check app status
- Install dependencies
- Make git commits
- Run database migrations
- Any other terminal commands
```

## Debugging

### Check if Render is connected
1. Go to Settings (top right) → **Vars**
2. Verify `RENDER_TERMINAL_URL` and `RENDER_API_KEY` are set
3. If missing, add them manually

### Check API route
```bash
curl -X POST http://localhost:3000/api/terminal \
  -H "Content-Type: application/json" \
  -d '{"command":"echo hello"}'
```

### Check browser console
- Open DevTools (F12)
- Go to Console tab
- Look for `[v0]` prefixed logs for debugging info

## Advanced Configuration

### Timeout
Default timeout is 30 seconds. Modify in `/app/api/terminal/route.ts`:
```ts
timeout: 30000, // 30 seconds
```

### Command Validation
Add custom validation in the API route to restrict commands:
```ts
const blockedCommands = ['rm -rf', 'sudo'];
if (blockedCommands.some(cmd => command.includes(cmd))) {
  return NextResponse.json({ error: 'Command not allowed' }, { status: 403 });
}
```

### Custom Error Handling
Terminal blocks support error display:
```markdown
```terminal
$ npm install
npm ERR! 404 package not found
[ERROR]: Package installation failed
```
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Render terminal not configured" | Check env vars in Settings → Vars |
| "Network error" | Verify Render API URL is accessible |
| Command times out | Increase timeout in `/app/api/terminal/route.ts` |
| Output not showing | Check terminal block markdown syntax |
| Execute button disabled | Command might be running, wait for it to finish |

## Next Steps

1. **Test the integration** - Ask your bot to deploy or run a command
2. **Train your bot** - Add system prompts telling it to use terminal blocks
3. **Customize** - Modify timeout, validation, or styling as needed
4. **Monitor** - Watch server logs for any issues

## API Reference

### POST `/api/terminal`

**Request:**
```json
{
  "command": "npm run build"
}
```

**Response (Success):**
```json
{
  "command": "npm run build",
  "output": "Building...\nDone!",
  "error": null,
  "exitCode": 0
}
```

**Response (Error):**
```json
{
  "command": "npm run build",
  "output": "",
  "error": "Command failed",
  "exitCode": 1
}
```

---

**Ready to deploy?** You can now tell your bot to generate real terminal commands that execute on your Render server! 🚀
