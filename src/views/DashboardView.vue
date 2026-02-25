<template>
  <section class="console-section">
    <article class="console-panel">
      <header class="console-panel-header">
        <h2 class="console-panel-title">Usage and cost dashboard</h2>
        <p class="console-panel-subtitle">Timeline and provider cost reporting with hour/week/month/year buckets.</p>
      </header>
      <div class="console-panel-body console-grid-4">
        <Dropdown v-model="filters.granularity" :options="granularities" />
        <InputText v-model="filters.start" placeholder="ISO start" />
        <InputText v-model="filters.end" placeholder="ISO end" />
        <InputText v-model="filters.provider" placeholder="Provider (optional)" />
        <InputText v-model="filters.model" placeholder="Model (optional)" />
        <Button label="Refresh usage" @click="refreshUsage" />
        <Button label="Query" severity="secondary" @click="queryUsage" />
        <a :href="csvHref" class="console-link" target="_blank" rel="noreferrer">Export CSV</a>
      </div>
    </article>

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
          <Column field="totalTokens" header="Total tokens" />
          <Column field="costUsd" header="Cost (USD)" />
          <Column field="costMode" header="Mode" />
        </DataTable>
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
const now = new Date();
const ago = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

const filters = reactive({
  granularity: 'hour',
  start: ago.toISOString(),
  end: now.toISOString(),
  provider: '',
  model: ''
});

const rows = ref<any[]>([]);

const qs = computed(() => {
  const p = new URLSearchParams();
  p.set('granularity', filters.granularity);
  p.set('start', filters.start);
  p.set('end', filters.end);
  if (filters.provider) p.set('provider', filters.provider);
  if (filters.model) p.set('model', filters.model);
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
  await api('/api/usage/refresh', {
    method: 'POST',
    body: JSON.stringify({
      start: filters.start,
      end: filters.end
    })
  });
  await queryUsage();
}

async function queryUsage() {
  const res = await api<{ rows: any[] }>(`/api/usage/query?${qs.value}`);
  rows.value = res.rows;
}

watch(rows, renderChart);
onMounted(queryUsage);
</script>
