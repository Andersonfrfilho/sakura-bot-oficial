import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { api } from '@/lib/api'

interface AuthUser {
  id: string
  name: string
  email: string
  role: string
  establishmentId: string
  passwordMustChange: boolean
}

interface AuthState {
  user: AuthUser | null
  accessToken: string | null
  refreshToken: string | null
  isAuthenticated: boolean
  login(email: string, password: string): Promise<void>
  logout(): Promise<void>
  refresh(): Promise<boolean>
  clearPasswordMustChange(): void
}

interface LoginResponse {
  accessToken: string
  refreshToken: string
  user: AuthUser
}

interface RefreshResponse {
  accessToken: string
  refreshToken: string
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,

      async login(email, password, remember = false) {
        const data = await api.post<LoginResponse>('/auth/login', { email, password })
        set({
          user: data.user,
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          isAuthenticated: true,
        })
        if (remember) {
          localStorage.setItem('order-hub-email', email)
        } else {
          localStorage.removeItem('order-hub-email')
        }
      },

      async logout() {
        const { refreshToken, accessToken } = get()
        if (refreshToken) {
          try {
            await api.post('/auth/logout', { refreshToken }, accessToken ?? undefined)
          } catch {
            // Best effort
          }
        }
        set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false })
      },

      clearPasswordMustChange() {
        set((state) => ({
          user: state.user ? { ...state.user, passwordMustChange: false } : null,
        }))
      },

      async refresh() {
        const { refreshToken } = get()
        if (!refreshToken) return false
        try {
          const data = await api.post<RefreshResponse>('/auth/refresh', { refreshToken })
          set({ accessToken: data.accessToken, refreshToken: data.refreshToken })
          return true
        } catch {
          set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false })
          return false
        }
      },
    }),
    {
      name: 'order-hub-auth',
      partialize: (state) => ({
        user: state.user,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
)
