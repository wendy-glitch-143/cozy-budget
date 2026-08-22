import { onMounted, ref } from 'vue'

const TOKEN_KEY = 'cozy-budget-token'
const API_BASE = String(import.meta.env.VITE_API_BASE || '').replace(/\/$/, '')

export interface AuthUser {
  id: string
  username: string
}

const token = ref(localStorage.getItem(TOKEN_KEY) || '')
const user = ref<AuthUser | null>(null)
const ready = ref(false)
const authError = ref('')
const authBusy = ref(false)

function authApiUrl(path: string) {
  return `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`
}

export function getToken() {
  return token.value
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY)
  token.value = ''
  user.value = null
}

function persist(nextToken: string, nextUser: AuthUser) {
  localStorage.setItem(TOKEN_KEY, nextToken)
  token.value = nextToken
  user.value = nextUser
  authError.value = ''
}

async function loadMe() {
  if (!token.value) {
    user.value = null
    ready.value = true
    return
  }
  try {
    const res = await fetch(authApiUrl('/api/auth/me'), {
      headers: { Authorization: `Bearer ${token.value}` },
    })
    if (!res.ok) {
      clearSession()
      return
    }
    user.value = (await res.json()) as AuthUser
  } catch {
    clearSession()
  } finally {
    ready.value = true
  }
}

async function submit(
  path: '/api/auth/login' | '/api/auth/signup',
  username: string,
  password: string,
) {
  authBusy.value = true
  authError.value = ''
  try {
    const res = await fetch(authApiUrl(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    const raw = await res.text()
    let body: {
      error?: string
      token?: string
      user?: AuthUser
    } = {}
    try {
      body = raw ? (JSON.parse(raw) as typeof body) : {}
    } catch {
      body = {}
    }
    if (!res.ok || !body.token || !body.user) {
      throw new Error(
        body.error || raw || `Could not continue (${res.status}).`,
      )
    }
    persist(body.token, body.user)
  } catch (err) {
    authError.value = err instanceof Error ? err.message : 'Could not continue.'
  } finally {
    authBusy.value = false
  }
}

export function useAuth() {
  onMounted(() => {
    void loadMe()
  })

  return {
    user,
    ready,
    authError,
    authBusy,
    login: (username: string, password: string) =>
      submit('/api/auth/login', username, password),
    signup: (username: string, password: string) =>
      submit('/api/auth/signup', username, password),
    logout: clearSession,
  }
}
