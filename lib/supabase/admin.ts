import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let cached: SupabaseClient | null | undefined

export function getSupabaseAdmin(): SupabaseClient | null {
  if (cached !== undefined) return cached
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  cached = url && key ? createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }) : null
  return cached
}

export const CHAT_UPLOAD_BUCKET = 'chat-private-uploads'
export const PROFILE_MEDIA_BUCKET = 'profile-media'
