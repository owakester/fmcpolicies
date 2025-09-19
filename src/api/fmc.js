import axios from 'axios'

const api = axios.create({
  baseURL: '/fmc',
  validateStatus: s => s >= 200 && s < 500
})

/**
 * Auth: genera tokens (en headers)
 */
export async function loginFMC({ username, password }) {
  const res = await api.post('/api/fmc_platform/v1/auth/generatetoken', null, {
    auth: { username, password }
  })
  if (res.status !== 204 && res.status !== 200) {
    throw new Error(`Auth failed: ${res.status} ${res.statusText}`)
  }
  const accessToken = res.headers['x-auth-access-token']
  const refreshToken = res.headers['x-auth-refresh-token']
  if (!accessToken) throw new Error('Missing X-auth-access-token header')
  return { accessToken, refreshToken }
}

/**
 * Refresh tokens
 */
export async function refreshTokens({ accessToken, refreshToken }) {
  const res = await api.post('/api/fmc_platform/v1/auth/refreshtoken', null, {
    headers: {
      'X-auth-access-token': accessToken,
      'X-auth-refresh-token': refreshToken
    }
  })
  if (res.status !== 204 && res.status !== 200) {
    throw new Error(`Refresh failed: ${res.status} ${res.statusText}`)
  }
  return {
    accessToken: res.headers['x-auth-access-token'] || accessToken,
    refreshToken: res.headers['x-auth-refresh-token'] || refreshToken
  }
}

/**
 * Domains
 */
export async function getDomains(accessToken) {
  const res = await api.get('/api/fmc_platform/v1/info/domain', {
    headers: { 'X-auth-access-token': accessToken }
  })
  if (res.status !== 200) {
    throw new Error(`Domains failed: ${res.status} ${res.statusText}`)
  }
  return res.data?.items || []
}

/**
 * Access Policies (list)
 */
export async function getAccessPolicies({ accessToken, domainUUID, limit = 50, offset = 0 }) {
  const res = await api.get(`/api/fmc_config/v1/domain/${domainUUID}/policy/accesspolicies`, {
    headers: { 'X-auth-access-token': accessToken },
    params: { expanded: true, limit, offset }
  })
  if (res.status === 401) throw new Error('Unauthorized')
  if (res.status !== 200) {
    throw new Error(`Policies failed: ${res.status} ${res.statusText}`)
  }
  return res.data
}

/**
 * Access Policy detail
 */
export async function getPolicyDetail({ accessToken, domainUUID, policyId }) {
  const res = await api.get(`/api/fmc_config/v1/domain/${domainUUID}/policy/accesspolicies/${policyId}`, {
    headers: { 'X-auth-access-token': accessToken }
  })
  if (res.status === 401) throw new Error('Unauthorized')
  if (res.status !== 200) {
    throw new Error(`Policy detail failed: ${res.status} ${res.statusText}`)
  }
  return res.data
}

/**
 * Access Rules count using limit=1 and reading paging.count
 */
export async function getAccessRulesCount({ accessToken, domainUUID, policyId }) {
  const res = await api.get(`/api/fmc_config/v1/domain/${domainUUID}/policy/accesspolicies/${policyId}/accessrules`, {
    headers: { 'X-auth-access-token': accessToken },
    params: { expanded: true, limit: 1, offset: 0 }
  })
  if (res.status === 401) throw new Error('Unauthorized')
  if (res.status === 404) return 0
  if (res.status !== 200) {
    throw new Error(`Rules count failed: ${res.status} ${res.statusText}`)
  }
  const paging = res.data?.paging
  const count = (paging && (paging.count ?? paging?.['count'])) ?? res.data?.count ?? 0
  return count
}

/**
 * Access Rules list (paged)
 */
export async function getAccessRules({ accessToken, domainUUID, policyId, limit = 25, offset = 0 }) {
  const res = await api.get(`/api/fmc_config/v1/domain/${domainUUID}/policy/accesspolicies/${policyId}/accessrules`, {
    headers: { 'X-auth-access-token': accessToken },
    params: { expanded: true, limit, offset }
  })
  if (res.status === 401) throw new Error('Unauthorized')
  if (res.status !== 200) {
    throw new Error(`Rules failed: ${res.status} ${res.statusText}`)
  }
  return res.data
}
