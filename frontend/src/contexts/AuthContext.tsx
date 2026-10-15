import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { API_BASE_URL } from '@/api'

export interface AuthState {
  role: 'clinicadmin' | 'doctor' | 'patient' | null
  user: any
  doctorId?: number
  patientId?: number
  clinicId?: number
}

interface AuthContextValue extends AuthState {
  login: (state: Omit<AuthState, 'role'> & { role: NonNullable<AuthState['role']> }) => void
  logout: () => void
  isAuthenticated: boolean
  isLoading: boolean
}

const defaultState: AuthState = {
  role: null,
  user: null,
  doctorId: undefined,
  patientId: undefined,
  clinicId: undefined,
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>(defaultState)
  const [isLoading, setIsLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    let active = true
    fetch(`${API_BASE_URL}/api/auth/me`, { credentials: 'include' })
      .then(async (response) => response.ok ? response.json() : null)
      .then((data) => {
        if (!active || !data?.role) return
        setAuthState({
          role: data.role,
          user: data.user,
          clinicId: data.clinic_id ?? undefined,
          doctorId: data.role === 'doctor' ? data.user.id : undefined,
          patientId: data.role === 'patient' ? data.user.id : undefined,
        })
      })
      .catch(() => undefined)
      .finally(() => { if (active) setIsLoading(false) })
    return () => { active = false }
  }, [])

  const login = useCallback((state: Omit<AuthState, 'role'> & { role: NonNullable<AuthState['role']> }) => {
    setAuthState(state)
    setIsLoading(false)
  }, [])

  const logout = useCallback(() => {
    void fetch(`${API_BASE_URL}/api/auth/logout`, { method: 'POST', credentials: 'include' }).catch(() => undefined)
    setAuthState(defaultState)
    navigate('/')
  }, [navigate])

  const value: AuthContextValue = {
    ...authState,
    login,
    logout,
    isAuthenticated: authState.role !== null,
    isLoading,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export default AuthContext
