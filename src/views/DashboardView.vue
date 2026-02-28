<template>
  <section class="usage-page">
    <header class="usage-topbar">
      <h1 class="usage-title">Usage</h1>
      <div class="usage-actions">
        <Dropdown v-model="projectScope" :options="projectOptions" optionLabel="label" optionValue="value" class="usage-select" />
        <div class="usage-date-pill">
          <InputText v-model="filters.start" />
          <span>-</span>
          <InputText v-model="filters.end" />
        </div>
        <Button label="Refresh" :loading="refreshing" :disabled="refreshing || querying" @click="refreshUsage" />
        <a :href="csvHref" class="usage-export" target="_blank" rel="noreferrer">Export</a>
      </div>
    </header>

    <p v-if="message" class="usage-msg">{{ message }}</p>

    <section class="usage-main">
      <article class="usage-chart-card">
        <div class="usage-spend">
          <p>Total Spend</p>
          <h2>{{ usd(totalSpend) }}</h2>
        </div>
        <div class="usage-chart-wrap">
          <canvas ref="canvasRef" height="170"></canvas>
        </div>
      </article>

      <aside class="usage-side">
        <article class="usage-side-card">
          <p class="usage-side-label">Monthly budget</p>
          <p class="usage-side-value">{{ usd(totalSpend) }} / {{ usd(monthlyBudgetUsd) }}</p>
          <div class="usage-progress">
            <div class="usage-progress-fill" :style="{ width: `${budgetPercent}%` }"></div>
          </div>
        </article>
        <article class="usage-side-card">
          <p class="usage-side-label">Total tokens</p>
          <p class="usage-side-value">{{ compact(totalTokens) }}</p>
          <div class="usage-side-line usage-side-line-tokens"></div>
        </article>
        <article class="usage-side-card">
          <p class="usage-side-label">Total requests</p>
          <p class="usage-side-value">{{ compact(totalRequests) }}</p>
          <div class="usage-side-line"></div>
        </article>
      </aside>
    </section>

    <section class="usage-tabs">
      <button class="usage-tab usage-tab-active" type="button">API capabilities</button>
      <button class="usage-tab" type="button">Spend categories</button>
    </section>

    <section class="cap-grid">
      <article v-for="card in capabilityCards" :key="card.key" class="cap-card">
        <header class="cap-head">
          <h3>{{ card.title }}</h3>
          <span>›</span>
        </header>
        <p class="cap-meta">
          <span>{{ compact(card.requests) }} requests</span>
          <span>{{ compact(card.secondaryValue) }} {{ card.secondaryLabel }}</span>
        </p>
        <div class="cap-chart">
          <div class="cap-line"></div>
          <div v-if="card.requests > 0" class="cap-stick" :style="{ left: `${card.markerPercent}%` }"></div>
        </div>
        <footer class="cap-foot">
          <span>{{ shortDate(filters.start) }}</span>
          <span>{{ shortDate(filters.end) }}</span>
        </footer>
      </article>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Dropdown from 'primevue/dropdown';
import { Chart, LineController, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Filler } from 'chart.js';
import { api } from '../components/api';

Chart.register(LineController, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Filler);

type UsageRow = {
  bucketStart: string;
  model: string;
  inputTokens: number;
  totalTokens: number;
  numModelRequests: number;
  costUsd: number;
};

type CapabilityKey =
  | 'responses'
  | 'images'
  | 'webSearches'
  | 'fileSearches'
  | 'moderation'
  | 'embeddings'
  | 'audioSpeeches'
  | 'audioTranscriptions'
  | 'vectorStores'
  | 'codeInterpreter';

const canvasRef = ref<HTMLCanvasElement | null>(null);
let chart: Chart | null = null;

const now = new Date();
const ago = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
const filters = reactive({
  granularity: 'day',
  start: ago.toISOString(),
  end: now.toISOString()
});

const projectScope = ref('all');
const projectOptions = [{ label: 'All projects', value: 'all' }];
const monthlyBudgetUsd = 10;
const rows = ref<UsageRow[]>([]);
const message = ref('');
const refreshing = ref(false);
const querying = ref(false);

