import { getSupabaseAdmin } from "@/lib/supabase/admin"
import type { LunarOAuthProvider, LunarSessionUser } from "@/lib/lunar-auth"

const LEGACY_LINKS_TABLE = "lunar_auth_identities"
const CLERK_USERS_ENDPOINT = "https://api.clerk.com/v1/users"
const CLERK_LOOKUP_TIMEOUT_MS = 3000

type ClerkVerification = { status?: unknown } | null
type ClerkEmailAddress = {
  id?: unknown
  email_address?: unknown
  verification?: ClerkVerification
}
type ClerkExternalAccount = {
  provider?: unknown
  provider_user_id?: unknown
}
type ClerkUser = {
  id?: unknown
  banned?: unknown
  locked?: unknown
  primary_email_address_id?: unknown
  email_addresses?: unknown
  external_accounts?: unknown
}
type ClerkUserList = { data?: unknown }
type StoredLink = { account_scope?: unknown }

type LookupResult =
  | { kind: "linked"; accountScope: string }
  | { kind: "missing" }
  | { kind: "unavailable" }
  | { kind: "conflict" }

function normaliseEmail(value: string) {
  return value.trim().toLowerCase()
}

function isLegacyClerkUserId(value: unknown): value is string {
  return typeof value === "string" && /^user_[A-Za-z0-9]+$/.test(value)
}

function isLegacyUserActive(user: ClerkUser) {
  return user.banned !== true && user.locked !== true && isLegacyClerkUserId(user.id)
}

function providerUserId(user: LunarSessionUser) {
  const prefix = `${user.provider}:`
  if (!user.sub.startsWith(prefix)) return null
  const value = user.sub.slice(prefix.length)
  return value && value.length <= 255 ? value : null
}

function clerkProvider(provider: LunarOAuthProvider) {
  return `oauth_${provider}`
}

function isVerifiedEmailAddress(address: ClerkEmailAddress, email: string) {
  return typeof address.email_address === "string"
    && normaliseEmail(address.email_address) === normaliseEmail(email)
    && address.verification?.status === "verified"
}

function hasMatchingExternalAccount(user: ClerkUser, provider: LunarOAuthProvider, userId: string) {
  if (!Array.isArray(user.external_accounts)) return false
  return user.external_accounts.some((account) => {
    if (!account || typeof account !== "object") return false
    const externalAccount = account as ClerkExternalAccount
    return externalAccount.provider === clerkProvider(provider)
      && externalAccount.provider_user_id === userId
  })
}

function hasVerifiedPrimaryEmail(user: ClerkUser, email: string) {
  if (!Array.isArray(user.email_addresses) || typeof user.primary_email_address_id !== "string") return false
  const primary = user.email_addresses.find((address) => {
    return Boolean(address && typeof address === "object" && (address as ClerkEmailAddress).id === user.primary_email_address_id)
  }) as ClerkEmailAddress | undefined
  return Boolean(primary && isVerifiedEmailAddress(primary, email))
}

async function listLegacyClerkUsers(parameters: Array<[string, string]>) {
  const secret = process.env.CLERK_SECRET_KEY
  if (!secret) return []

  const url = new URL(CLERK_USERS_ENDPOINT)
  url.searchParams.set("limit", "2")
  parameters.forEach(([name, value]) => url.searchParams.append(name, value))

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${secret}`,
        Accept: "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(CLERK_LOOKUP_TIMEOUT_MS),
    })
    if (!response.ok) return null
    const payload = await response.json() as ClerkUserList
    return Array.isArray(payload.data) ? payload.data.filter((user): user is ClerkUser => Boolean(user && typeof user === "object")) : []
  } catch {
    return null
  }
}

function uniqueLegacyScope(users: ClerkUser[], predicate: (user: ClerkUser) => boolean) {
  const scopes = users
    .filter((user) => isLegacyUserActive(user) && predicate(user))
    .map((user) => user.id)
    .filter(isLegacyClerkUserId)
  return scopes.length === 1 ? scopes[0] : null
}

async function findLegacyAccountScope(user: LunarSessionUser): Promise<LookupResult> {
  const externalId = providerUserId(user)
  if (!externalId) return { kind: "conflict" }

  const providerMatches = await listLegacyClerkUsers([
    ["provider", clerkProvider(user.provider)],
    ["provider_user_id", externalId],
  ])
  if (providerMatches === null) return { kind: "unavailable" }

  const exactProviderScope = uniqueLegacyScope(providerMatches, (candidate) => hasMatchingExternalAccount(candidate, user.provider, externalId))
  if (exactProviderScope) return { kind: "linked", accountScope: exactProviderScope }

  const emailMatches = await listLegacyClerkUsers([["email_address", user.email]])
  if (emailMatches === null) return { kind: "unavailable" }
  const emailScope = uniqueLegacyScope(emailMatches, (candidate) => hasVerifiedPrimaryEmail(candidate, user.email))
  return emailScope ? { kind: "linked", accountScope: emailScope } : { kind: "missing" }
}

async function readStoredLink(providerSubject: string): Promise<LookupResult> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return { kind: "unavailable" }

  const { data, error } = await supabase
    .from(LEGACY_LINKS_TABLE)
    .select("account_scope")
    .eq("provider_subject", providerSubject)
    .maybeSingle()

  if (error) return { kind: "unavailable" }
  if (!data) return { kind: "missing" }
  const link = data as StoredLink
  if (!isLegacyClerkUserId(link.account_scope)) return { kind: "conflict" }
  return { kind: "linked", accountScope: link.account_scope }
}

async function persistStoredLink(user: LunarSessionUser, accountScope: string): Promise<LookupResult> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return { kind: "unavailable" }

  const { error } = await supabase
    .from(LEGACY_LINKS_TABLE)
    .upsert({
      provider_subject: user.sub,
      provider: user.provider,
      account_scope: accountScope,
      linked_via: "legacy-clerk",
    }, { onConflict: "provider_subject", ignoreDuplicates: true })

  if (error) return { kind: "unavailable" }
  const stored = await readStoredLink(user.sub)
  if (stored.kind === "linked" && stored.accountScope !== accountScope) return { kind: "conflict" }
  return stored
}

/**
 * Resolves a direct Lunar provider identity to its original account-isolation
 * scope. A stored link wins. A missing link can be created only from a unique,
 * active legacy Clerk user whose provider subject matches exactly, or whose
 * primary email is independently verified and matches exactly. Any ambiguity,
 * conflict, missing identity-link table, or legacy lookup failure fails closed.
 */
export async function resolveLunarAccountScope(user: LunarSessionUser): Promise<string | null> {
  const stored = await readStoredLink(user.sub)
  if (stored.kind === "linked") return stored.accountScope
  if (stored.kind !== "missing") return null

  const legacy = await findLegacyAccountScope(user)
  if (legacy.kind === "unavailable" || legacy.kind === "conflict") return null
  if (legacy.kind === "missing") return user.sub

  const persisted = await persistStoredLink(user, legacy.accountScope)
  return persisted.kind === "linked" ? persisted.accountScope : null
}
