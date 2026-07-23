'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase, SUPABASE_ENABLED } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!SUPABASE_ENABLED || !supabase) { setLoading(false); return }

    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  /* Every function this hook returns is wrapped in useCallback so its identity
     is stable across renders. Callers memoize on these (the employer console
     builds its fetch helper from getToken); unstable identities put that page
     in an infinite refresh loop. */
  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) return { error: 'Supabase not configured' }
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error?.message }
  }, [])

  const signUp = useCallback(async (email: string, password: string) => {
    if (!supabase) return { error: 'Supabase not configured' }
    const { error } = await supabase.auth.signUp({ email, password })
    return { error: error?.message }
  }, [])

  const signOut = useCallback(async () => {
    if (!supabase) return
    await supabase.auth.signOut()
    setUser(null)
  }, [])

  const signInWithGoogle = useCallback(async () => {
    if (!supabase) {
      return { error: 'Sign-in is not configured on this deployment. Set the Supabase keys and enable the Google provider.' }
    }
    // Redirect back to the page the user was on, minus query and hash: the
    // PKCE code lands on a clean URL, and a stale ?invite= cannot restart an
    // assessment after the round-trip to Google.
    const redirectTo =
      typeof window !== 'undefined' ? window.location.origin + window.location.pathname : undefined
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        queryParams: { prompt: 'select_account' },
      },
    })
    return { error: error?.message }
  }, [])

  const updateName = useCallback(async (firstName: string, lastName: string) => {
    if (!supabase) return { error: 'Supabase not configured' }
    const { data, error } = await supabase.auth.updateUser({ data: { first_name: firstName, last_name: lastName } })
    if (data?.user) setUser(data.user)
    return { error: error?.message }
  }, [])

  const getToken = useCallback(async () => {
    if (!supabase) return null
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token || null
  }, [])

  return { user, loading, signIn, signUp, signOut, signInWithGoogle, updateName, getToken, isLoggedIn: !!user }
}
