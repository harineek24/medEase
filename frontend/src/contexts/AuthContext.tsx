import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'

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
}

const AUTH_STORAGE_KEY = 'medease_auth'

const defaultState: AuthState = {
  role: null,
  user: null,
  doctorId: undefined,
  patientId: undefined,
  clinicId: undefined,
}

const AuthContext = createContext<AuthContextValue | null>(null)

function loadAuthState(): AuthState {
  try {
    const stored = localStorage.getItem(AUTH_STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (parsed && parsed.role) {
        return parsed
      }
    }
  } catch {
    // Ignore parse errors
  }
  return defaultState
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>(loadAuthState)
  const navigate = useNavigate()

  // Persist auth state to localStorage whenever it changes
  useEffect(() => {
    if (authState.role) {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authState))
    } else {
      localStorage.removeItem(AUTH_STORAGE_KEY)
    }
  }, [authState])

  const login = useCallback((state: Omit<AuthState, 'role'> & { role: NonNullable<AuthState['role']> }) => {
    setAuthState(state)
  }, [])

  const logout = useCallback(() => {
    setAuthState(defaultState)
    localStorage.removeItem(AUTH_STORAGE_KEY)
    navigate('/')
  }, [navigate])

  const value: AuthContextValue = {
    ...authState,
    login,
    logout,
    isAuthenticated: authState.role !== null,
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
