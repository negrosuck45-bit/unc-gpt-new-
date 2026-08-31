import assert from "node:assert/strict"
import test from "node:test"
import fs from "node:fs"

const root = new URL("../", import.meta.url)
const read = (path) => fs.readFileSync(new URL(path, root), "utf8")

test("home is dynamic and cannot reuse a logged-out onboarding shell", () => {
  const source = read("app/page.tsx")
  assert.match(source, /export const dynamic = ["']force-dynamic["']/)
  assert.match(source, /export const revalidate = 0/)
  assert.match(source, /const session = await getSession\(\)/)
  assert.match(source, /return <ChatWorkspace accountScope=\{session\.user\.sub\} \/>/)
})

test("successful OAuth redirect is private and uncached", () => {
  const source = read("lib/lunar-auth.ts")
  assert.match(source, /response\.headers\.set\(["']Cache-Control["'], ["']private, no-store, max-age=0["']\)/)
  assert.match(source, /response\.headers\.set\(["']Pragma["'], ["']no-cache["']\)/)
  assert.match(source, /new URL\(["']\/["'], request\.url\)/)
})

test("OAuth branding guidance keeps provider-managed text honest", () => {
  const source = read("docs/oauth-branding.md")
  assert.match(source, /Google Cloud OAuth consent-screen configuration/)
  assert.match(source, /LUNAR_APP_URL/)
  assert.match(source, /redirect_uri_mismatch/)
})
