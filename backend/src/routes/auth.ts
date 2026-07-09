import { Router } from 'express'
import jwt from 'jsonwebtoken'
import axios from 'axios'
import { prisma } from '../lib/prisma'

const router = Router()

const BACKEND_URL  = process.env.BACKEND_URL  || 'http://localhost:3600'
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:6100'

// Scopes: openid/profile/email for identity, User.Read for Graph profile,
// Mail.Send to send reminders, offline_access for refresh token
const MS_SCOPES = 'openid profile email User.Read Mail.Send offline_access'

function issueToken(userId: string) {
  const expiresIn = 60 * 60 * 24 * 7
  const token = jwt.sign({ userId }, process.env.JWT_SECRET || 'secret', { expiresIn })
  return { token, expiresIn: '7d' }
}

// Step 1 — Redirect browser to Microsoft login
router.get('/microsoft/login', (req, res) => {
  const clientId = process.env.AZURE_CLIENT_ID || ''
  const tenantId = process.env.AZURE_TENANT_ID || 'common'
  const redirectUri = `${BACKEND_URL}/api/auth/microsoft/callback`

  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  redirectUri,
    response_type: 'code',
    response_mode: 'query',
    scope:         MS_SCOPES,
  })

  res.redirect(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${params}`)
})

// Step 2 — Azure AD redirects here with auth code; exchange server-side
router.get('/microsoft/callback', async (req, res) => {
  const { code, error } = req.query
  const redirectUri = `${BACKEND_URL}/api/auth/microsoft/callback`

  if (error || !code || typeof code !== 'string') {
    const msg = encodeURIComponent(String(error || 'login_cancelled'))
    res.redirect(`${FRONTEND_URL}?ms_error=${msg}`)
    return
  }

  const clientId     = process.env.AZURE_CLIENT_ID     || ''
  const clientSecret = process.env.AZURE_CLIENT_SECRET || ''
  const tenantId     = process.env.AZURE_TENANT_ID     || 'common'

  try {
    // Exchange auth code for tokens (access + refresh)
    const tokenResp = await axios.post<{
      access_token: string
      refresh_token?: string
    }>(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      new URLSearchParams({
        client_id:     clientId,
        client_secret: clientSecret,
        code,
        redirect_uri:  redirectUri,
        grant_type:    'authorization_code',
        scope:         MS_SCOPES,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    )

    const { access_token, refresh_token } = tokenResp.data

    // Get user profile from Microsoft Graph
    const graphResp = await axios.get<{
      mail?: string; userPrincipalName?: string; id?: string; displayName?: string
    }>(
      'https://graph.microsoft.com/v1.0/me',
      { headers: { Authorization: `Bearer ${access_token}` } }
    )

    const graphUser = graphResp.data
    const email     = graphUser.mail || graphUser.userPrincipalName || ''
    const username  = email || graphUser.id || 'ms-user'

    // Upsert user — store refresh token so we can send mail on their behalf
    let user = await prisma.user.findUnique({ where: { username } })
    if (!user && email) user = await prisma.user.findFirst({ where: { email } })

    if (user) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { msRefreshToken: refresh_token ?? user.msRefreshToken },
      })
    } else {
      user = await prisma.user.create({
        data: { username, passwordHash: '', email: email || null, msRefreshToken: refresh_token ?? null },
      })
    }

    const { token } = issueToken(user.username)
    res.redirect(`${FRONTEND_URL}?ms_token=${encodeURIComponent(token)}`)
  } catch (err: unknown) {
    console.error('Microsoft OAuth callback error:', err)
    res.redirect(`${FRONTEND_URL}?ms_error=auth_failed`)
  }
})

export default router
