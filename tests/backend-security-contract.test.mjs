import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const root = new URL('../', import.meta.url)
const source = (relativePath) => fs.readFileSync(new URL(relativePath, root), 'utf8')

test('enforces a signed Lunar session and same-origin boundary for private API requests', () => {
  const proxy = source('proxy.ts')
  assert.match(proxy, /import \{ getLunarSessionFromToken, LUNAR_SESSION_COOKIE \} from "@\/lib\/lunar-auth"/)
  assert.match(proxy, /STATE_CHANGING_METHODS/)
  assert.match(proxy, /hasTrustedOrigin\(request\)/)
  assert.match(proxy, /Cross-site requests are not allowed/)
  assert.match(proxy, /request\.cookies\.get\(LUNAR_SESSION_COOKIE\)/)
  assert.match(proxy, /const session = await getLunarSessionFromToken\(token\)/)
  assert.match(proxy, /Sign in is required/)
  assert.match(proxy, /MCP_OAUTH_CALLBACK_PATH/)
  assert.match(proxy, /LUNAR_OAUTH_PATH/)
  assert.doesNotMatch(proxy, /clerkMiddleware|@clerk\/nextjs/)
  assert.doesNotMatch(proxy, /PUBLIC_API_PATHS = new Set\(\[\]\)/)
})

test('sets restrictive production response and caching headers', () => {
  const config = source('next.config.mjs')
  assert.match(config, /poweredByHeader: false/)
  assert.match(config, /Content-Security-Policy/)
  assert.match(config, /frame-ancestors 'none'/)
  assert.match(config, /object-src 'none'/)
  assert.match(config, /Strict-Transport-Security.*max-age=63072000/)
  assert.match(config, /Cross-Origin-Opener-Policy/)
  assert.match(config, /Cache-Control[\s\S]*no-store, max-age=0, must-revalidate, private/)
})

test('stores new chat attachments as encrypted private objects served only to their owner', () => {
  const upload = source('app/api/storage/upload/route.ts')
  const download = source('app/api/storage/file/route.ts')
  const storage = source('lib/supabase/admin.ts')
  assert.match(storage, /CHAT_UPLOAD_BUCKET = 'chat-private-uploads'/)
  assert.match(upload, /getSession\(\)/)
  assert.match(upload, /aes-256-gcm/)
  assert.match(upload, /public: false/)
  assert.match(upload, /ALLOWED_MIME_TYPES/)
  assert.match(upload, /metadataError \|\| !metadata\?\.id/)
  assert.doesNotMatch(upload, /getPublicUrl/)
  assert.match(download, /createDecipheriv\('aes-256-gcm'/)
  assert.match(download, /path\.startsWith\(userPrefix\)/)
  assert.match(download, /\.eq\('user_id', session\.user\.sub\)/)
  assert.match(download, /Cache-Control': 'private, no-store, max-age=0'/)
})

test('scopes RAG, analytics, and connector actions to the signed-in user', () => {
  for (const path of ['app/api/rag/upload/route.ts', 'app/api/rag/search/route.ts']) {
    const route = source(path)
    assert.match(route, /getSession\(\)/)
    assert.match(route, /scopedProjectId/)
    assert.match(route, /uncgpt-rag-tenant-v1/)
  }
  const analytics = source('app/api/analytics/route.ts')
  assert.match(analytics, /requestedUserMatches/)
  assert.match(analytics, /session\.user\.sub/)
  for (const path of ['app/api/computer-use/route.ts', 'app/api/mcp/github/route.ts', 'app/api/mcp/vercel/route.ts']) {
    const route = source(path)
    assert.match(route, /getSession/)
    assert.match(route, /Sign in is required/)
  }
})

test('renders AI response icons without an added outline or background panel', () => {
  const messages = source('components/chat-messages.tsx')
  const avatarWrapper = messages.match(/\{isAssistant && \([\s\S]{0,360}?<MarsAvatar size=\{28\}/)?.[0] || ''
  assert.match(avatarWrapper, /rounded-full/)
  assert.doesNotMatch(avatarWrapper, /border-white|bg-white|\bborder\b|\bbg-/)
})
