import fetch from 'node-fetch';

/**
 * Auto-detect if a request needs computer use capabilities
 */
export async function detectComputerUseNeeded(userMessage: string): Promise<boolean> {
  // Quick regex-based detection first (fast path)
  const computerUseKeywords = [
    // File/directory operations
    /create|write|mkdir|folder|directory|file|folder/i,
    /delete|remove|rm|trash/i,
    /edit|modify|update|replace|change/i,
    /read|cat|grep|search|list|ls|find/i,

    // Terminal/command execution
    /run|execute|bash|shell|terminal|npm|yarn|git|npx/i,
    /install|add|pip/i,
    /push|commit|pull|clone/i,

    // Browser/web automation
    /open|visit|website|navigate|browser|url/i,
    /click|fill|submit|type|scroll/i,

    // Code generation/creation
    /app|project|scaffold|generate|build|website|site/i,
    /react|next|vue|angular|tailwind|css|html|js|ts/i,

    // GitHub operations
    /repo|github|repository/i,

    // Deployment/DevOps
    /deploy|build|compile|start|server/i,
    /docker|kubernetes/i,

    // Database operations
    /database|sql|db|migrate|seed/i,

    // API operations
    /api|request|fetch|http|curl|wget/i,

    // Slack/notifications
    /slack|message|notify/i,

    // System operations
    /system|process|job|background|service/i,

    // Generic "Do it" triggers
    /do it|make it|fix it|set it up|go ahead/i,
  ];

  // Connected-service requests must stay in the connector chat flow. The old
  // detector treated words such as "create", "repo", "github", "list", and
  // "message" as computer-use signals, which sent legitimate OAuth/Composio
  // actions to the separate MCP gateway and produced false "no Git provider"
  // failures. Only use the computer path when the user explicitly asks for a
  // local terminal, filesystem, browser, or code-execution operation.
  const connectedService = /\b(github|gitlab|gmail|google\s+drive|google\s+calendar|slack|notion|linear|vercel|discord|dropbox|trello|jira|supabase|stripe|asana|hubspot|salesforce|airtable|todoist|clickup|monday|zendesk|intercom|shopify|wordpress|mailchimp|twilio|figma|canva|bitbucket|pipedrive|freshdesk|docusign|calendly|replicate|sentry)\b/i.test(userMessage);
  const serviceOperation = /\b(create|add|edit|modify|update|delete|remove|send|post|publish|deploy|commit|push|list|show|get|read|find|search|manage|open)\b/i.test(userMessage);
  const connectorLanguage = /\b(connector|connected account|integration|oauth|mcp|third[- ]party service)\b/i.test(userMessage);
  const resourceContext = /\b(?:in|from|to|on|using|via|through)\s+(?:my|the)?\s*[a-z][a-z0-9_-]*(?:\s+[a-z][a-z0-9_-]*)?\s+(?:account|workspace|project|repo|repository|board|page|database|calendar|inbox|channel|file|document|record|issue|deployment|table|task|card)\b/i.test(userMessage);
  const explicitComputerOperation = /\b(terminal|shell|bash|command line|run a command|execute a command|filesystem|local file|local folder|directory on my computer|browser automation|open a browser|navigate in the browser|click|type into|scroll|run code|execute code)\b/i.test(userMessage);

  if ((connectedService || connectorLanguage || resourceContext) && serviceOperation && !explicitComputerOperation) {
    return false;
  }

  // Check if message matches any computer use keywords
  const needsComputerUse = computerUseKeywords.some(regex => regex.test(userMessage));

  if (needsComputerUse) {
    return true;
  }

  // If no keywords matched, use LLM-based detection (slower but more accurate)
  try {
    return await detectWithLLM(userMessage);
  } catch (error) {
    // If LLM detection fails, fall back to keyword detection result
    console.error('LLM detection failed:', error);
    return false;
  }
}

/**
 * Use a fast LLM to detect if computer use is needed
 */
async function detectWithLLM(userMessage: string): Promise<boolean> {
  const groqApiKey = process.env.GROQ_API_KEY;
  
  if (!groqApiKey) {
    // No API key, use keyword detection only
    return false;
  }

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${groqApiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          {
            role: 'system',
            content: `You are a classifier that determines if a user request requires computer use (file operations, terminal commands, browser automation, code execution, etc.).

Respond with ONLY "YES" or "NO".

YES = The request requires:
- File system operations (create, read, write, delete files)
- Terminal/shell command execution
- Browser automation or web navigation
- Code execution or project creation
- Git/GitHub operations
- API calls or external service integration
- System-level operations

NO = The request is purely informational or conversational (answering questions, explaining concepts, etc.)`,
          },
          {
            role: 'user',
            content: userMessage,
          },
        ],
        max_tokens: 10,
        temperature: 0,
      }),
    });

    const data = (await response.json()) as any;
    const answer = data.choices?.[0]?.message?.content?.trim().toUpperCase();
    return answer === 'YES';
  } catch (error) {
    console.error('LLM detection error:', error);
    return false;
  }
}

export default detectComputerUseNeeded;
