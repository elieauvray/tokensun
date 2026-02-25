<template>
  <section class="console-section">
    <article class="console-panel">
      <header class="console-panel-header">
        <h2 class="console-panel-title">Workspace bootstrap</h2>
        <p class="console-panel-subtitle">Upsun scope is auto-detected from plugin context. Enter API token once per session.</p>
      </header>
      <div class="console-panel-body console-grid-3">
        <InputText v-model="bootstrap.upsunApiToken" type="password" placeholder="Upsun API token" />
        <Button label="Bootstrap" @click="doBootstrap" />
        <div class="context">
          <strong>Detected scope:</strong>
          <span>{{ bootstrap.upsunOrgId || 'missing-org' }}</span>
          <span>/</span>
          <span>{{ bootstrap.upsunProjectId || 'missing-project' }}</span>
          <span>/</span>
          <span>{{ detectedEnvironmentId || 'missing-environment' }}</span>
        </div>
      </div>
    </article>

    <article class="console-panel">
      <header class="console-panel-header">
        <h2 class="console-panel-title">Provider connections</h2>
        <p class="console-panel-subtitle">Store provider credentials (encrypted in session cookie) and test reachability.</p>
      </header>
      <div class="console-panel-body console-grid-4">
        <Dropdown v-model="form.provider" :options="providers" placeholder="Provider" />
        <InputText v-model="form.name" placeholder="Connection name" />
        <InputText v-model="form.baseUrl" placeholder="Base URL (optional)" />
        <InputText v-model="form.apiKey" type="password" placeholder="API key" />
        <InputText v-model="form.modelsRaw" class="span-3" placeholder="Models (comma-separated)" />
        <Button label="Create connection" @click="createConnection" />
      </div>
    </article>

    <article class="console-panel">
      <div class="console-panel-body">
        <DataTable :value="connections" size="small" stripedRows>
          <Column field="provider" header="Provider" />
          <Column field="name" header="Name" />
          <Column field="slug" header="Conn" />
          <Column header="Secrets">
            <template #body="slotProps">
              {{ slotProps.data.hasSecrets ? 'Saved' : 'Missing' }}
            </template>
          </Column>
          <Column header="Actions">
            <template #body="slotProps">
              <div class="console-row">
                <Button label="Test" severity="secondary" @click="testConnection(slotProps.data.id)" />
                <Button label="Delete" severity="danger" @click="deleteConnection(slotProps.data.id)" />
              </div>
            </template>
          </Column>
        </DataTable>
      </div>
    </article>

    <p v-if="message" class="console-msg">{{ message }}</p>
  </section>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Dropdown from 'primevue/dropdown';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import { api } from '../components/api';

type Provider = 'openai' | 'anthropic' | 'gemini' | 'mistral';

const providers: Provider[] = ['openai', 'anthropic', 'gemini', 'mistral'];
const route = useRoute();

function detectContextFromPathname(pathname: string): { org?: string; project?: string; environment?: string } {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length >= 3) {
    return {
      org: parts[0],
      project: parts[1],
      environment: parts[2]
    };
  }
  return {};
}

const fallback = detectContextFromPathname(window.location.pathname);

const bootstrap = reactive({
  upsunApiToken: '',
  upsunOrgId: String(route.query.organizationId ?? fallback.org ?? ''),
  upsunProjectId: String(route.query.projectId ?? fallback.project ?? '')
});
const detectedEnvironmentId = ref(String(route.query.environmentId ?? fallback.environment ?? ''));

const form = reactive({
  provider: 'openai' as Provider,
  name: '',
  baseUrl: '',
  apiKey: '',
  modelsRaw: ''
});

const message = ref('');
const connections = ref<any[]>([]);

async function loadConnections() {
  const res = await api<{ connections: any[] }>('/api/connections');
  connections.value = res.connections;
}

async function doBootstrap() {
  if (!bootstrap.upsunOrgId || !bootstrap.upsunProjectId) {
    message.value = 'Could not detect organization/project from plugin route.';
    return;
  }
  await api('/api/auth/bootstrap', {
    method: 'POST',
    body: JSON.stringify(bootstrap)
  });
  message.value = 'Workspace bootstrapped';
  await loadConnections();
}

async function createConnection() {
  await api('/api/connections', {
    method: 'POST',
    body: JSON.stringify({
      provider: form.provider,
      name: form.name,
      config: {
        baseUrl: form.baseUrl || undefined,
        models: form.modelsRaw
          .split(',')
          .map((m) => m.trim())
          .filter(Boolean)
      },
      secrets: {
        apiKey: form.apiKey
      }
    })
  });

  form.name = '';
  form.baseUrl = '';
  form.apiKey = '';
  form.modelsRaw = '';
  message.value = 'Connection created';
  await loadConnections();
}

async function testConnection(id: string) {
  const res = await api<{ ok: boolean; message: string }>(`/api/connections/${id}/test`, {
    method: 'POST'
  });
  message.value = res.message;
}

async function deleteConnection(id: string) {
  await api(`/api/connections/${id}`, { method: 'DELETE' });
  message.value = 'Connection deleted';
  await loadConnections();
}

onMounted(loadConnections);
</script>

<style scoped>
.span-3 {
  grid-column: span 3;
}
.context {
  display: flex;
  gap: 6px;
  align-items: center;
  font-size: 12px;
  color: #475569;
}

@media (max-width: 980px) {
  .span-3 {
    grid-column: span 1;
  }
}
</style>
