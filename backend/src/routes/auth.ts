import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

const router = Router()

router.post('/login', async (req, res) => {
  const { username, password } = req.body
  const expectedUser = process.env.APP_USERNAME || 'admin'
  const expectedPass = process.env.APP_PASSWORD || 'changeme'

  if (username !== expectedUser || password !== expectedPass) {
    res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid username or password' } })
    return
  }

  const expiresIn = 60 * 60 * 24 * 7 // 7 days in seconds
  const token = jwt.sign(
    { userId: username },
    process.env.JWT_SECRET || 'secret',
    { expiresIn }
  )

  res.json({ token, expiresIn: '7d' })
})

export default router
