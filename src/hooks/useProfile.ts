'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAuth } from './useAuth'

export interface Profile {
  user_id: string
  kind: 'candidate' | 'employer'
  email: string | null
  first_name: string | null
  last_name: string | null
  company_name: string | null
  company_url: string | null
}

/** The signed-in user's profile, or null when onboarding has not happened.
 *  `ready` is false until both auth and the profile fetch have settled, so
 *  pages can hold their fire instead of flashing the wrong state. */
export function useProfile() {
  const auth = useAuth()
  const { getToken, isLoggedIn, loading: authLoading } = auth
  const [profile, setProfile] = useState<Profile | null>(null)
  const [fetching, setFetching] = useState(false)
  const [fetched, setFetched] = useState(false)

  const refresh = useCallback(async () => {
    if (!isLoggedIn) {
      setProfile(null)
      setFetched(true)
      return
    }
    setFetching(true)
    try {
      const token = await getToken()
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ action: 'get' }),
      })
      const d = await res.json()
      setProfile(res.ok ? d.profile || null : null)
    } catch {
      setProfile(null)
    }
    setFetching(false)
    setFetched(true)
  }, [getToken, isLoggedIn])

  useEffect(() => {
    if (!authLoading) refresh()
  }, [authLoading, refresh])

  const save = useCallback(
    async (fields: Record<string, string>): Promise<{ error?: string }> => {
      const token = await getToken()
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ action: 'save', ...fields }),
      })
      const d = await res.json()
      if (!res.ok) return { error: d.error || 'Could not save.' }
      setProfile(d.profile)
      return {}
    },
    [getToken]
  )

  return { ...auth, profile, profileReady: !authLoading && fetched && !fetching, refreshProfile: refresh, saveProfile: save }
}