const csvHref = computed(() => {
  const p = new URLSearchParams();
  p.set('granularity', 'hour');
  p.set('start', filters.start);
  p.set('end', filters.end);
  p.set('provider', 'openai');
  return `/api/export.csv?${p.toString()}`;
});

const totalSpend = computed(() => rows.value.reduce((sum, row) => sum + Number(row.costUsd || 0), 0));
const totalTokens = computed(() => rows.value.reduce((sum, row) => sum + Number(row.totalTokens || 0), 0));
const totalRequests = computed(() => rows.value.reduce((sum, row) => sum + Number(row.numModelRequests || 0), 0));
const budgetPercent = computed(() => Math.min(100, (totalSpend.value / monthlyBudgetUsd) * 100));

function normalizeModel(value: string): string {
  return String(value || '').toLowerCase();
}

function capabilityOf(model: string): CapabilityKey {
  const m = normalizeModel(model);
  if (m.includes('embedding')) return 'embeddings';
  if (m.includes('moderat')) return 'moderation';
  if (m.includes('whisper') || m.includes('transcri')) return 'audioTranscriptions';
  if (m.includes('tts') || m.includes('speech')) return 'audioSpeeches';
  if (m.includes('image') || m.includes('dall')) return 'images';
  if (m.includes('web-search')) return 'webSearches';
  if (m.includes('file-search')) return 'fileSearches';
  if (m.includes('code-interpreter')) return 'codeInterpreter';
  if (m.includes('vector-store')) return 'vectorStores';
  return 'responses';
}

function usd(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value || 0);
}

function compact(value: number): string {
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(value || 0);
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
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

function renderChart() {
  if (!canvasRef.value) return;
  const grouped = new Map<string, number>();
  for (const row of rows.value) {
    const day = row.bucketStart.slice(0, 10);
    grouped.set(day, (grouped.get(day) ?? 0) + Number(row.costUsd || 0));
  }
  const labels = [...grouped.keys()].sort();
  const values = labels.map((k) => grouped.get(k) ?? 0);

  if (chart) chart.destroy();
  chart = new Chart(canvasRef.value, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Spend',
          data: values,
          borderColor: '#6d4aff',
          backgroundColor: 'rgba(109,74,255,0.14)',
          fill: true,
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.35
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: { grid: { display: false } },
        y: { grid: { color: '#ececf4' } }
      }
    }
  });
}

async function queryUsage() {
  if (querying.value) return;
  querying.value = true;
  try {
    const p = new URLSearchParams();
    p.set('granularity', 'hour');
    p.set('start', filters.start);
    p.set('end', filters.end);
    p.set('provider', 'openai');

    const res = await api<{ rows: UsageRow[] }>(`/api/usage/query?${p.toString()}`);
    rows.value = res.rows;
  } catch (err) {
    message.value = `Query failed: ${formatApiError(err)}`;
  } finally {
    querying.value = false;
  }
}

async function refreshUsage() {
  if (refreshing.value || querying.value) return;
  refreshing.value = true;
  message.value = 'Refreshing usage...';
  try {
    const res = await api<{ ok: boolean; rowsAdded: number; errors?: Array<{ message: string }> }>('/api/usage/refresh', {
      method: 'POST',
      body: JSON.stringify({
        start: filters.start,
        end: filters.end
      })
    });
    if (res.ok) {
      message.value = `Refresh complete (${res.rowsAdded} rows added).`;
    } else {
      const details = (res.errors ?? []).map((e) => e.message).filter(Boolean).join(' | ');
      message.value = `Refresh completed with issue(s): ${details || 'unknown_error'}`;
    }
    await queryUsage();
  } catch (err) {
    message.value = `Refresh failed: ${formatApiError(err)}`;
  } finally {
    refreshing.value = false;
  }
}

