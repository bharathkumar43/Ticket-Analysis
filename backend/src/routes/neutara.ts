import { Router } from 'express'
import { neutaraService } from '../services/neutaraService'
import { getNeutaraConfig } from '../lib/neutaraConfig'

const router = Router()

router.get('/config', (req, res) => {
  const { baseUrl, email } = getNeutaraConfig()
  res.json({ baseUrl, email, configured: neutaraService.isConfigured() })
})

router.get('/test', async (req, res) => {
  const result = await neutaraService.testConnection()
  res.json(result)
})

router.get('/live-issues', async (req, res) => {
  if (!neutaraService.isConfigured()) {
    res.status(400).json({ error: { code: 'NEUTARA_NOT_CONFIGURED', message: 'Set NEUTARA_BASE_URL and NEUTARA_API_KEY in .env' } })
    return
  }
  const { jql, max } = req.query as { jql?: string; max?: string }
  try {
    const result = await neutaraService.fetchLiveIssues(
      jql?.trim() || 'ORDER BY created DESC',
      max ? parseInt(max, 10) : 500,
    )
    res.json(result)
  } catch (err: any) {
    const msg = err?.message || 'Fetch failed'
    const isAuth = msg.includes('401') || msg.includes('Authentication failed') || msg.includes('auth')
    res.status(isAuth ? 502 : 500).json({ error: { code: isAuth ? 'NEUTARA_AUTH_FAILED' : 'FETCH_ERROR', message: msg } })
  }
})

export default router
