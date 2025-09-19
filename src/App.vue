<script setup>
import { ref, computed } from 'vue'
import {
  loginFMC, refreshTokens, getDomains, getAccessPolicies,
  getPolicyDetail, getAccessRulesCount, getAccessRules, getRuleDetail
} from './api/fmc.js'

// --- Auth / base state ---
const username = ref('')
const password = ref('')
const isLoading = ref(false)
const tokens = ref({ accessToken: null, refreshToken: null })
const domains = ref([])
const selectedDomain = ref('')
const policies = ref([])
const paging = ref({ limit: 50, offset: 0, count: 0 })
const errorMsg = ref('')
const openDetails = ref({}) // { [policyId]: boolean }

// --- Rules drawer state ---
const rulesOpen = ref(false)
const rulesPaging = ref({ limit: 25, offset: 0, count: 0 })
const rulesItems = ref([])
const rulesPolicy = ref({ id: null, name: '' })
const rulesLoading = ref(false)
const rulesError = ref('')
const rulesFilter = ref('')

// --- Rule detail cache/state ---
const ruleDetails = ref({})       // { [ruleId]: object }
const ruleDetailError = ref({})   // { [ruleId]: string }
const ruleDetailLoading = ref({}) // { [ruleId]: boolean }

const isAuthed = computed(() => !!tokens.value.accessToken)
const hasPolicies = computed(() => (policies.value?.length ?? 0) > 0)
const filteredRules = computed(() => {
  const f = rulesFilter.value?.toLowerCase() || ''
  return f ? rulesItems.value.filter(r => (r.name || '').toLowerCase().includes(f)) : rulesItems.value
})

async function doLogin() {
  errorMsg.value = ''
  isLoading.value = true
  try {
    const t = await loginFMC({ username: username.value, password: password.value })
    tokens.value = t
    domains.value = await getDomains(tokens.value.accessToken)
    if (domains.value.length) selectedDomain.value = domains.value[0].uuid
    await loadPolicies()
  } catch (e) {
    errorMsg.value = e.message || String(e)
  } finally {
    isLoading.value = false
  }
}

async function loadPolicies() {
  if (!selectedDomain.value) return
  isLoading.value = true
  errorMsg.value = ''
  try {
    const data = await getAccessPolicies({
      accessToken: tokens.value.accessToken,
      domainUUID: selectedDomain.value,
      limit: paging.value.limit,
      offset: paging.value.offset
    })
    policies.value = data.items || []
    paging.value.count = (data.paging && (data.paging.count ?? data.count)) ?? policies.value.length
  } catch (e) {
    if (String(e).includes('Unauthorized') && tokens.value.refreshToken) {
      try {
        tokens.value = await refreshTokens(tokens.value)
        const data = await getAccessPolicies({
          accessToken: tokens.value.accessToken,
          domainUUID: selectedDomain.value,
          limit: paging.value.limit,
          offset: paging.value.offset
        })
        policies.value = data.items || []
        paging.value.count = (data.paging && (data.paging.count ?? data.count)) ?? policies.value.length
      } catch (e2) {
        errorMsg.value = e2.message || String(e2)
      }
    } else {
      errorMsg.value = e.message || String(e)
    }
  } finally {
    isLoading.value = false
  }
}

async function toggleDetails(policy) {
  const id = policy.id
  openDetails.value[id] = !openDetails.value[id]
  if (openDetails.value[id]) {
    try {
      policy.__loading = true
      const [detail, rulesCount] = await Promise.all([
        getPolicyDetail({
          accessToken: tokens.value.accessToken,
          domainUUID: selectedDomain.value,
          policyId: id
        }),
        getAccessRulesCount({
          accessToken: tokens.value.accessToken,
          domainUUID: selectedDomain.value,
          policyId: id
        })
      ])
      policy.__detail = detail
      policy.__rulesCount = rulesCount
    } catch (e) {
      policy.__detailError = e.message || String(e)
    } finally {
      policy.__loading = false
    }
  }
}

function fmt(obj, path, fallback = '—') {
  try {
    return path.split('.').reduce((o, k) => o?.[k], obj) ?? fallback
  } catch { return fallback }
}

async function openRules(policy) {
  rulesOpen.value = true
  rulesPolicy.value = { id: policy.id, name: policy.name }
  rulesPaging.value.offset = 0
  ruleDetails.value = {}
  ruleDetailError.value = {}
  ruleDetailLoading.value = {}
  await loadRules()
}

