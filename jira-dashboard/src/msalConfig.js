import { PublicClientApplication } from '@azure/msal-browser'

const clientId = import.meta.env.VITE_AZURE_CLIENT_ID || ''
const tenantId = import.meta.env.VITE_AZURE_TENANT_ID || 'common'

const msalConfig = {
  auth: {
    clientId,
    authority: `https://login.microsoftonline.com/${tenantId}`,
    redirectUri: window.location.origin,
  },
  cache: {
    cacheLocation: 'sessionStorage',
    storeAuthStateInCookie: false,
  },
}

export const loginRequest = {
  scopes: ['User.Read'],
}

let _instance = null
let _initPromise = null

export async function getMsalInstance() {
  if (_instance) return _instance
  if (!_initPromise) {
    const inst = new PublicClientApplication(msalConfig)
    _initPromise = inst.initialize().then(() => {
      _instance = inst
      return inst
    })
  }
  return _initPromise
}
