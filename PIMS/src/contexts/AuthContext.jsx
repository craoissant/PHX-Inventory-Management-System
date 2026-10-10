
import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { apiFetch } from '../lib/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [pimsUser, setPimsUser] = useState(null)
  const [loading, setLoading] = useState(true)

  async function loadPimsUser(currentSession) {
    if (!currentSession) {
      setPimsUser(null)
      return
    }

    try {
      const data = await apiFetch('/api/auth/me')
      setPimsUser(data)
    } catch (error) {
      console.error('Error loading PIMS user:', error)
      setPimsUser(null)
    }
  }

  useEffect(() => {
    let mounted = true

    async function getInitialSession() {
      const { data, error } = await supabase.auth.getSession()

      if (error) {
        console.error('Error getting session:', error)
      }

      if (!mounted) return

      setSession(data.session)

      console.log('SUPABASE AUTH DEBUG:', {
  hasSession: !!data.session,
  hasAccessToken: !!data.session?.access_token,
  expiresAt: data.session?.expires_at,
  user: data.session?.user?.email,
})

      if (data.session) {
        await loadPimsUser(data.session)
      } else {
        setPimsUser(null)
      }

      if (mounted) {
        setLoading(false)
      }
    }

    getInitialSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return

      setSession(session)

      // Let Supabase finish updating its internal session state
      // before making an authenticated API request.
      setTimeout(() => {
        if (!mounted) return

        loadPimsUser(session)
      }, 0)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        pimsUser,
        loading,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
