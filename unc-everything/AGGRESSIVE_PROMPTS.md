# Aggressive Computer Use Prompts

These prompts are designed to trigger the computer use agent. The AI has been configured to **NEVER say "I can't"** and will aggressively use its tools.

## File Operations

### Create Files
```
"Create a file called hello.txt with content 'Hello World'"
"Write a Python script that prints 'Hello'"
"Create a new React component called Button.jsx"
```

### Read Files
```
"Read the package.json file"
"Show me the contents of .env"
"What's in the README?"
```

### Edit Files
```
"Add a new line to package.json"
"Update the version to 2.0.0"
"Change the title in index.html to 'My Site'"
```

## Terminal Commands

### npm/Node
```
"Run npm --version"
"Install express"
"Create a new Next.js app"
"Start the development server"
```

### Git
```
"Show git status"
"Commit all changes with message 'Update'"
"Push to GitHub"
"Create a new branch"
```

### General Commands
```
"List all files in the current directory"
"Create a new folder called 'my-project'"
"Show the current working directory"
"Run ls -la"
```

## Website/App Creation

### React
```
"Create a React website with a header, hero section, and footer"
"Build a React app with Tailwind CSS"
"Make a React component that displays a list of items"
```

### Next.js
```
"Create a Next.js website"
"Build a full-stack app with Next.js and a database"
"Make a Next.js landing page"
```

### General
```
"Create a website"
"Build an app"
"Make a landing page"
"Create a portfolio site"
```

## GitHub Operations

### Create Repo
```
"Create a GitHub repository called my-awesome-project"
"Make a new repo and push my code"
"Create a private GitHub repo"
```

### Push Code
```
"Push this to GitHub"
"Commit and push to GitHub"
"Create a new GitHub repo and push my code"
```

## Slack Integration

### Post Messages
```
"Send a message to Slack"
"Post to the #general channel"
"Notify the team on Slack"
```

## MCP Tools

### GitHub MCP
```
"List my GitHub repositories"
"Get my GitHub repos"
"Show my GitHub projects"
```

## Multi-Step Tasks

### Complex Workflows
```
"Create a React app, install dependencies, and start the dev server"
"Build a website with Tailwind CSS and push it to GitHub"
"Create a new project, set it up, and deploy it"
"Make a Next.js app with a database and push to GitHub"
```

### Full Project Setup
```
"Create a full-stack web app with React frontend and Node backend"
"Build a complete portfolio website with contact form"
"Set up a new project with all dependencies and git"
```

## What NOT to Say

The AI will **NOT** respond with these excuses anymore:

❌ "I'm a large language model, I don't have the capability..."
❌ "I can't physically move files..."
❌ "I don't have access to your computer..."
❌ "I'm just an AI, I can't execute commands..."

## What WILL Happen

✅ The AI will execute your request using the available tools
✅ Each step will be shown in the chat interface
✅ You'll see real-time progress and results
✅ Errors will be handled gracefully with retry logic

## Testing Computer Use

1. **Open the chat**
2. **Try one of the prompts above**
3. **Watch the steps appear in the chat**
4. **See the results in real-time**

## Example Conversation

**You:** "Create a file called test.txt with 'Hello World'"

**AI:** I'll create that file for you right now.
```
🖥️ Computer Agent • 1 step
  1. file_write: test.txt
     Input: { path: "test.txt", content: "Hello World" }
     Result: Successfully wrote 11 bytes to test.txt
```

**You:** "Now read it back"

**AI:** Let me read that file for you.
```
🖥️ Computer Agent • 1 step
  1. file_read: test.txt
     Result: Hello World
```

## Pro Tips

- **Be specific**: "Create a React app" works better than "Make something"
- **Chain commands**: "Create a file, edit it, then show me the contents"
- **Use keywords**: Words like "create", "run", "execute", "build" trigger computer use
- **Multi-step tasks**: The AI can handle complex workflows automatically

## Troubleshooting

### Computer use not triggering?
- Use clearer keywords: "create", "run", "execute", "build"
- Try a simpler request first
- Check browser console for errors

### Tool execution failed?
- Verify the command syntax
- Check if the tool has required permissions
- Try a simpler command first

### MCP tools not working?
- Ensure you've connected the MCP server in Settings
- Check that the server is running
- Verify the tool name is correct

## Advanced Usage

### Combining Tools
```
"Create a React app, add Tailwind CSS, create a GitHub repo, and push the code"
```

### Conditional Execution
```
"If the file doesn't exist, create it. If it does, update it."
```

### Batch Operations
```
"Create 5 files with different names"
"Run multiple npm commands"
```

---

**Remember:** The AI has been configured to be aggressive about using its tools. It will NOT make excuses. Just ask and it will execute!
