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
import { authMiddleware } from './middleware/auth'

const app = express()

app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173', credentials: true }))
app.use(express.json())

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

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }))

// Global error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err)
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message || 'Internal server error' } })
})

export default app
