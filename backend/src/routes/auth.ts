import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import axios from 'axios'
import { prisma } from '../lib/prisma'

const router = Router()

const BACKEND_URL  = process.env.BACKEND_URL  || 'http://localhost:3600'
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:6100'

function issueToken(userId: string) {
  const expiresIn = 60 * 60 * 24 * 7
  const token = jwt.sign({ userId }, process.env.JWT_SECRET || 'secret', { expiresIn })
  return { token, expiresIn: '7d' }
}

router.post('/signup', async (req, res) => {
  const { username, password, email } = req.body
  if (!username || !String(username).trim() || !password || String(password).length < 6) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Username is required and password must be at least 6 characters' } })
    return
  }

  const uname = String(username).trim()
  const existing = await prisma.user.findUnique({ where: { username: uname } })
  if (existing) {
    res.status(409).json({ error: { code: 'USERNAME_TAKEN', message: 'That username is already taken' } })
    return
  }

  const passwordHash = await bcrypt.hash(password, 10)
  const user = await prisma.user.create({ data: { username: uname, passwordHash, email: email || null } })

  res.status(201).json(issueToken(user.username))
})

router.post('/login', async (req, res) => {
  const { username, password } = req.body
  if (!username || !password) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Username and password are required' } })
    return
  }

  const user = await prisma.user.findUnique({ where: { username: String(username).trim() } })
  if (user) {
    const ok = await bcrypt.compare(password, user.passwordHash)
    if (!ok) {
      res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid username or password' } })
      return
    }
    res.json(issueToken(user.username))
    return
  }

  const expectedUser = process.env.APP_USERNAME || 'admin'
  const expectedPass = process.env.APP_PASSWORD || 'changeme'
  if (username === expectedUser && password === expectedPass) {
    res.json(issueToken(username))
    return
  }

  res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid username or password' } })
})

// Step 1 — Redirect browser to Microsoft login page
router.get('/microsoft/login', (req, res) => {
  const clientId = process.env.AZURE_CLIENT_ID || ''
  const tenantId = process.env.AZURE_TENANT_ID || 'common'
  const redirectUri = `${BACKEND_URL}/api/auth/microsoft/callback`

  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  redirectUri,
    response_type: 'code',
    response_mode: 'query',
    scope:         'openid profile email User.Read',
  })

  res.redirect(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${params}`)
})

// Step 2 — Azure AD redirects here with auth code; exchange it server-side
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
    // Exchange authorization code for access token
    const tokenResp = await axios.post<{ access_token: string }>(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      new URLSearchParams({
        client_id:     clientId,
        client_secret: clientSecret,
        code,
        redirect_uri:  redirectUri,
        grant_type:    'authorization_code',
        scope:         'User.Read',
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    )

    const { access_token } = tokenResp.data

    // Get user profile from Microsoft Graph
    const graphResp = await axios.get<{ mail?: string; userPrincipalName?: string; id?: string }>(
      'https://graph.microsoft.com/v1.0/me',
      { headers: { Authorization: `Bearer ${access_token}` } }
    )

    const graphUser = graphResp.data
    const email    = graphUser.mail || graphUser.userPrincipalName || ''
    const username = email || graphUser.id || 'ms-user'

    let user = await prisma.user.findUnique({ where: { username } })
    if (!user && email) user = await prisma.user.findFirst({ where: { email } })
    if (!user) {
      user = await prisma.user.create({
        data: { username, passwordHash: '', email: email || null },
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
