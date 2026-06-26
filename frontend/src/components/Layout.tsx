import React from 'react'
import { Link, useLocation, Outlet } from 'react-router-dom'
import { logout } from '../api/client'

const navItems = [
  { path: '/', label: 'Dashboard', icon: '📊' },
  { path: '/explorer', label: 'Segmentation', icon: '🔍' },
  { path: '/manager', label: 'Manager View', icon: '👤' },
  { path: '/alignment', label: 'Alignment', icon: '🔗' },
  { path: '/jira', label: 'Jira Sync', icon: '🔄' },
]

export function Layout() {
  const location = useLocation()

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'system-ui, sans-serif' }}>
      {/* Sidebar */}
      <aside style={{
        width: 220,
        background: '#1e1b4b',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
      }}>
        <div style={{ padding: '24px 20px 16px', color: '#e0e7ff' }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>MigrationOps</div>
          <div style={{ fontSize: 11, color: '#818cf8', marginTop: 2 }}>Analytics Platform</div>
        </div>
        <nav style={{ flex: 1, padding: '8px 12px' }}>
          {navItems.map(({ path, label, icon }) => {
            const active = path === '/' ? location.pathname === '/' : location.pathname.startsWith(path)
            return (
              <Link
                key={path}
                to={path}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '9px 12px',
                  borderRadius: 8,
                  marginBottom: 3,
                  color: active ? '#fff' : '#a5b4fc',
                  background: active ? 'rgba(255,255,255,0.12)' : 'transparent',
                  textDecoration: 'none',
                  fontSize: 14,
                  fontWeight: active ? 600 : 400,
                  transition: 'all 0.15s',
                }}
              >
                <span>{icon}</span>
                {label}
              </Link>
            )
          })}
        </nav>
        <div style={{ padding: '16px 20px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <button
            onClick={logout}
            style={{
              background: 'none', border: 'none', color: '#818cf8', cursor: 'pointer',
              fontSize: 13, padding: 0, display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            ← Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main style={{ flex: 1, overflow: 'auto', background: 'var(--bg)' }}>
        <Outlet />
      </main>
    </div>
  )
}
