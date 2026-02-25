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
        <p class="console-panel-subtitle">Create and manage multiple LLM provider connections.</p>
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
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Dropdown from 'primevue/dropdown';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import { api } from '../components/api';

type Provider = 'openai' | 'anthropic' | 'gemini' | 'mistral';

const providers: Provider[] = ['openai', 'anthropic', 'gemini', 'mistral'];

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

.security-note {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: #334155;
}

@media (max-width: 980px) {
  .span-3 {
    grid-column: span 1;
  }
}
</style>
