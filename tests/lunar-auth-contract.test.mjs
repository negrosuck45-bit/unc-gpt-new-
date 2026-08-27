import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const root = new URL('../', import.meta.url)
const source = (relativePath) => fs.readFileSync(new URL(relativePath, root), 'utf8')

test('renders the reference-style Lunar sign-in card with owned provider choices', () => {
  const authPanel = source('components/auth-panel.tsx')

  assert.match(authPanel, /Sign in to Lunar/)
  assert.match(authPanel, /Welcome back! Please sign in to continue\./)
  assert.match(authPanel, /Continue with Google/)
  assert.match(authPanel, /Continue with Discord/)
  assert.match(authPanel, /Continue with Apple/)
  assert.match(authPanel, /Email address/)
  assert.match(authPanel, /Don&apos;t have an account\?/) 
  assert.match(authPanel, /src="\/lunar-mark-transparent\.png"/)
  assert.doesNotMatch(authPanel, /uncgpt/i)
})

test('delegates social authentication and passwordless email verification to Clerk', () => {
  const authPanel = source('components/auth-panel.tsx')

  assert.match(authPanel, /useSignIn/)
  assert.match(authPanel, /signIn\.sso\(/)
  assert.match(authPanel, /strategy: "oauth_google"/)
  assert.match(authPanel, /strategy: "oauth_apple"/)
  assert.match(authPanel, /strategy: "oauth_discord"/)
  assert.match(authPanel, /redirectCallbackUrl: "\/sso-callback"/)
  assert.match(authPanel, /signIn\.emailCode\.sendCode/)
  assert.match(authPanel, /signIn\.emailCode\.verifyCode/)
  assert.match(authPanel, /signUp\.verifications\.sendEmailCode/)
  assert.match(authPanel, /signUp\.verifications\.verifyEmailCode/)
  assert.match(authPanel, /signIn\.finalize/)
  assert.match(authPanel, /signUp\.finalize/)
  assert.match(authPanel, /Lunar never asks for or receives your Google, Apple, or Discord password/)
  assert.doesNotMatch(authPanel, /type="password"/)
  assert.doesNotMatch(authPanel, /\.password\(/)
  assert.doesNotMatch(authPanel, /fetch\(/)
})

test('keeps callbacks, entry routes, and Clerk redirects on Lunar-owned pages', () => {
  const callback = source('app/sso-callback/page.tsx')
  const signup = source('app/signup/page.tsx')
  const login = source('app/login/page.tsx')
  const layout = source('app/layout.tsx')

  assert.match(callback, /useClerk/)
  assert.match(callback, /signIn\.finalize/)
  assert.match(callback, /signUp\.finalize/)
  assert.match(callback, /signIn\.create\(\{ transfer: true \}\)/)
  assert.match(callback, /signUp\.create\(\{ transfer: true \}\)/)
  assert.match(callback, /router\.replace\("\/login"/)
  assert.doesNotMatch(callback, /AuthenticateWithRedirectCallback/)
  assert.match(signup, /AuthPanel mode="sign-up"/)
  assert.match(login, /AuthPanel/)
  assert.match(layout, /signInUrl="\/login"/)
  assert.match(layout, /signUpUrl="\/signup"/)
  assert.equal(fs.existsSync(new URL('public/lunar-mark-transparent.png', root)), true)
})
