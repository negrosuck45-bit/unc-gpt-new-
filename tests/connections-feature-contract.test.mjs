import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("..", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("connections use shared platform metadata, owner-authenticated CRUD, and public server-side display", async () => {
  const [metadata, route, profilePage, settings, publicRow, migration] = await Promise.all([
    read("lib/profile-connections.ts"),
    read("app/api/connections/route.ts"),
    read("app/[username]/page.tsx"),
    read("components/connections-settings.tsx"),
    read("components/connections-row.tsx"),
    read("supabase/migrations/20260905150000_create_connections.sql"),
  ]);

  for (const platform of ["discord", "instagram", "tiktok", "github", "youtube", "spotify", "website"]) {
    assert.match(metadata, new RegExp(`id: "${platform}"`));
  }
  assert.match(route, /getSession/);
  assert.match(route, /\.eq\("user_id", userId\)/);
  assert.match(profilePage, /async function getConnections/);
  assert.match(profilePage, /connections=\{connections\}/);
  assert.match(settings, /CONNECTION_PLATFORMS/);
  assert.match(publicRow, /navigator\.clipboard/);
  assert.match(publicRow, /target="_blank"/);
  assert.match(migration, /references auth\.users\(id\) on delete cascade/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /Anyone can read public profile connections/);
  assert.match(migration, /Owners can add their own connections/);
  assert.match(migration, /Owners can update their own connections/);
  assert.match(migration, /Owners can remove their own connections/);
});

test("chat streaming restores model-provided thinking without private-thought wording", async () => {
  const [chatRoute, messages, interfaceCode] = await Promise.all([
    read("app/api/chat/route.ts"),
    read("components/chat-messages.tsx"),
    read("components/chat-interface.tsx"),
  ]);

  assert.match(chatRoute, /JSON\.stringify\(\{ reasoning \}\)/);
  assert.doesNotMatch(messages, /private chain-of-thought/);
  assert.match(messages, /Thinking/);
  assert.match(interfaceCode, /setThinkingText/);
  assert.match(chatRoute, /reasoning_effort: "low"/);
});