const capabilityCards = computed(() => {
  const seed: Record<
    CapabilityKey,
    { title: string; secondaryLabel: string; requests: number; secondaryValue: number; markerPercent: number }
  > = {
    responses: { title: 'Responses and Chat Completions', secondaryLabel: 'input tokens', requests: 0, secondaryValue: 0, markerPercent: 75 },
    images: { title: 'Images', secondaryLabel: 'images', requests: 0, secondaryValue: 0, markerPercent: 75 },
    webSearches: { title: 'Web Searches', secondaryLabel: 'searches', requests: 0, secondaryValue: 0, markerPercent: 75 },
    fileSearches: { title: 'File Searches', secondaryLabel: 'searches', requests: 0, secondaryValue: 0, markerPercent: 75 },
    moderation: { title: 'Moderation', secondaryLabel: 'input tokens', requests: 0, secondaryValue: 0, markerPercent: 75 },
    embeddings: { title: 'Embeddings', secondaryLabel: 'input tokens', requests: 0, secondaryValue: 0, markerPercent: 75 },
    audioSpeeches: { title: 'Audio Speeches', secondaryLabel: 'characters', requests: 0, secondaryValue: 0, markerPercent: 75 },
    audioTranscriptions: { title: 'Audio Transcriptions', secondaryLabel: 'seconds', requests: 0, secondaryValue: 0, markerPercent: 75 },
    vectorStores: { title: 'Vector Stores', secondaryLabel: 'bytes', requests: 0, secondaryValue: 0, markerPercent: 75 },
    codeInterpreter: { title: 'Code Interpreter Sessions', secondaryLabel: 'sessions', requests: 0, secondaryValue: 0, markerPercent: 75 }
  };

  const byDay = new Map<CapabilityKey, Map<string, number>>();
  for (const key of Object.keys(seed) as CapabilityKey[]) byDay.set(key, new Map<string, number>());

  for (const row of rows.value) {
    const key = capabilityOf(row.model);
    seed[key].requests += Number(row.numModelRequests || 0);
    seed[key].secondaryValue += Number(row.inputTokens || 0);
    const day = row.bucketStart.slice(0, 10);
    const m = byDay.get(key)!;
    m.set(day, (m.get(day) ?? 0) + Number(row.numModelRequests || 0));
  }

  for (const key of Object.keys(seed) as CapabilityKey[]) {
    const series = [...byDay.get(key)!.values()];
    if (series.length > 0) {
      const idx = series.findIndex((v) => v > 0);
      if (idx >= 0) {
        seed[key].markerPercent = Math.max(8, Math.min(94, (idx / Math.max(1, series.length - 1)) * 100));
      }
    }
  }

  return [
    { key: 'responses', ...seed.responses },
    { key: 'images', ...seed.images },
    { key: 'webSearches', ...seed.webSearches },
    { key: 'fileSearches', ...seed.fileSearches },
    { key: 'moderation', ...seed.moderation },
    { key: 'embeddings', ...seed.embeddings },
    { key: 'audioSpeeches', ...seed.audioSpeeches },
    { key: 'audioTranscriptions', ...seed.audioTranscriptions },
    { key: 'vectorStores', ...seed.vectorStores },
    { key: 'codeInterpreter', ...seed.codeInterpreter }
  ];
});

watch(rows, renderChart);
onMounted(async () => {
  await refreshUsage();
});
</script>

<style scoped>
.usage-page {
  display: grid;
  gap: 14px;
}

.usage-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: #fff;
  border: 1px solid #e5e7ef;
  border-radius: 12px;
  padding: 12px 14px;
}

