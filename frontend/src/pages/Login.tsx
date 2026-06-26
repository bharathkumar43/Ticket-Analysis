import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { login } from '../api/client'

export function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(username, password)
      navigate('/')
    } catch {
      setError('Invalid username or password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#f8fafc', fontFamily: 'system-ui, sans-serif',
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, padding: '40px 36px', width: 360,
        boxShadow: '0 4px 24px rgba(0,0,0,0.08)', border: '1px solid #e5e7eb',
      }}>
        <div style={{ marginBottom: 28, textAlign: 'center' }}>
          <div style={{ fontSize: 28 }}>📊</div>
          <h1 style={{ margin: '8px 0 4px', fontSize: 22, fontWeight: 700, color: '#1e1b4b' }}>MigrationOps</h1>
          <p style={{ margin: 0, fontSize: 14, color: '#6b7280' }}>Analytics Platform</p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 13, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 5 }}>
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              style={{
                width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #d1d5db',
                fontSize: 14, boxSizing: 'border-box', outline: 'none',
              }}
              required
              autoFocus
            />
          </div>
          <div>
            <label style={{ fontSize: 13, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 5 }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              style={{
                width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #d1d5db',
                fontSize: 14, boxSizing: 'border-box', outline: 'none',
              }}
              required
            />
          </div>

          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '9px 12px', fontSize: 13, color: '#dc2626' }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 8,
              padding: '11px', fontSize: 14, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
              marginTop: 4, opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
