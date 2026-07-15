import { Router } from 'express'
import { neutaraService } from '../services/neutaraService'
import { getNeutaraConfig } from '../lib/neutaraConfig'

const router = Router()

router.get('/config', (req, res) => {
  const { baseUrl } = getNeutaraConfig()
  res.json({ baseUrl, configured: neutaraService.isConfigured() })
})

router.get('/test', async (req, res) => {
  const result = await neutaraService.testConnection()
  res.json(result)
})

router.get('/live-issues', async (req, res) => {
  if (!neutaraService.isConfigured()) {
    res.status(400).json({ error: { code: 'NEUTARA_NOT_CONFIGURED', message: 'Set NEUTARA_BASE_URL and NEUTARA_API_KEY in .env and restart.' } })
    return
  }
  // Give this route 5 minutes — Neutara API can be slow for large fetches
  req.socket.setTimeout(300000)
  res.setTimeout(300000)

  const max = req.query.max ? parseInt(req.query.max as string, 10) : 200
  try {
    const result = await neutaraService.fetchLiveIssues(max)
    res.json(result)
  } catch (err: any) {
    const msg = err?.message || 'Fetch failed'
    res.status(500).json({ error: { code: 'FETCH_ERROR', message: msg } })
  }
})

export default router
