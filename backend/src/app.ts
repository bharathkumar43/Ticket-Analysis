import 'express-async-errors'
import express from 'express'
import cors from 'cors'
import 'dotenv/config'

import authRoutes from './routes/auth'
import projectRoutes from './routes/projects'
import ticketRoutes from './routes/tickets'
import peopleRoutes from './routes/people'
import customerRoutes from './routes/customers'
import analyticsRoutes from './routes/analytics'
import jiraRoutes from './routes/jira'
import aliasRoutes from './routes/aliases'
import exportRoutes from './routes/export'
import actionItemRoutes from './routes/actionItems'
import emailSettingsRoutes from './routes/emailSettings'
import monthlyUploadRoutes from './routes/monthlyUploads'
import { authMiddleware } from './middleware/auth'

const app = express()

const _allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173,http://localhost:5174,http://localhost:6100,http://localhost:3600')
  .split(',').map(s => s.trim()).filter(Boolean)
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || _allowedOrigins.includes(origin)) cb(null, true)
    else cb(new Error(`CORS: ${origin} not allowed`))
  },
  credentials: true,
}))
app.use(express.json({ limit: '20mb' }))

// Public routes
app.use('/api/auth', authRoutes)

// Protected routes
app.use('/api/projects', authMiddleware, projectRoutes)
app.use('/api/tickets', authMiddleware, ticketRoutes)
app.use('/api/people', authMiddleware, peopleRoutes)
app.use('/api/customers', authMiddleware, customerRoutes)
app.use('/api/analytics', authMiddleware, analyticsRoutes)
app.use('/api/jira', authMiddleware, jiraRoutes)
app.use('/api/aliases', authMiddleware, aliasRoutes)
app.use('/api/export', authMiddleware, exportRoutes)
app.use('/api/action-items', authMiddleware, actionItemRoutes)
app.use('/api/email-settings', authMiddleware, emailSettingsRoutes)
app.use('/api/monthly-uploads', authMiddleware, monthlyUploadRoutes)

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }))

// Global error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err)
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message || 'Internal server error' } })
})

export default app
