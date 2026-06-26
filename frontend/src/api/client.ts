import axios from 'axios'

export const apiClient = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

apiClient.interceptors.request.use(config => {
  const token = localStorage.getItem('auth_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

apiClient.interceptors.response.use(
  res => res,
  err => {
    const code = err.response?.data?.error?.code
    // Only redirect to login for app-auth failures, not upstream service failures (e.g. JIRA_AUTH_FAILED)
    if (err.response?.status === 401 && code !== 'JIRA_AUTH_FAILED') {
      localStorage.removeItem('auth_token')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export async function login(username: string, password: string): Promise<string> {
  const res = await axios.post('/api/auth/login', { username, password })
  const token = res.data.token
  localStorage.setItem('auth_token', token)
  return token
}

export function logout() {
  localStorage.removeItem('auth_token')
  window.location.href = '/login'
}

export function isAuthenticated(): boolean {
  return !!localStorage.getItem('auth_token')
}
