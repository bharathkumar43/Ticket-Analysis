import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { prisma } from '../lib/prisma'

const router = Router()

function issueToken(userId: string) {
  const expiresIn = 60 * 60 * 24 * 7 // 7 days in seconds
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

  // 1. Check signed-up users in the database
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

  // 2. Fall back to the legacy single shared admin login (APP_USERNAME/APP_PASSWORD)
  const expectedUser = process.env.APP_USERNAME || 'admin'
  const expectedPass = process.env.APP_PASSWORD || 'changeme'
  if (username === expectedUser && password === expectedPass) {
    res.json(issueToken(username))
    return
  }

  res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid username or password' } })
})

export default router