.usage-title {
  margin: 0;
  font-size: 32px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.usage-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.usage-select {
  min-width: 170px;
}

.usage-date-pill {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid #e3e6f2;
  border-radius: 999px;
  padding: 5px 10px;
  background: #fafbff;
}

.usage-date-pill :deep(.p-inputtext) {
  border: 0;
  background: transparent;
  width: 152px;
  font-size: 12px;
  padding: 2px 4px;
}

.usage-export {
  color: #0f172a;
  text-decoration: none;
  font-weight: 600;
}

.usage-msg {
  margin: 0;
  padding: 10px 12px;
  border: 1px solid #ddd6fe;
  border-radius: 8px;
  background: #f5f3ff;
  color: #5b21b6;
  font-size: 12px;
}

.usage-main {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 0;
  border: 1px solid #e5e7ef;
  border-radius: 14px;
  overflow: hidden;
  background: #fff;
}

.usage-chart-card {
  padding: 16px;
  min-height: 420px;
}

.usage-spend p {
  margin: 0;
  color: #5b6074;
  font-size: 20px;
}

.usage-spend h2 {
  margin: 4px 0 0;
  font-size: 46px;
  font-weight: 700;
}

.usage-chart-wrap {
  margin-top: 20px;
  height: 300px;
}

.usage-side {
  border-left: 1px solid #eceef6;
  display: grid;
  grid-template-rows: repeat(3, 1fr);
}

.usage-side-card {
  padding: 16px;
  border-bottom: 1px solid #eceef6;
}

.usage-side-card:last-child {
  border-bottom: 0;
}

.usage-side-label {
  margin: 0;
  color: #5b6074;
  font-size: 18px;
}

.usage-side-value {
  margin: 6px 0 0;
  font-size: 34px;
  font-weight: 700;
}

.usage-progress {
  margin-top: 16px;
  width: 100%;
  height: 16px;
  border-radius: 999px;
  background: #ecebf8;
  overflow: hidden;
}

.usage-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #f43f5e, #a855f7);
}

.usage-side-line {
  margin-top: 30px;
  border-bottom: 3px dashed #d1d5e5;
}

.usage-side-line-tokens {
  border-bottom-style: solid;
  border-bottom-color: #f43f7e;
}

.usage-tabs {
  display: flex;
  align-items: center;
  gap: 14px;
  border-bottom: 1px solid #eceef6;
  padding-bottom: 8px;
}

.usage-tab {
  border: 0;
  background: transparent;
  color: #6b7280;
  font-size: 18px;
  padding: 4px 0;
  cursor: pointer;
}

.usage-tab-active {
  color: #111827;
  font-weight: 700;
  border-bottom: 2px solid #111827;
}

.cap-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.cap-card {
  border: 1px solid #e5e7ef;
  border-radius: 14px;
  background: #fff;
  padding: 16px;
  min-height: 220px;
  display: grid;
  grid-template-rows: auto auto 1fr auto;
}

.cap-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.cap-head h3 {
  margin: 0;
  font-size: 30px;
  font-weight: 600;
}

.cap-head span {
  color: #5f6477;
  font-size: 28px;
  line-height: 1;
}

.cap-meta {
  margin: 8px 0 0;
  display: flex;
  gap: 14px;
  color: #666c82;
  font-size: 18px;
}

.cap-chart {
  position: relative;
  display: flex;
  align-items: center;
}

.cap-line {
  width: 100%;
  border-bottom: 3px dashed #ccd2e4;
}

.cap-stick {
  position: absolute;
  bottom: -1px;
  width: 4px;
  height: 84px;
  border-radius: 2px;
  background: #6d4aff;
}

.cap-foot {
  display: flex;
  justify-content: space-between;
  color: #6f758a;
  font-size: 30px;
}

@media (max-width: 1280px) {
  .usage-main {
    grid-template-columns: 1fr;
  }

  .usage-side {
    border-left: 0;
    border-top: 1px solid #eceef6;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    grid-template-rows: 1fr;
  }

  .usage-side-card {
    border-bottom: 0;
    border-right: 1px solid #eceef6;
  }

  .usage-side-card:last-child {
    border-right: 0;
  }

  .cap-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 900px) {
  .usage-title {
    font-size: 24px;
  }

  .usage-topbar {
    flex-direction: column;
    align-items: stretch;
  }

  .usage-actions {
    justify-content: flex-start;
  }

  .usage-date-pill {
    width: 100%;
  }

  .usage-date-pill :deep(.p-inputtext) {
    width: 100%;
  }

  .usage-spend h2,
  .usage-side-value,
  .cap-head h3,
  .cap-foot {
    font-size: 24px;
  }

  .cap-meta,
  .usage-side-label,
  .usage-spend p {
    font-size: 14px;
  }
}
</style>
