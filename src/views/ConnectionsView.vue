<template>
  <section class="console-section">
    <article class="console-panel">
      <header class="console-panel-header">
        <h2 class="console-panel-title">Provider connections</h2>
        <p class="console-panel-subtitle">Create and manage LLM provider connections.</p>
      </header>
      <div class="console-panel-body console-grid-4">
        <Dropdown v-model="form.provider" :options="providerOptions" optionLabel="label" optionValue="value" placeholder="Provider" />
        <InputText v-model="form.openaiProject" placeholder="OpenAI Project ID (optional, project_...)" />
        <InputText v-model="form.apiKey" type="password" placeholder="API key" />
        <div class="field-with-help">
          <InputText v-model="form.baseUrl" placeholder="Base URL (optional)" />
          <span class="help-icon">i
            <span class="help-bubble">
              Optional override for OpenAI API endpoint. Leave empty for default `https://api.openai.com`.
              Use it for a proxy/gateway or OpenAI-compatible endpoint.
            </span>
          </span>
        </div>
        <Button
          label="Create connection"
          :loading="creating"
          :disabled="creating || (form.provider !== 'openai' && form.provider !== 'fake')"
          @click="createConnection"
        />
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
                <Button
                  label="Test"
                  severity="secondary"
                  :loading="testingId === slotProps.data.id"
                  :disabled="Boolean(testingId || deletingId)"
                  @click="testConnection(slotProps.data.id)"
                />
                <Button
                  label="Delete"
                  severity="danger"
                  :loading="deletingId === slotProps.data.id"
                  :disabled="Boolean(testingId || deletingId)"
                  @click="deleteConnection(slotProps.data.id)"
                />
              </div>
            </template>
          </Column>
        </DataTable>
      </div>
    </article>

    <article class="console-panel">
      <header class="console-panel-header">
        <h2 class="console-panel-title">Test output</h2>
        <p class="console-panel-subtitle">Live progress and latest result for OpenAI connection checks.</p>
      </header>
      <div class="console-panel-body">
        <p v-if="!latestTestResult" class="console-hint">No test executed yet.</p>
        <pre v-else class="console-pre">{{ JSON.stringify(latestTestResult, null, 2) }}</pre>
      </div>
    </article>

    <article class="console-panel">
      <header class="console-panel-header">
        <h2 class="console-panel-title">Action log</h2>
      </header>
      <div class="console-panel-body">
        <p v-if="activity.length === 0" class="console-hint">No actions yet.</p>
        <ul v-else class="console-log">
          <li v-for="entry in activity" :key="entry.id">{{ entry.text }}</li>
        </ul>
      </div>
    </article>

    <p v-if="message" class="console-msg">{{ message }}</p>
  </section>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Dropdown from 'primevue/dropdown';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import { api } from '../components/api';

const DASHBOARD_CACHE_KEY = 'tokensun.dashboard.cache.v1';
const providerOptions = [
  { label: 'OpenAI', value: 'openai' },
  { label: 'Fake (demo)', value: 'fake' },
  { label: 'Anthropic', value: 'anthropic' },
  { label: 'Gemini', value: 'gemini' },
  { label: 'Mistral', value: 'mistral' }
] as const;

type ConnectionsChangedDetail = {
  action: 'loaded' | 'created' | 'deleted';
  connectionId?: string;
};

const form = reactive({
  provider: 'openai' as (typeof providerOptions)[number]['value'],
  baseUrl: '',
  openaiProject: '',
  apiKey: ''
});

const message = ref('');
const connections = ref<any[]>([]);
const creating = ref(false);
const testingId = ref<string | null>(null);
const deletingId = ref<string | null>(null);
const latestTestResult = ref<any | null>(null);
const activity = ref<Array<{ id: string; text: string }>>([]);

function emitConnectionsChanged(detail: ConnectionsChangedDetail) {
  window.dispatchEvent(new CustomEvent<ConnectionsChangedDetail>('tokensun:connections-changed', { detail }));
}

function pushActivity(text: string) {
  activity.value.unshift({
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    text: `[${new Date().toLocaleTimeString()}] ${text}`
  });
  activity.value = activity.value.slice(0, 40);
}

function formatApiError(err: unknown): string {
  if (!(err instanceof Error)) return 'Request failed';
  try {
    const parsed = JSON.parse(err.message) as { error?: string };
    if (parsed.error === 'validation_error') {
      return 'Invalid connection settings. Check required fields and try again.';
    }
    return parsed.error ?? 'Request failed';
  } catch {
    return err.message || 'Request failed';
  }
}

async function loadConnections() {
  try {
    const res = await api<{ connections: any[] }>('/api/connections');
    connections.value = res.connections
      .filter((c) => c.provider === 'openai' || c.provider === 'fake')
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    emitConnectionsChanged({ action: 'loaded' });
    pushActivity(`Loaded ${connections.value.length} supported connection(s).`);
  } catch (err) {
    message.value = `Failed to load connections: ${formatApiError(err)}`;
    pushActivity(message.value);
  }
}

