<script setup>
import { ref, computed } from 'vue'
import { loginFMC, refreshTokens, getDomains, getAccessPolicies } from './api/fmc.js'

const username = ref('')
const password = ref('')
const isLoading = ref(false)
const tokens = ref({ accessToken: null, refreshToken: null })
const domains = ref([])
const selectedDomain = ref('')
const policies = ref([])
const paging = ref({ limit: 50, offset: 0, count: 0 })
const errorMsg = ref('')

const isAuthed = computed(() => !!tokens.value.accessToken)

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
                <span class="text-xs px-2 py-1 rounded bg-slate-800 border border-slate-700"
                  >{{ p.state || '—' }}</span>
              </div>
            </li>
          </ul>

          <div v-if="!policies.length && !isLoading" class="p-6 text-center text-slate-400">
            No policies found.
          </div>
          <div v-if="isLoading" class="p-6 text-center text-slate-400">
            Cargando...
          </div>
          <p v-if="errorMsg" class="p-4 text-sm text-rose-400">{{ errorMsg }}</p>
        </div>
      </section>
    </div>
  </div>
</template>
