export function getNeutaraConfig() {
  return {
    baseUrl: (process.env.NEUTARA_BASE_URL || '').replace(/\/$/, ''),
    apiKey:  process.env.NEUTARA_API_KEY  || '',
    email:   process.env.NEUTARA_EMAIL    || process.env.JIRA_EMAIL || '',
  }
}
