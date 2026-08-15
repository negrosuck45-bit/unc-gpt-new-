# Composio MCP integration notes

Sources consulted on 2026-08-15:

- https://docs.composio.dev/docs
- https://docs.composio.dev/docs/single-toolkit-mcp
- https://composio.dev/pricing

Verified facts:

- Composio supports native tools and hosted MCP sessions.
- Current TypeScript usage uses `@composio/core` and `new Composio({ apiKey: process.env.COMPOSIO_API_KEY })`.
- A per-user session is created with `composio.sessions.create(userId, { mcp: true, ... })` or the equivalent `composio.create(userId, { mcp: true })` surface. The session exposes `session.mcp.url` and `session.mcp.headers`.
- Sessions handle tool discovery and managed authentication; the user ID is passed when creating the session.
- Hosted Composio MCP requests may require an `x-api-key` header when `require_mcp_api_key` is enabled.
- The official docs recommend a regular session for most use cases instead of creating one single-toolkit MCP server.
- The pricing page currently advertises a free tier of 20,000 tool calls per month, with paid plans above that.

Implementation implication:

The app can support Composio as an optional server-side connector, but the production project needs a user-provided `COMPOSIO_API_KEY` stored as a Vercel server environment variable. The key must not be exposed to the browser. Existing OAuth connectors can remain available alongside Composio.