async function createConnection() {
  if (form.provider !== 'openai' && form.provider !== 'fake') {
    message.value = 'Provider not supported yet in this app.';
    return;
  }
  if (creating.value) return;
  creating.value = true;
  pushActivity(`Creating ${form.provider.toUpperCase()} connection...`);
  try {
    const isFake = form.provider === 'fake';
    const created = await api<{ connection: any }>('/api/connections', {
      method: 'POST',
      body: JSON.stringify({
        provider: form.provider,
        name: isFake ? 'FAKE demo connection' : 'OPENAI connection',
        config: {
          baseUrl: form.baseUrl || undefined,
          openaiProject: form.openaiProject.trim() || undefined
        },
        secrets: {
          apiKey: isFake ? undefined : form.apiKey
        }
      })
    });

    connections.value = [...connections.value, created.connection].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    emitConnectionsChanged({ action: 'created', connectionId: created.connection.id });
    form.baseUrl = '';
    form.openaiProject = '';
    form.apiKey = '';
    message.value = isFake ? 'Fake demo connection created' : 'Connection created';
    pushActivity(message.value);
  } catch (err) {
    message.value = `Create failed: ${formatApiError(err)}`;
    pushActivity(message.value);
  } finally {
    creating.value = false;
  }
}

async function testConnection(id: string) {
  if (testingId.value || deletingId.value) return;
  testingId.value = id;
  message.value = 'Testing connection...';
  latestTestResult.value = null;
  pushActivity(`Testing connection ${id}...`);
  try {
    const res = await api<{ ok: boolean; message: string; details?: Record<string, unknown> }>(`/api/connections/${id}/test`, {
      method: 'POST'
    });
    latestTestResult.value = res;
    if (res.ok) {
      const endpoint = typeof res.details?.endpoint === 'string' ? res.details.endpoint : undefined;
      const bucketCount = typeof res.details?.bucketCount === 'number' ? res.details.bucketCount : undefined;
      message.value = bucketCount === undefined ? 'Connection OK' : `Usage access OK (${bucketCount} bucket(s) returned)`;
      pushActivity(message.value);
      if (endpoint) {
        pushActivity(`Validated endpoint: ${endpoint}`);
      }
    } else {
      message.value = `Connection test failed: ${res.message}`;
      pushActivity(message.value);
    }
  } catch (err) {
    message.value = `Test failed: ${formatApiError(err)}`;
    pushActivity(message.value);
  } finally {
    testingId.value = null;
  }
}

async function deleteConnection(id: string) {
  if (testingId.value || deletingId.value) return;
  deletingId.value = id;
  message.value = 'Deleting connection...';
  pushActivity(`Deleting connection ${id}...`);
  try {
    const res = await api<{ ok: boolean; message?: string }>(`/api/connections/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      message.value = `Delete failed: ${res.message ?? 'unknown_error'}`;
      pushActivity(message.value);
      return;
    }
    connections.value = connections.value.filter((c) => c.id !== id);
    localStorage.removeItem(DASHBOARD_CACHE_KEY);
    emitConnectionsChanged({ action: 'deleted', connectionId: id });
    message.value = 'Connection deleted';
    pushActivity(message.value);
  } catch (err) {
    message.value = `Delete failed: ${formatApiError(err)}`;
    pushActivity(message.value);
  } finally {
    deletingId.value = null;
  }
}

onMounted(loadConnections);
</script>

<style scoped>
.console-hint {
  margin: 0;
  color: #64748b;
  font-size: 12px;
}

.console-pre {
  margin: 0;
  padding: 10px;
  border: 1px solid #d9e0ea;
  border-radius: 6px;
  background: #f8fafd;
  color: #0f172a;
  font-size: 12px;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
}

.console-log {
  margin: 0;
  padding-left: 18px;
  display: grid;
  gap: 6px;
  color: #334155;
  font-size: 12px;
}

.field-with-help {
  position: relative;
}

.help-icon {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  width: 16px;
  height: 16px;
  border-radius: 999px;
  border: 1px solid #94a3b8;
  color: #64748b;
  font-size: 11px;
  line-height: 14px;
  text-align: center;
  font-weight: 700;
  background: #fff;
  cursor: default;
}

.help-bubble {
  position: absolute;
  left: 24px;
  top: -4px;
  width: 300px;
  padding: 8px 10px;
  border-radius: 8px;
  background: #0f172a;
  color: #f8fafc;
  font-size: 11px;
  line-height: 1.35;
  box-shadow: 0 8px 24px rgba(2, 6, 23, 0.35);
  opacity: 0;
  pointer-events: none;
  transition: opacity 120ms ease;
  z-index: 10;
}

.help-icon:hover .help-bubble {
  opacity: 1;
}
</style>
