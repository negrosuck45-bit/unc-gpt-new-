#!/usr/bin/env bash
set -euo pipefail

repo="negrosuck45-bit/unc-gpt-new-"
branch="main"
workdir="/home/ubuntu/unc-gpt-new"
tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

cd "$workdir"
printf 'Running production preflight: tests, build, and source check...\n'
pnpm test
pnpm build
git diff --check

files=(
  "app/api/chat/route.ts"
  "app/api/mcp/github/route.ts"
  "app/api/mcp/vercel/route.ts"
  "app/api/mcp/oauth/status/route.ts"
  "components/chat-interface.tsx"
  "components/chat-interface-computer-use.tsx"
  "components/voice-chat.tsx"
  "components/message-content.tsx"
  "components/chat-messages.tsx"
  "components/chat-input.tsx"
  "components/oauth-connectors.tsx"
  "components/connector-permission-card.tsx"
  "app/api/connectors/composio/connect/route.ts"
  "app/api/connectors/composio/manage/route.ts"
  "app/api/connectors/composio/status/route.ts"
  "lib/connector-results.ts"
  "lib/composio.ts"
  "lib/auth.ts"
  "lib/chat-store.ts"
  "lib/client-runtime-context.ts"
  "lib/agents/auto-detection.ts"
  "lib/uncgpt-router.ts"
  "scripts/publish-agent-upgrade.sh"
)

base_commit="$(gh api "repos/$repo/git/ref/heads/$branch" --jq '.object.sha')"
base_tree="$(gh api "repos/$repo/git/commits/$base_commit" --jq '.tree.sha')"

create_blob() {
  local source_file="$1"
  local payload="$tmpdir/blob.json"
  printf '{"content":"' > "$payload"
  base64 -w 0 "$source_file" >> "$payload"
  printf '","encoding":"base64"}\n' >> "$payload"
  gh api --method POST "repos/$repo/git/blobs" --input "$payload" --jq '.sha'
}

printf '{"base_tree":"%s","tree":[' "$base_tree" > "$tmpdir/tree.json"
for index in "${!files[@]}"; do
  path="${files[$index]}"
  sha="$(create_blob "$workdir/$path")"
  if [[ "$index" -gt 0 ]]; then printf ',' >> "$tmpdir/tree.json"; fi
  printf '{"path":"%s","mode":"100644","type":"blob","sha":"%s"}' "$path" "$sha" >> "$tmpdir/tree.json"
done
printf ']}\n' >> "$tmpdir/tree.json"

new_tree="$(gh api --method POST "repos/$repo/git/trees" --input "$tmpdir/tree.json" --jq '.sha')"
printf '{"message":"Rebuild connector-aware chat agent","tree":"%s","parents":["%s"]}\n' "$new_tree" "$base_commit" > "$tmpdir/commit.json"
new_commit="$(gh api --method POST "repos/$repo/git/commits" --input "$tmpdir/commit.json" --jq '.sha')"

gh api --method PATCH "repos/$repo/git/refs/heads/$branch" -f sha="$new_commit" -F force=false --jq '.object.sha'
printf 'Published commit %s to %s/%s\n' "$new_commit" "$repo" "$branch"
printf 'Git push completed. Production must still be checked for a READY deployment before the release is reported live.\n'
