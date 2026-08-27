import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const root = new URL('../', import.meta.url)
const source = (relativePath) => fs.readFileSync(new URL(relativePath, root), 'utf8')

test('renders Lunar-owned social sign-in choices that delegate OAuth to Clerk', () => {
  const authPanel = source('components/auth-panel.tsx')

  assert.match(authPanel, /useSignIn/)
  assert.match(authPanel, /signIn\.sso\(/)
  assert.match(authPanel, /strategy: "oauth_google"/)
  assert.match(authPanel, /strategy: "oauth_apple"/)
  assert.match(authPanel, /strategy: "oauth_discord"/)
  assert.match(authPanel, /redirectCallbackUrl: "\/sso-callback"/)
  assert.match(authPanel, /src="\/lunar-mark-transparent\.png"/)
  assert.match(authPanel, /Lunar never asks for or receives your Google, Apple, or Discord password/)
  assert.doesNotMatch(authPanel, /type="password"/)
  assert.doesNotMatch(authPanel, /fetch\(/)
})

test('completes the provider handoff through Clerk and keeps sign-up on the Lunar auth surface', () => {
  const callback = source('app/sso-callback/page.tsx')
  const signup = source('app/signup/page.tsx')
  const login = source('app/login/page.tsx')

  assert.match(callback, /AuthenticateWithRedirectCallback/)
  assert.match(callback, /signInUrl="\/login"/)
  assert.match(callback, /signUpUrl="\/signup"/)
  assert.match(callback, /signInFallbackRedirectUrl="\/"/)
  assert.match(signup, /AuthPanel/)
  assert.match(login, /AuthPanel/)
  assert.equal(fs.existsSync(new URL('public/lunar-mark-transparent.png', root)), true)
})
