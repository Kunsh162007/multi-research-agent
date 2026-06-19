import { useState, useCallback } from 'react'
import { authGoogle } from '../lib/api'
import { saveSession, clearSession, getStoredUser, isLoggedIn } from '../lib/auth'
import type { User } from '../types'

export function useAuth() {
  const [user, setUser] = useState<User | null>(() => {
    if (!isLoggedIn()) return null
    return getStoredUser() as User | null
  })

  const login = useCallback(async (credential: string) => {
    const { access_token, user: userInfo } = await authGoogle(credential)
    saveSession(access_token, userInfo)
    setUser(userInfo as User)
  }, [])

  const logout = useCallback(() => {
    clearSession()
    setUser(null)
  }, [])

  return { user, login, logout, isLoggedIn: Boolean(user) }
}
