import axios from 'axios'

const api = axios.create({
  baseURL: '/fmc',
  validateStatus: s => s >= 200 && s < 500
})

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

export async function getDomains(accessToken) {
  const res = await api.get('/api/fmc_platform/v1/info/domain', {
    headers: { 'X-auth-access-token': accessToken }
  })
  if (res.status !== 200) {
    throw new Error(`Domains failed: ${res.status} ${res.statusText}`)
  }
  return res.data?.items || []
}

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

export async function getAccessRules({ accessToken, domainUUID, policyId }) {
  const res = await api.get(`/api/fmc_config/v1/domain/${domainUUID}/policy/accesspolicies/${policyId}/accessrules`, {
    headers: { 'X-auth-access-token': accessToken },
    params: { expanded: true, limit: 1000 } // O ajusta el límite según sea necesario
  });
  if (res.status === 401) throw new Error('Unauthorized');
  if (res.status !== 200) {
    throw new Error(`Access rules failed: ${res.status} ${res.statusText}`);
  }
  return res.data;
}