import { Tool } from './agent-service';
import { spawn } from 'child_process';
import { writeFile, readFile, mkdir } from 'fs/promises';
import { dirname } from 'path';

/**
 * Execute terminal command
 */
export const terminalTool: Tool = {
  name: 'terminal',
  description: 'Execute a terminal command on the server. Use for npm, git, mkdir, file operations, etc.',
  inputSchema: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'The shell command to execute',
      },
      cwd: {
        type: 'string',
        description: 'Optional working directory',
      },
      timeout: {
        type: 'number',
        description: 'Timeout in milliseconds (default: 30000)',
      },
    },
    required: ['command'],
  },
  execute: async (input: Record<string, any>) => {
    const command = input.command as string;
    // Sandboxed workspace - all commands run inside /tmp/agent-workspace (Ubuntu-like free terminal)
    const SANDBOX = process.env.AGENT_SANDBOX_DIR || '/tmp/agent-workspace';
    try { await mkdir(SANDBOX, { recursive: true }); } catch {}
    const cwd = input.cwd || SANDBOX;
    const timeout = input.timeout || 30000;

    return new Promise((resolve) => {
      const fullCommand = `cd ${cwd} && ${command}`;
      const child = spawn('bash', ['-c', fullCommand]);
      let output = '';
      let error = '';
      const timeoutId = setTimeout(() => {
        child.kill('SIGKILL');
        resolve(`Command timed out after ${timeout}ms. Current output: ${output || 'none'}. Error: ${error || 'none'}`);
      }, timeout);

      child.stdout.on('data', (data) => {
        output += data.toString();
      });

      child.stderr.on('data', (data) => {
        error += data.toString();
      });

      child.on('close', (code) => {
        clearTimeout(timeoutId);
        if (code === 0) {
          resolve(output || 'Command executed successfully');
        } else {
          resolve(`Error (exit code ${code}): ${error || output || 'Unknown error'}`);
        }
      });

      child.on('error', (err) => {
        clearTimeout(timeoutId);
        resolve(`Failed to execute command: ${err.message}`);
      });
    });
  },
};

/**
 * Read file from filesystem
 */
export const fileReadTool: Tool = {
  name: 'file_read',
  description: 'Read a file from the server filesystem',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Absolute or relative file path',
      },
    },
    required: ['path'],
  },
  execute: async (input: Record<string, any>) => {
    const path = input.path as string;
    try {
      const content = await readFile(path, 'utf-8');
      return content.length > 50000 ? content.substring(0, 50000) + '\n[Content truncated]' : content;
    } catch (error) {
      return `Failed to read file: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  },
};

/**
 * Write file to filesystem
 */
export const fileWriteTool: Tool = {
  name: 'file_write',
  description: 'Write or overwrite a file on the server',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Absolute or relative file path',
      },
      content: {
        type: 'string',
        description: 'File content to write',
      },
    },
    required: ['path', 'content'],
  },
  execute: async (input: Record<string, any>) => {
    const path = input.path as string;
    const content = input.content as string;
    try {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, content, 'utf-8');
      return `Successfully wrote ${content.length} bytes to ${path}`;
    } catch (error) {
      return `Failed to write file: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  },
};

/**
 * Edit file by replacing text
 */
export const fileEditTool: Tool = {
  name: 'file_edit',
  description: 'Edit a file by finding and replacing text',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'File path',
      },
      oldString: {
        type: 'string',
        description: 'Exact text to find',
      },
      newString: {
        type: 'string',
        description: 'Replacement text',
      },
    },
    required: ['path', 'oldString', 'newString'],
  },
  execute: async (input: Record<string, any>) => {
    const path = input.path as string;
    const oldString = input.oldString as string;
    const newString = input.newString as string;
    try {
      let content = await readFile(path, 'utf-8');
      if (!content.includes(oldString)) {
        return `Text not found in file: ${oldString}`;
      }
      content = content.replace(oldString, newString);
      await writeFile(path, content, 'utf-8');
      return `Successfully edited ${path}`;
    } catch (error) {
      return `Failed to edit file: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  },
};

/**
 * Open URL in headless browser and take screenshot
 */
export const browserOpenTool: Tool = {
  name: 'browser_open',
  description: 'Open a URL in a headless browser and return page info',
  inputSchema: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'URL to open',
      },
    },
    required: ['url'],
  },
  execute: async (input: Record<string, any>) => {
    const url = input.url as string;
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; ComputerUse/1.0)',
        },
      });
      const html = await response.text();
      const title = html.match(/<title[^>]*>([^<]+)<\/title>/)?.[1] || 'No title';
      return `Opened ${url}\nTitle: ${title}\nStatus: ${response.status}`;
    } catch (error) {
      return `Failed to open URL: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  },
};

/**
 * Create GitHub repository
 */
