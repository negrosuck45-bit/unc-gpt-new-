# Connector Authorization Requirements

## Principle

UNC GPTT distinguishes between reading information and changing data outside the workspace. A supported service must be connected and enabled for the signed-in account before it can be used. An external write requires a second, separate approval for the exact request. That approval expires after ten minutes and cannot be reused by another account or for a different request.

## Current recovery status

| Service | Status in this recovery session | What is required before action |
|---|---|---|
| GitHub | Available for repository recovery work | Explicit approval of the exact commit, edit, or repository action. |
| Vercel | Available for read-only production review | Explicit approval of the exact deployment after a validated build is ready. |
| Gmail | Not enabled | The account owner must explicitly authorize Gmail before any draft or send action can be requested, then approve the exact outgoing action. |
| Other connected apps | Not assumed | The account owner must connect and enable the supported service, then approve the exact change. |

## Safeguards

The review card does not call a connector, send an email, commit a change, or deploy an application. It passes a single-use approval token only after the user selects **Approve and continue**. The server verifies the signed-in account, normalized request text, and expiry before allowing the connected-action path to proceed.
