<template>
  <section class="console-section">
    <article class="console-panel">
      <header class="console-panel-header">
        <h2 class="console-panel-title">Usage and cost dashboard</h2>
        <p class="console-panel-subtitle">OpenAI usage dashboard with all fields from the Completions Usage API.</p>
      </header>
      <div class="console-panel-body console-grid-4">
        <Dropdown v-model="filters.granularity" :options="granularities" />
        <InputText v-model="filters.start" placeholder="ISO start" />
        <InputText v-model="filters.end" placeholder="ISO end" />
        <InputText value="openai" disabled />
        <InputText v-model="filters.model" placeholder="Model (optional)" />
        <InputText v-model="filters.projectId" placeholder="Project ID (optional)" />
        <InputText v-model="filters.userId" placeholder="User ID (optional)" />
        <InputText v-model="filters.apiKeyId" placeholder="API Key ID (optional)" />
        <Dropdown v-model="filters.batch" :options="batchOptions" optionLabel="label" optionValue="value" placeholder="Batch (optional)" />
        <Button label="Refresh usage" :loading="refreshing" :disabled="refreshing || querying" @click="refreshUsage" />
        <Button label="Query" severity="secondary" :loading="querying" :disabled="refreshing || querying" @click="queryUsage" />
        <a :href="csvHref" class="console-link" target="_blank" rel="noreferrer">Export CSV</a>
      </div>
    </article>

    <p v-if="message" class="console-msg">{{ message }}</p>

    <article class="console-panel">
      <div class="console-panel-body">
        <canvas ref="canvasRef" height="120"></canvas>
      </div>
    </article>

    <article class="console-panel">
      <div class="console-panel-body">
        <DataTable :value="rows" size="small" stripedRows>
          <Column field="bucketStart" header="Bucket" />
          <Column field="provider" header="Provider" />
          <Column field="model" header="Model" />
          <Column field="projectId" header="Project" />
          <Column field="userId" header="User" />
          <Column field="apiKeyId" header="API Key" />
          <Column field="batch" header="Batch" />
          <Column field="numModelRequests" header="Requests" />
          <Column field="inputTokens" header="Input" />
          <Column field="inputCachedTokens" header="Cached Input" />
          <Column field="inputAudioTokens" header="Input Audio" />
          <Column field="outputTokens" header="Output" />
          <Column field="outputAudioTokens" header="Output Audio" />
          <Column field="totalTokens" header="Total tokens" />
          <Column field="costUsd" header="Cost (USD)" />
          <Column field="costMode" header="Mode" />
        </DataTable>
      </div>
    </article>

    <article class="console-panel">
      <header class="console-panel-header">
        <h2 class="console-panel-title">Dashboard actions</h2>
      </header>
      <div class="console-panel-body">
        <p v-if="activity.length === 0" class="console-hint">No actions yet.</p>
        <ul v-else class="console-log">
          <li v-for="entry in activity" :key="entry.id">{{ entry.text }}</li>
        </ul>
      </div>
    </article>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Dropdown from 'primevue/dropdown';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import { Chart, LineController, LineElement, PointElement, CategoryScale, LinearScale, Legend, Tooltip } from 'chart.js';
import { api } from '../components/api';

Chart.register(LineController, LineElement, PointElement, CategoryScale, LinearScale, Legend, Tooltip);

const canvasRef = ref<HTMLCanvasElement | null>(null);
let chart: Chart | null = null;

const granularities = ['hour', 'week', 'month', 'year'];
const batchOptions = [
  { label: 'Any', value: '' },
  { label: 'true', value: 'true' },
  { label: 'false', value: 'false' }
];
const now = new Date();
const ago = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

const filters = reactive({
  granularity: 'hour',
  start: ago.toISOString(),
  end: now.toISOString(),
  provider: 'openai',
  model: '',
  projectId: '',
  userId: '',
  apiKeyId: '',
  batch: ''
});

const rows = ref<any[]>([]);
const message = ref('');
const refreshing = ref(false);
const querying = ref(false);
const activity = ref<Array<{ id: string; text: string }>>([]);

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
    const parsed = JSON.parse(err.message) as { error?: string; message?: string };
    return parsed.message ?? parsed.error ?? 'Request failed';
  } catch {
    return err.message || 'Request failed';
  }
}

const qs = computed(() => {
  const p = new URLSearchParams();
  p.set('granularity', filters.granularity);
  p.set('start', filters.start);
  p.set('end', filters.end);
  if (filters.provider) p.set('provider', filters.provider);
  if (filters.model) p.set('model', filters.model);
  if (filters.projectId) p.set('projectId', filters.projectId);
  if (filters.userId) p.set('userId', filters.userId);
  if (filters.apiKeyId) p.set('apiKeyId', filters.apiKeyId);
  if (filters.batch) p.set('batch', filters.batch);
  return p.toString();
});

const csvHref = computed(() => `/api/export.csv?${qs.value}`);

function renderChart() {
  if (!canvasRef.value) return;
  const labels = rows.value.map((r) => r.bucketStart);
  const values = rows.value.map((r) => Number(r.costUsd ?? 0));

  if (chart) chart.destroy();
  chart = new Chart(canvasRef.value, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Cost USD',
          data: values,
          borderColor: '#2e6df6',
          backgroundColor: '#c8dafd',
          borderWidth: 2,
          pointRadius: 2
        }
      ]
    }
  });
}

async function refreshUsage() {
  if (refreshing.value || querying.value) return;
  refreshing.value = true;
  message.value = 'Refreshing usage from OpenAI...';
  pushActivity(message.value);
  try {
    const res = await api<{ ok: boolean; rowsAdded: number; errors?: Array<{ message: string }> }>('/api/usage/refresh', {
      method: 'POST',
      body: JSON.stringify({
        start: filters.start,
        end: filters.end
      })
    });

    if (res.ok) {
      message.value = `Refresh complete (${res.rowsAdded} row(s) added).`;
      pushActivity(message.value);
    } else {
      const details = (res.errors ?? []).map((e) => e.message).filter(Boolean).join(' | ');
      message.value = `Refresh completed with issue(s): ${details || 'unknown_error'}`;
      pushActivity(message.value);
    }

    await queryUsage({ suppressSuccessMessage: true });
  } catch (err) {
    message.value = `Refresh failed: ${formatApiError(err)}`;
    pushActivity(message.value);
  } finally {
    refreshing.value = false;
  }
}

async function queryUsage(options?: { suppressSuccessMessage?: boolean }) {
  if (querying.value) return;
  querying.value = true;
  pushActivity('Querying dashboard rows...');
  try {
    const res = await api<{ rows: any[] }>(`/api/usage/query?${qs.value}`);
    rows.value = res.rows;
    if (!options?.suppressSuccessMessage) {
      message.value = `Query complete (${rows.value.length} row(s)).`;
    }
    pushActivity(`Query complete (${rows.value.length} row(s)).`);
  } catch (err) {
    message.value = `Query failed: ${formatApiError(err)}`;
    pushActivity(message.value);
  } finally {
    querying.value = false;
  }
}

watch(rows, renderChart);
onMounted(async () => {
  await queryUsage();
});
</script>

<style scoped>
.console-hint {
  margin: 0;
  color: #64748b;
  font-size: 12px;
}

.console-log {
  margin: 0;
  padding-left: 18px;
  display: grid;
  gap: 6px;
  color: #334155;
  font-size: 12px;
}
</style>