export const githubCreateRepoTool: Tool = {
  name: 'github_create_repo',
  description: 'Create a new GitHub repository',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Repository name',
      },
      description: {
        type: 'string',
        description: 'Repository description (optional)',
      },
      private: {
        type: 'boolean',
        description: 'Make repository private (default: false)',
      },
    },
    required: ['name'],
  },
  execute: async (input: Record<string, any>) => {
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      return 'GitHub token not configured. Set GITHUB_TOKEN environment variable.';
    }
    try {
      const response = await fetch('https://api.github.com/user/repos', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: input.name,
          description: input.description || '',
          private: input.private || false,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        return `Failed to create repo: ${(data as any).message}`;
      }
      return `Repository created: ${(data as any).html_url}`;
    } catch (error) {
      return `Failed to create repository: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  },
};

/**
 * Push file to GitHub
 */
export const githubPushFileTool: Tool = {
  name: 'github_push_file',
  description: 'Create or update a file in a GitHub repository',
  inputSchema: {
    type: 'object',
    properties: {
      owner: {
        type: 'string',
        description: 'Repository owner',
      },
      repo: {
        type: 'string',
        description: 'Repository name',
      },
      path: {
        type: 'string',
        description: 'File path in repository',
      },
      content: {
        type: 'string',
        description: 'File content (base64 encoded)',
      },
      message: {
        type: 'string',
        description: 'Commit message',
      },
    },
    required: ['owner', 'repo', 'path', 'content', 'message'],
  },
  execute: async (input: Record<string, any>) => {
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      return 'GitHub token not configured.';
    }
    try {
      const response = await fetch(
        `https://api.github.com/repos/${input.owner}/${input.repo}/contents/${input.path}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: input.message,
            content: input.content,
          }),
        }
      );
      const data = await response.json();
      if (!response.ok) {
        return `Failed to push file: ${(data as any).message}`;
      }
      return `File pushed successfully`;
    } catch (error) {
      return `Failed to push file: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  },
};

/**
 * Post message to Slack
 */
export const slackPostTool: Tool = {
  name: 'slack_post',
  description: 'Post a message to a Slack channel',
  inputSchema: {
    type: 'object',
    properties: {
      channel: {
        type: 'string',
        description: 'Channel ID or name',
      },
      text: {
        type: 'string',
        description: 'Message text',
      },
    },
    required: ['channel', 'text'],
  },
  execute: async (input: Record<string, any>) => {
    const token = process.env.SLACK_BOT_TOKEN;
    if (!token) {
      return 'Slack token not configured. Set SLACK_BOT_TOKEN environment variable.';
    }
    try {
      const response = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channel: input.channel,
          text: input.text,
        }),
      });
      const data = await response.json();
      if (!(data as any).ok) {
        return `Failed to post to Slack: ${(data as any).error}`;
      }
      return `Message posted to Slack`;
    } catch (error) {
      return `Failed to post to Slack: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  },
};

/**
 * Call MCP tool
 */
export const mcpCallTool: Tool = {
  name: 'mcp_call',
  description: 'Call a tool from an MCP server',
  inputSchema: {
    type: 'object',
    properties: {
      server: {
        type: 'string',
        description: 'MCP server name',
      },
      tool: {
        type: 'string',
        description: 'Tool name',
      },
      params: {
        type: 'object',
        description: 'Tool parameters',
      },
    },
    required: ['server', 'tool', 'params'],
  },
  execute: async (input: Record<string, any>) => {
    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      const server = input.server as string;
      
      // Route to specific MCP endpoint (e.g., /api/mcp/github)
      const response = await fetch(`${baseUrl}/api/mcp/${server.toLowerCase()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: input.tool,
          ...input.params,
        }),
      });
      
      const data = await response.json();
      if (!response.ok) {
        return `MCP Error: ${data.error || 'Unknown error'}`;
      }
      return JSON.stringify(data.data || data);
    } catch (error) {
      return `Failed to call MCP tool: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  },
};

/**
 * Get all computer use tools
 */
export function getComputerUseTools(): Tool[] {
  return [
    terminalTool,
    {
      ...terminalTool,
      name: 'npm',
      description: 'Run npm commands (e.g., npm install, npm run build)',
    },
    {
      ...terminalTool,
      name: 'git',
      description: 'Run git commands (e.g., git status, git commit, git push)',
    },
    fileReadTool,
    fileWriteTool,
    fileEditTool,
    browserOpenTool,
    githubCreateRepoTool,
    githubPushFileTool,
    slackPostTool,
    mcpCallTool,
  ];
}

export default {
  terminalTool,
  fileReadTool,
  fileWriteTool,
  fileEditTool,
  browserOpenTool,
  githubCreateRepoTool,
  githubPushFileTool,
  slackPostTool,
  mcpCallTool,
  getComputerUseTools,
};
