'use client'

import { createClient } from '@/lib/supabase/client'
import { useEffect, useState, useCallback } from 'react'
import type { User } from '@supabase/supabase-js'

export interface UserProfile {
  id: string
  name: string | null
  email: string | null
  avatar_url: string | null
  provider: string | null
}

function extractProfile(user: User): UserProfile {
  const meta = user.user_metadata || {}
  return {
    id: user.id,
    email: user.email ?? null,
    name: meta.full_name ?? meta.name ?? meta.user_name ?? null,
    avatar_url: meta.avatar_url ?? meta.picture ?? null,
    provider: user.app_metadata?.provider ?? null,
  }
}

export function useAuth() {
  const supabase = createClient()
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setProfile(session?.user ? extractProfile(session.user) : null)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      setProfile(session?.user ? extractProfile(session.user) : null)
    })

    return () => subscription.unsubscribe()
  }, [])

  const getOAuthRedirectUrl = () => {
    if (typeof window === 'undefined') return 'http://localhost:3000/auth/callback'
    const url = new URL(window.location.origin)
    // For localhost development, use full URL
    // For production, Supabase will use the configured URL
    return `${url.origin}/auth/callback`
  }

  const signInWithGithub = useCallback(async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: { redirectTo: getOAuthRedirectUrl() },
    })
  }, [])

  const signInWithGoogle = useCallback(async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: getOAuthRedirectUrl() },
    })
  }, [])

  const signInWithGitlab = useCallback(async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'gitlab',
      options: { redirectTo: getOAuthRedirectUrl() },
    })
  }, [])

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return error
  }, [])

  const signUpWithEmail = useCallback(async (email: string, password: string, name: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name } },
    })
    return error
  }, [])

  const updateProfile = useCallback(async (updates: { name?: string; avatar_url?: string }) => {
    const { data, error } = await supabase.auth.updateUser({
      data: {
        ...(updates.name !== undefined && { full_name: updates.name }),
        ...(updates.avatar_url !== undefined && { avatar_url: updates.avatar_url }),
      },
    })
    if (!error && data.user) {
      setUser(data.user)
      setProfile(extractProfile(data.user))
    }
    return error
  }, [])

  // Upload avatar to Supabase Storage (same bucket as chat images)
  const uploadAvatar = useCallback(async (file: File): Promise<string | null> => {
    if (!user) return null
    const ext = file.name.split('.').pop() ?? 'jpg'
    const path = `avatars/${user.id}-${Date.now()}.${ext}`
    const { error } = await supabase.storage
      .from('chat-attachments')
      .upload(path, file, { upsert: true, contentType: file.type })
    if (error) { console.error('Avatar upload error:', error); return null }
    const { data } = supabase.storage.from('chat-attachments').getPublicUrl(path)
    return data.publicUrl
  }, [user])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  return {
    user, profile, loading,
    signInWithGithub, signInWithGoogle, signInWithGitlab,
    signInWithEmail, signUpWithEmail,
    updateProfile, uploadAvatar,
    signOut,
  }
}
