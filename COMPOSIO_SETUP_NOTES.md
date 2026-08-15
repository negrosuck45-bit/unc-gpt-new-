# Composio setup notes

## Canonical documentation

- https://docs.composio.dev/llms.txt
- https://docs.composio.dev/docs/quickstart.md
- https://docs.composio.dev/docs/configuring-sessions.md
- https://docs.composio.dev/toolkits/meta-tools/manage_connections.md

The current TypeScript guidance uses `@composio/core`, a project `COMPOSIO_API_KEY`, a stable application user ID, and `composio.sessions.create(...)` or `composio.create(...)`. Sessions expose meta tools for discovery and connection management. A provider-level call should only happen after the toolkit connection is active.

## Verified Composio state

The project key was stored in the ignored local `.env.local` file and added to Vercel Production as `COMPOSIO_API_KEY` without printing the secret. The requested skill command installed `ComposioHQ/composio --skill composio` into `.agents/skills/composio`.

A Composio session was created for the stable first-call identity `uncgpt_first_call`. GitHub authorization was initiated with a Composio Connect Link, the user completed authorization, and the connection status became ACTIVE for the GitHub account `negrosuck45-bit`.

A safe read-only provider call succeeded using the discovered tool slug `GITHUB_LIST_REPOSITORIES_FOR_THE_AUTHENTICATED_USER` with `per_page: 10`, `sort: updated`, and `direction: desc`. Composio returned repository data and log ID `log_BMnk2el0VEpz`. No write or destructive tool was used.