async function loadRules() {
  if (!rulesPolicy.value.id) return
  rulesLoading.value = true
  rulesError.value = ''
  try {
    const data = await getAccessRules({
      accessToken: tokens.value.accessToken,
      domainUUID: selectedDomain.value,
      policyId: rulesPolicy.value.id,
      limit: rulesPaging.value.limit,
      offset: rulesPaging.value.offset
    })
    rulesItems.value = data.items || []
    rulesPaging.value.count = (data.paging && (data.paging.count ?? data.count)) ?? rulesItems.value.length
  } catch (e) {
    rulesError.value = e.message || String(e)
  } finally {
    rulesLoading.value = false
  }
}

function rulesNext() {
  rulesPaging.value.offset += rulesPaging.value.limit
  loadRules()
}
function rulesPrev() {
  rulesPaging.value.offset = Math.max(0, rulesPaging.value.offset - rulesPaging.value.limit)
  loadRules()
}

function asList(arr, key = 'name') {
  if (!Array.isArray(arr) || !arr.length) return '—'
  return arr.map(x => x?.[key] || x?.value || x?.id || '').filter(Boolean).join(', ')
}

function exportRulesCsv() {
  const rows = [['Name','Action','Enabled','Source','Destination','Service']]
  for (const r of filteredRules.value) {
    rows.push([
      r.name || '',
      r.action || '',
      String(r.enabled ?? ''),
      asList(r.sourceNetworks?.objects),
      asList(r.destinationNetworks?.objects),
      asList(r.destinationPorts?.objects)
    ])
  }
  const csv = rows.map(cols => cols.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `rules_${rulesPolicy.value.name || rulesPolicy.value.id}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// --- Rule detail on-demand (evita 400 usando links.self) ---
async function loadRuleDetail(r) {
  if (!r?.id) return
  ruleDetailError.value[r.id] = ''
  ruleDetailLoading.value[r.id] = true
  try {
    const data = await getRuleDetail({
      accessToken: tokens.value.accessToken,
      domainUUID: selectedDomain.value,
      policyId: rulesPolicy.value.id,
      rule: r
    })
    ruleDetails.value[r.id] = data
  } catch (e) {
    ruleDetailError.value[r.id] = e.message || String(e)
  } finally {
    ruleDetailLoading.value[r.id] = false
  }
}

function nextPage() {
  paging.value.offset += paging.value.limit
  loadPolicies()
}
function prevPage() {
  paging.value.offset = Math.max(0, paging.value.offset - paging.value.limit)
  loadPolicies()
}
</script>

<template>
  <div class="min-h-screen p-6">
    <div class="max-w-5xl mx-auto space-y-6">
      <header class="flex items-center justify-between">
        <h1 class="text-2xl font-bold">FMC — Access Policies</h1>
        <span v-if="isAuthed" class="text-sm text-emerald-400">Authenticated</span>
      </header>

      <section v-if="!isAuthed" class="bg-slate-900/50 border border-slate-800 rounded-2xl p-5">
        <h2 class="text-lg font-semibold mb-4">Login</h2>
        <form @submit.prevent="doLogin" class="grid gap-4 sm:grid-cols-2">
          <div class="sm:col-span-1">
            <label class="block mb-1 text-sm text-slate-300">Username</label>
            <input v-model="username" type="text" required autocomplete="username"
              class="w-full rounded-xl bg-slate-800 border border-slate-700 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div class="sm:col-span-1">
            <label class="block mb-1 text-sm text-slate-300">Password</label>
            <input v-model="password" type="password" required autocomplete="current-password"
              class="w-full rounded-xl bg-slate-800 border border-slate-700 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div class="sm:col-span-2">
            <button :disabled="isLoading" class="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50">
              {{ isLoading ? 'Ingresando...' : 'Ingresar' }}
            </button>
          </div>
        </form>
        <p v-if="errorMsg" class="mt-3 text-sm text-rose-400">{{ errorMsg }}</p>
      </section>

      <section v-else class="space-y-4">
        <div class="bg-slate-900/50 border border-slate-800 rounded-2xl p-4">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <label class="block mb-1 text-sm text-slate-300">Domain</label>
              <select v-model="selectedDomain" @change="() => { paging.offset = 0; loadPolicies(); }"
                class="rounded-xl bg-slate-800 border border-slate-700 px-3 py-2">
                <option v-for="d in domains" :key="d.uuid" :value="d.uuid">{{ d.name }} — {{ d.uuid }}</option>
              </select>
            </div>
            <div class="flex items-center gap-2">
              <button @click="prevPage" class="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700">&larr;</button>
              <button @click="loadPolicies" class="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700">Reload</button>
              <button @click="nextPage" class="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700">&rarr;</button>
            </div>
          </div>
        </div>

        <div class="bg-slate-900/50 border border-slate-800 rounded-2xl">
          <div class="p-4 border-b border-slate-800 flex items-center justify-between">
            <h3 class="font-semibold">Policies ({{ policies.length }})</h3>
            <span class="text-xs text-slate-400">offset {{ paging.offset }} · limit {{ paging.limit }} · total {{ paging.count }}</span>
          </div>

          <ul class="divide-y divide-slate-800">
            <li v-for="p in policies" :key="p.id" class="p-4 hover:bg-slate-900">
              <div class="flex items-center justify-between">
                <div>
                  <div class="font-medium">{{ p.name }}</div>
                  <div class="text-xs text-slate-400">ID: {{ p.id }} · Type: {{ p.type }} · {{ p.metadata?.comments || 'No comments' }}</div>
                </div>
                <div class="flex items-center gap-2">
                  <button @click="toggleDetails(p)" class="px-2 py-1 rounded-lg bg-slate-800 border border-slate-700 text-xs">
                    {{ openDetails[p.id] ? 'Hide' : 'Details' }}
                  </button>
                  <span class="text-xs px-2 py-1 rounded bg-slate-800 border border-slate-700">
                    {{ p.state || '—' }}
                  </span>
                </div>
              </div>

              <!-- details -->
              <div v-if="openDetails[p.id]" class="mt-3 rounded-xl border border-slate-800 bg-slate-900/70">
                <div v-if="p.__loading" class="p-4 text-sm text-slate-400">Loading details…</div>
                <div v-else-if="p.__detailError" class="p-4 text-sm text-rose-400">{{ p.__detailError }}</div>
                <div v-else class="p-4 grid sm:grid-cols-2 gap-4 text-sm">
                  <div>
                    <div class="text-slate-300 mb-1">Default Action</div>
                    <div class="text-slate-400">{{ fmt(p.__detail, 'defaultAction.action', '—') }}</div>
                  </div>
                  <div>
                    <div class="text-slate-300 mb-1">Inspection Mode</div>
                    <div class="text-slate-400">{{ fmt(p.__detail, 'inspectionMode', '—') }}</div>
                  </div>
                  <div>
                    <div class="text-slate-300 mb-1">Intrusion Policy</div>
                    <div class="text-slate-400">{{ fmt(p.__detail, 'intrusionPolicy.name', '—') }}</div>
                  </div>
                  <div>
                    <div class="text-slate-300 mb-1">Rules in Policy</div>
                    <div class="text-slate-400">{{ p.__rulesCount ?? '—' }}</div>
                  </div>
                  <div class="sm:col-span-2">
                    <div class="text-slate-300 mb-1">Variable Sets</div>
                    <div class="flex flex-wrap gap-2">
                      <span v-for="vs in (p.__detail?.variableSets ?? [])" :key="vs.id"
                            class="inline-flex items-center px-2 py-0.5 rounded bg-slate-800 border border-slate-700">
                        {{ vs.name || vs.id }}
                      </span>
                      <span v-if="!(p.__detail?.variableSets?.length)" class="text-slate-500">—</span>
                    </div>
                  </div>
                  <button @click="openRules(p)" class="mt-2 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs w-fit">View Rules</button>
                </div>
              </div>
            </li>
          </ul>

          <div v-if="!hasPolicies && !isLoading" class="p-6 text-center text-slate-400">
            No policies found.
          </div>
          <div v-if="isLoading" class="p-6 text-center text-slate-400">
            Cargando...
          </div>
          <p v-if="errorMsg" class="p-4 text-sm text-rose-400">{{ errorMsg }}</p>
        </div>
      </section>

      <!-- Rules Drawer -->
      <div v-if="rulesOpen" class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50">
        <div class="absolute right-0 top-0 h-full w-full sm:w-[720px] bg-slate-950 border-l border-slate-800 flex flex-col">
          <div class="p-4 border-b border-slate-800 flex items-center justify-between">
            <div>
              <div class="font-semibold">Access Rules — {{ rulesPolicy.name || rulesPolicy.id }}</div>
              <div class="text-xs text-slate-400">offset {{ rulesPaging.offset }} · limit {{ rulesPaging.limit }} · total {{ rulesPaging.count }}</div>
            </div>
            <div class="flex items-center gap-2">
              <input v-model="rulesFilter" placeholder="Filter by name..." class="px-2 py-1 rounded bg-slate-900 border border-slate-700 text-sm"/>
              <button @click="exportRulesCsv" class="px-3 py-1 rounded bg-slate-800 border border-slate-700 text-xs">Export CSV</button>
              <button @click="rulesOpen = false" class="px-3 py-1 rounded bg-slate-800 border border-slate-700 text-xs">Close</button>
            </div>
          </div>

          <div class="flex-1 overflow-auto">
            <div v-if="rulesLoading" class="p-6 text-center text-slate-400">Loading rules…</div>
            <div v-else-if="rulesError" class="p-6 text-rose-400 text-sm">{{ rulesError }}</div>
            <ul v-else class="divide-y divide-slate-800">
              <li v-for="r in filteredRules" :key="r.id" class="p-4">
                <div class="flex items-center justify-between">
                  <div class="font-medium">{{ r.name || '—' }}</div>
                  <div class="flex items-center gap-2">
                    <span class="text-xs px-2 py-0.5 rounded bg-slate-800 border border-slate-700">{{ r.action || '—' }}</span>
                    <span class="text-xs px-2 py-0.5 rounded bg-slate-800 border border-slate-700">{{ r.enabled ? 'Enabled' : 'Disabled' }}</span>
                  </div>
                </div>

                <!-- Source / Destination / Service -->
                <div class="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-slate-400">
                  <div>
                    <div class="text-slate-300">Source</div>
                    <div>{{ asList(r.sourceNetworks?.objects) }}</div>
                  </div>
                  <div>
                    <div class="text-slate-300">Destination</div>
                    <div>{{ asList(r.destinationNetworks?.objects) }}</div>
                  </div>
                  <div>
                    <div class="text-slate-300">Service</div>
                    <div>{{ asList(r.destinationPorts?.objects) }}</div>
                  </div>
                </div>

                <!-- Metadatos y comentarios (si la API los trae) -->
                <div class="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-slate-400">
                  <div>
                    <div class="text-slate-300">Last Modified</div>
                    <div>{{ r.metadata?.lastModifiedTime || '—' }}</div>
                  </div>
                  <div>
                    <div class="text-slate-300">Last User</div>
                    <div>{{ r.metadata?.lastUser || '—' }}</div>
                  </div>
                  <div>
                    <div class="text-slate-300">Comments</div>
                    <div>
                      <template v-if="Array.isArray(r.commentHistory) && r.commentHistory.length">
                        <ul class="list-disc ml-4">
                          <li v-for="(c, idx) in r.commentHistory" :key="idx">
                            {{ c.comment || c.text }} — {{ c.user || c.username || '' }} {{ c.date || c.time || '' }}
                          </li>
                        </ul>
                      </template>
                      <template v-else-if="Array.isArray(r.comments) && r.comments.length">
                        <ul class="list-disc ml-4">
                          <li v-for="(c, idx) in r.comments" :key="idx">
                            {{ c.comment || c.text || c }}
                          </li>
                        </ul>
                      </template>
                      <template v-else-if="r.metadata?.comments">
                        {{ r.metadata.comments }}
                      </template>
                      <span v-else>—</span>
                    </div>
                  </div>
                </div>

                <!-- acciones / detalle -->
                <div class="mt-3 flex items-center gap-2">
                  <button @click="loadRuleDetail(r)" class="px-2 py-1 text-xs rounded bg-slate-800 border border-slate-700">
                    View detail
                  </button>
                  <span v-if="ruleDetailLoading[r.id]" class="text-xs text-slate-400">Loading…</span>
                  <span v-else-if="ruleDetailError[r.id]" class="text-xs text-rose-400">{{ ruleDetailError[r.id] }}</span>
                </div>

                <!-- detalle de la regla -->
                <div v-if="ruleDetails[r.id]" class="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-slate-400 p-3 rounded border border-slate-800 bg-slate-900/60">
                  <div>
                    <div class="text-slate-300">Log Setting</div>
                    <div>{{ (ruleDetails[r.id].logFiles || ruleDetails[r.id].logBegin || ruleDetails[r.id].logEnd) ? 'Enabled' : '—' }}</div>
                  </div>
                  <div>
                    <div class="text-slate-300">IPS Policy</div>
                    <div>{{ ruleDetails[r.id]?.ipsPolicy?.name || '—' }}</div>
                  </div>
                  <div>
                    <div class="text-slate-300">Time Range</div>
                    <div>{{ ruleDetails[r.id]?.timeRange?.name || '—' }}</div>
                  </div>
                </div>
              </li>
            </ul>
            <div v-if="!filteredRules.length && !rulesLoading" class="p-6 text-center text-slate-500">No rules</div>
          </div>

          <div class="p-3 border-t border-slate-800 flex items-center justify-between">
            <div class="text-xs text-slate-400">offset {{ rulesPaging.offset }} · limit {{ rulesPaging.limit }} · total {{ rulesPaging.count }}</div>
            <div class="flex items-center gap-2">
              <button @click="rulesPrev" class="px-3 py-1 rounded bg-slate-800 border border-slate-700 text-xs">&larr;</button>
              <button @click="loadRules" class="px-3 py-1 rounded bg-slate-800 border border-slate-700 text-xs">Reload</button>
              <button @click="rulesNext" class="px-3 py-1 rounded bg-slate-800 border border-slate-700 text-xs">&rarr;</button>
            </div>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>
