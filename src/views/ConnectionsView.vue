<template>
  <section class="console-section">
    <article class="console-panel">
      <header class="console-panel-header">
        <h2 class="console-panel-title">Security notice</h2>
      </header>
      <div class="console-panel-body">
        <p class="security-note">
          Your LLM credentials are stored securely within your browser and solely transmitted to the tokensun server hosted on Upsun.
          This method enhances security by ensuring that your credentials are not shared with any third parties, thereby reducing the risk of unauthorized access.
          Please note that if you access Upsun from a different browser or device, you will be required to re-enter your llm key.
        </p>
      </div>
    </article>

    <article class="console-panel">
      <header class="console-panel-header">
        <h2 class="console-panel-title">Provider connections</h2>
        <p class="console-panel-subtitle">Create and manage OpenAI provider connections.</p>
      </header>
      <div class="console-panel-body console-grid-4">
        <InputText value="openai" disabled />
        <InputText v-model="form.name" placeholder="Connection name" />
        <InputText v-model="form.baseUrl" placeholder="Base URL (optional)" />
        <InputText v-model="form.apiKey" type="password" placeholder="API key" />
        <Button label="Create connection" :loading="creating" :disabled="creating" @click="createConnection" />
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

    <p v-if="message" class="console-msg">{{ message }}</p>
  </section>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import { api } from '../components/api';

const form = reactive({
  provider: 'openai' as const,
  name: '',
  baseUrl: '',
  apiKey: ''
});

const message = ref('');
const connections = ref<any[]>([]);
const creating = ref(false);
const testingId = ref<string | null>(null);
const deletingId = ref<string | null>(null);

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
    connections.value = res.connections.filter((c) => c.provider === 'openai');
  } catch (err) {
    message.value = `Failed to load connections: ${formatApiError(err)}`;
  }
}

async function createConnection() {
  if (creating.value) return;
  creating.value = true;
  try {
    const fallbackName = `${form.provider.toUpperCase()} connection`;
    await api('/api/connections', {
      method: 'POST',
      body: JSON.stringify({
        provider: form.provider,
        name: form.name.trim() || fallbackName,
        config: {
          baseUrl: form.baseUrl || undefined
        },
        secrets: {
          apiKey: form.apiKey
        }
      })
    });

    form.name = '';
    form.baseUrl = '';
    form.apiKey = '';
    message.value = 'Connection created';
    await loadConnections();
  } catch (err) {
    message.value = `Create failed: ${formatApiError(err)}`;
  } finally {
    creating.value = false;
  }
}

async function testConnection(id: string) {
  if (testingId.value || deletingId.value) return;
  testingId.value = id;
  message.value = 'Testing OpenAI connection...';
  try {
    const res = await api<{ ok: boolean; message: string }>(`/api/connections/${id}/test`, {
      method: 'POST'
    });
    message.value = res.ok ? 'OpenAI connection OK' : `OpenAI test failed: ${res.message}`;
    await loadConnections();
  } catch (err) {
    message.value = `Test failed: ${formatApiError(err)}`;
  } finally {
    testingId.value = null;
  }
}

async function deleteConnection(id: string) {
  if (testingId.value || deletingId.value) return;
  deletingId.value = id;
  message.value = 'Deleting connection...';
  try {
    await api(`/api/connections/${id}`, { method: 'DELETE' });
    message.value = 'Connection deleted';
    await loadConnections();
  } catch (err) {
    message.value = `Delete failed: ${formatApiError(err)}`;
  } finally {
    deletingId.value = null;
  }
}

onMounted(loadConnections);
</script>

<style scoped>
.security-note {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: #334155;
}
</style>
