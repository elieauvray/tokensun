<template>
  <section class="usage-page">
    <article v-if="!hasConnections" class="connect-callout">
      <div>
        <h2>No connection configured</h2>
        <p>Create an OpenAI or Fake provider connection to load usage and spend data.</p>
      </div>
    </article>

    <div class="usage-shell" :class="{ 'usage-shell-dimmed': !hasConnections }">
      <header class="usage-topbar">
        <h1 class="usage-title">Usage</h1>
        <div class="usage-actions">
          <div class="provider-filters">
            <label v-for="connection in availableConnections" :key="connection.id" class="provider-filter">
              <input v-model="selectedConnectionIds" type="checkbox" :value="connection.id" />
              <span class="provider-dot" :style="{ backgroundColor: connectionColor(connection.id) }"></span>
              <span>{{ providerLabel(connection.provider) }}</span>
              <button type="button" class="provider-info-btn" @click.stop.prevent="toggleConnectionInfo(connection.id)">i</button>
              <span v-if="activeInfoConnectionId === connection.id" class="provider-info-popover">
                Project ID: {{ connectionProjectId(connection.id) }}
              </span>
            </label>
          </div>

          <button type="button" class="range-trigger" @click="toggleRangePicker">
            <span class="range-icon">🗓</span>
            <span>{{ rangeLabel }}</span>
          </button>

          <Button label="Refresh" :loading="refreshing" :disabled="refreshing || querying || !hasConnections" @click="refreshUsage" />
          <a :href="csvHref" class="usage-export" target="_blank" rel="noreferrer">Export</a>
        </div>
      </header>

      <div v-if="showRangePicker" class="range-popover">
        <aside class="range-presets">
          <button v-for="preset in presets" :key="preset.value" type="button" class="preset-btn" @click="applyPreset(preset.value)">
            {{ preset.label }}
          </button>
        </aside>
        <div class="range-calendar">
          <Calendar
            v-model="rangeSelection"
            selectionMode="range"
            :inline="true"
            :numberOfMonths="2"
            dateFormat="mm/dd/yy"
            @date-select="onRangeSelect"
          />
          <div class="range-footer">
            <Button label="Apply range" size="small" @click="applyRangeOnly" />
          </div>
        </div>
      </div>

      <p v-if="message" class="usage-msg">{{ message }}</p>

      <section class="usage-main">
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
            <div class="usage-spark" @mousemove="onTokenSparkMove" @mouseleave="clearTokenSparkHover">
              <svg viewBox="0 0 100 34" preserveAspectRatio="none">
                <g v-for="bar in tokenBars" :key="`token-bar-${bar.index}`">
                  <template v-if="bar.drawInputAfterOutput">
                    <rect class="usage-spark-bar usage-spark-bar-output" :x="bar.x" :y="32 - bar.outputHeight" :width="bar.width" :height="bar.outputHeight" />
                    <rect class="usage-spark-bar usage-spark-bar-input" :x="bar.x" :y="32 - bar.inputHeight" :width="bar.width" :height="bar.inputHeight" />
                  </template>
                  <template v-else>
                    <rect class="usage-spark-bar usage-spark-bar-input" :x="bar.x" :y="32 - bar.inputHeight" :width="bar.width" :height="bar.inputHeight" />
                    <rect class="usage-spark-bar usage-spark-bar-output" :x="bar.x" :y="32 - bar.outputHeight" :width="bar.width" :height="bar.outputHeight" />
                  </template>
                </g>
                <line v-if="tokenHoverIndex !== null" class="usage-spark-hover-line" :x1="sparkX(tokenHoverIndex, dailyTrend.days.length)" y1="2" :x2="sparkX(tokenHoverIndex, dailyTrend.days.length)" y2="32" />
              </svg>
              <div v-if="tokenHoverIndex !== null" class="usage-spark-tooltip" :style="tokenTooltipStyle">
                <p class="usage-spark-tooltip-date">{{ sparkTooltipDate(dailyTrend.days[tokenHoverIndex]) }}</p>
                <p class="usage-spark-tooltip-total">{{ compact(dailyTrend.input[tokenHoverIndex] + dailyTrend.output[tokenHoverIndex]) }} completion tokens</p>
                <div class="usage-spark-tooltip-row">
                  <span class="usage-spark-dot usage-spark-dot-input"></span>
                  <span>Input</span>
                  <span>{{ compact(dailyTrend.input[tokenHoverIndex]) }}</span>
                </div>
                <div class="usage-spark-tooltip-row">
                  <span class="usage-spark-dot usage-spark-dot-output"></span>
                  <span>Output</span>
                  <span>{{ compact(dailyTrend.output[tokenHoverIndex]) }}</span>
                </div>
              </div>
            </div>
          </article>
          <article class="usage-side-card">
            <p class="usage-side-label">Total requests</p>
            <p class="usage-side-value">{{ compact(totalRequests) }}</p>
            <div class="usage-spark" @mousemove="onRequestSparkMove" @mouseleave="clearRequestSparkHover">
              <svg viewBox="0 0 100 34" preserveAspectRatio="none">
                <rect
                  v-for="bar in requestBars"
                  :key="`request-bar-${bar.index}`"
                  class="usage-spark-bar usage-spark-bar-requests"
                  :x="bar.x"
                  :y="32 - bar.height"
                  :width="bar.width"
                  :height="bar.height"
                />
                <line v-if="requestHoverIndex !== null" class="usage-spark-hover-line" :x1="sparkX(requestHoverIndex, dailyTrend.days.length)" y1="2" :x2="sparkX(requestHoverIndex, dailyTrend.days.length)" y2="32" />
              </svg>
              <div v-if="requestHoverIndex !== null" class="usage-spark-tooltip" :style="requestTooltipStyle">
                <p class="usage-spark-tooltip-date">{{ sparkTooltipDate(dailyTrend.days[requestHoverIndex]) }}</p>
                <p class="usage-spark-tooltip-total">{{ compact(dailyTrend.requests[requestHoverIndex]) }} requests</p>
              </div>
            </div>
          </article>
        </aside>

        <article class="usage-chart-card">
          <div class="usage-spend">
            <p>Total Spend</p>
            <h2>{{ usd(totalSpend) }}</h2>
          </div>
          <div class="usage-chart-wrap">
            <canvas ref="canvasRef" height="170"></canvas>
          </div>
        </article>
      </section>

      <section class="usage-tabs">
        <button type="button" class="usage-tab" :class="{ 'usage-tab-active': activeTab === 'capabilities' }" @click="activeTab = 'capabilities'">
          API capabilities
        </button>
        <button type="button" class="usage-tab" :class="{ 'usage-tab-active': activeTab === 'spend' }" @click="activeTab = 'spend'">
          Spend categories
        </button>
      </section>

      <section v-if="activeTab === 'capabilities'" class="cap-grid">
        <article v-for="card in capabilityCards" :key="card.key" class="cap-card">
          <header class="cap-head">
            <h3>{{ card.title }}</h3>
          </header>
          <div class="cap-info">
            <p class="cap-meta">
              <span>{{ compact(card.requests) }} requests</span>
              <span>{{ compact(card.secondaryValue) }} {{ card.secondaryLabel }}</span>
            </p>
            <div v-if="card.series.length > 1" class="cap-series">
              <span v-for="series in card.series" :key="`${card.key}-${series.connectionId}`" class="cap-series-item">
                <span class="cap-tooltip-dot" :style="{ backgroundColor: series.color }"></span>
                <span>{{ series.label }}</span>
              </span>
            </div>
          </div>
          <div class="cap-chart" @mouseleave="hideCardTooltip(card.key)">
            <div class="cap-line"></div>
            <template v-for="(series, seriesIndex) in card.series" :key="`${card.key}-${series.connectionId}-sticks`">
              <button
                v-for="point in series.points"
                :key="`${card.key}-${series.connectionId}-${point.date}`"
                type="button"
                class="cap-stick cap-stick-hit"
                :style="stickStyle(point, seriesIndex, card.series.length, series.color)"
                @mouseenter="showCardTooltip($event, card.key, `${card.title} (${series.label})`, point.date, point.value, 'number', series.color)"
              ></button>
            </template>
          </div>
          <footer class="cap-foot">
            <span>{{ shortDate(filters.start) }}</span>
            <span>{{ shortDate(filters.end) }}</span>
          </footer>
          <div v-if="hoverTooltip?.cardKey === card.key" class="cap-tooltip" :style="{ left: `${hoverTooltip.left}px`, top: `${hoverTooltip.top}px` }">
            <p class="cap-tooltip-date">{{ hoverTooltip.dateLabel }}</p>
            <div class="cap-tooltip-row">
              <span class="cap-tooltip-dot" :style="{ backgroundColor: hoverTooltip.color }"></span>
              <span class="cap-tooltip-name">{{ hoverTooltip.label }}</span>
              <span class="cap-tooltip-val">{{ hoverTooltip.valueLabel }}</span>
            </div>
          </div>
        </article>
      </section>

      <section v-else class="cap-grid">
        <article v-for="card in spendCards" :key="card.key" class="cap-card">
          <header class="cap-head">
            <h3>{{ card.title }}</h3>
          </header>
          <div class="cap-info">
            <p class="cap-meta">
              <span>{{ usd(card.total) }} total</span>
            </p>
            <p class="cap-strong">{{ usd(card.peak) }}</p>
            <div v-if="card.series.length > 1" class="cap-series">
              <span v-for="series in card.series" :key="`${card.key}-${series.connectionId}`" class="cap-series-item">
                <span class="cap-tooltip-dot" :style="{ backgroundColor: series.color }"></span>
                <span>{{ series.label }}</span>
              </span>
            </div>
          </div>
          <div class="cap-chart" @mouseleave="hideCardTooltip(card.key)">
            <div class="cap-line"></div>
            <template v-for="(series, seriesIndex) in card.series" :key="`${card.key}-${series.connectionId}-sticks`">
              <button
                v-for="point in series.points"
                :key="`${card.key}-${series.connectionId}-${point.date}`"
                type="button"
                class="cap-stick cap-stick-hit"
                :style="stickStyle(point, seriesIndex, card.series.length, series.color)"
                @mouseenter="showCardTooltip($event, card.key, `${card.title} (${series.label})`, point.date, point.value, 'currency', series.color)"
              ></button>
            </template>
          </div>
          <footer class="cap-foot">
            <span>{{ shortDate(filters.start) }}</span>
            <span>{{ shortDate(filters.end) }}</span>
          </footer>
          <div v-if="hoverTooltip?.cardKey === card.key" class="cap-tooltip" :style="{ left: `${hoverTooltip.left}px`, top: `${hoverTooltip.top}px` }">
            <p class="cap-tooltip-date">{{ hoverTooltip.dateLabel }}</p>
            <div class="cap-tooltip-row">
              <span class="cap-tooltip-dot" :style="{ backgroundColor: hoverTooltip.color }"></span>
              <span class="cap-tooltip-name">{{ hoverTooltip.label }}</span>
              <span class="cap-tooltip-val">{{ hoverTooltip.valueLabel }}</span>
            </div>
          </div>
        </article>
        <article v-if="spendCards.length === 0" class="cap-card cap-empty">
          No spend data for this range.
        </article>
      </section>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import Button from 'primevue/button';
import Calendar from 'primevue/calendar';
import { Chart, LineController, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Filler } from 'chart.js';
import { api } from '../components/api';

Chart.register(LineController, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Filler);

type UsageRow = {
  provider: ProviderKey;
  connectionId: string;
  projectId?: string;
  bucketStart: string;
  model: string;
  inputTokens: number;
  inputCachedTokens: number;
  outputTokens: number;
  totalTokens: number;
  numModelRequests: number;
  costUsd: number;
};

type SupportedConnection = {
  id: string;
  provider: ProviderKey;
  config?: {
    openaiProject?: string;
  };
  createdAt: string;
};

type ConnectionsChangedDetail = {
  action?: 'loaded' | 'created' | 'deleted';
  connectionId?: string;
};

type MiniPoint = {
  date: string;
  value: number;
  left: number;
  height: number;
};

type HoverTooltip = {
  cardKey: string;
  label: string;
  dateLabel: string;
  valueLabel: string;
  color: string;
  left: number;
  top: number;
};

type MiniSeries = {
  connectionId: string;
  label: string;
  color: string;
  points: MiniPoint[];
};

type SparkBar = {
  index: number;
  x: number;
  width: number;
  height: number;
};

type ProviderKey = 'openai' | 'fake' | 'anthropic' | 'gemini' | 'mistral';

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

const monthlyBudgetUsd = 10;
const DASHBOARD_CACHE_KEY = 'tokensun.dashboard.cache.v1';
const activeTab = ref<'capabilities' | 'spend'>('capabilities');
const showRangePicker = ref(false);
const availableConnections = ref<SupportedConnection[]>([]);
const selectedConnectionIds = ref<string[]>([]);

const now = new Date();
const ago = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
const rangeSelection = ref<[Date, Date] | null>([ago, now]);

const filters = ref({
  start: ago.toISOString(),
  end: now.toISOString()
});

const allRows = ref<UsageRow[]>([]);
const message = ref('');
const refreshing = ref(false);
const querying = ref(false);
const hasConnections = ref(true);
const hoverTooltip = ref<HoverTooltip | null>(null);
const activeInfoConnectionId = ref<string | null>(null);

const presets = [
  { label: 'Week to date', value: 'wtd' },
  { label: 'Month to date', value: 'mtd' },
  { label: 'Last 7 days', value: '7d' },
  { label: 'Last 14 days', value: '14d' },
  { label: 'Last 30 days', value: '30d' }
];

const rangeLabel = computed(() => {
  const [start, end] = rangeSelection.value ?? [];
  if (!start || !end) return 'Select range';
  return `${fmtDate(start)} - ${fmtDate(end)}`;
});

const providerMeta: Record<ProviderKey, { label: string; color: string; fill: string }> = {
  openai: { label: 'OpenAI', color: '#5B4EE6', fill: 'rgba(91,78,230,0.18)' },
  fake: { label: 'Fake', color: '#2F80ED', fill: 'rgba(47,128,237,0.18)' },
  anthropic: { label: 'Anthropic', color: '#8B5CF6', fill: 'rgba(139,92,246,0.18)' },
  gemini: { label: 'Gemini', color: '#06B6D4', fill: 'rgba(6,182,212,0.18)' },
  mistral: { label: 'Mistral', color: '#F59E0B', fill: 'rgba(245,158,11,0.18)' }
};

const rows = computed(() => {
  if (selectedConnectionIds.value.length === 0) return [] as UsageRow[];
  const allowed = new Set(selectedConnectionIds.value);
  return allRows.value.filter((row) => allowed.has(row.connectionId));
});

const allSourceRows = computed(() => allRows.value);

const csvHref = computed(() => {
  const p = new URLSearchParams();
  p.set('granularity', 'hour');
  p.set('start', filters.value.start);
  p.set('end', filters.value.end);
  if (selectedConnectionIds.value.length === 1) {
    p.set('connectionId', selectedConnectionIds.value[0]);
  }
  return `/api/export.csv?${p.toString()}`;
});

const connectionById = computed(() => new Map(availableConnections.value.map((connection) => [connection.id, connection] as const)));

const totalSpend = computed(() => rows.value.reduce((sum, row) => sum + Number(row.costUsd || 0), 0));
const totalTokens = computed(() => allSourceRows.value.reduce((sum, row) => sum + Number(row.totalTokens || 0), 0));
const totalRequests = computed(() => allSourceRows.value.reduce((sum, row) => sum + Number(row.numModelRequests || 0), 0));
const budgetPercent = computed(() => Math.min(100, (totalSpend.value / monthlyBudgetUsd) * 100));
const tokenHoverIndex = ref<number | null>(null);
const requestHoverIndex = ref<number | null>(null);
const tokenTooltipPos = ref<{ left: number; top: number } | null>(null);
const requestTooltipPos = ref<{ left: number; top: number } | null>(null);
const sparkRange = ref<{ start: string; end: string }>({ start: filters.value.start, end: filters.value.end });

const dailyTrend = computed(() => {
  const start = new Date(sparkRange.value.start);
  const end = new Date(sparkRange.value.end);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start.getTime() > end.getTime()) {
    return { days: [] as string[], input: [] as number[], output: [] as number[], requests: [] as number[] };
  }

  const dayCursor = new Date(start);
  dayCursor.setUTCHours(0, 0, 0, 0);
  const last = new Date(end);
  last.setUTCHours(0, 0, 0, 0);

  const days: string[] = [];
  while (dayCursor.getTime() <= last.getTime()) {
    days.push(dayCursor.toISOString().slice(0, 10));
    dayCursor.setUTCDate(dayCursor.getUTCDate() + 1);
  }

  const indexByDay = new Map(days.map((day, index) => [day, index] as const));
  const input = new Array(days.length).fill(0);
  const output = new Array(days.length).fill(0);
  const requests = new Array(days.length).fill(0);

  for (const row of allSourceRows.value) {
    const day = row.bucketStart.slice(0, 10);
    const idx = indexByDay.get(day);
    if (idx === undefined) continue;
    input[idx] += Number(row.inputTokens || 0);
    output[idx] += Number(row.outputTokens || 0);
    requests[idx] += Number(row.numModelRequests || 0);
  }

  return { days, input, output, requests };
});

const tokenBars = computed(() => {
  const { input, output } = dailyTrend.value;
  const count = Math.max(input.length, output.length);
  if (count === 0) return [] as Array<SparkBar & { inputHeight: number; outputHeight: number; drawInputAfterOutput: boolean }>;

  const maxValue = Math.max(1, ...input, ...output);
  const width = 100 / count;
  return new Array(count).fill(0).map((_, index) => {
    const inVal = Number(input[index] || 0);
    const outVal = Number(output[index] || 0);
    const inputHeight = inVal > 0 ? Math.max(2.4, (inVal / maxValue) * 30) : 0;
    const outputHeight = outVal > 0 ? Math.max(2.4, (outVal / maxValue) * 30) : 0;
    return {
      index,
      x: index * width,
      width,
      height: 0,
      inputHeight,
      outputHeight,
      drawInputAfterOutput: inputHeight <= outputHeight
    };
  });
});

const requestBars = computed(() => {
  const values = dailyTrend.value.requests;
  const count = values.length;
  if (count === 0) return [] as SparkBar[];
  const maxValue = Math.max(1, ...values);
  const width = 100 / count;
  return values.map((value, index) => ({
    index,
    x: index * width,
    width,
    height: value > 0 ? Math.max(2.4, (Number(value) / maxValue) * 30) : 0
  }));
});
const tokenTooltipStyle = computed(() => {
  if (!tokenTooltipPos.value) return {};
  return {
    left: `${tokenTooltipPos.value.left}px`,
    top: `${tokenTooltipPos.value.top}px`
  };
});
const requestTooltipStyle = computed(() => {
  if (!requestTooltipPos.value) return {};
  return {
    left: `${requestTooltipPos.value.left}px`,
    top: `${requestTooltipPos.value.top}px`
  };
});

function persistDashboardCache() {
  const payload = {
    start: filters.value.start,
    end: filters.value.end,
    rows: allRows.value,
    activeTab: activeTab.value,
    selectedConnectionIds: selectedConnectionIds.value,
    sparkStart: sparkRange.value.start,
    sparkEnd: sparkRange.value.end
  };
  localStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify(payload));
}

function clearDashboardCache() {
  allRows.value = [];
  hoverTooltip.value = null;
  availableConnections.value = [];
  selectedConnectionIds.value = [];
  sparkRange.value = { start: filters.value.start, end: filters.value.end };
  activeInfoConnectionId.value = null;
  localStorage.removeItem(DASHBOARD_CACHE_KEY);
}

function restoreDashboardCache(): boolean {
  const raw = localStorage.getItem(DASHBOARD_CACHE_KEY);
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw) as {
      start?: string;
      end?: string;
      rows?: UsageRow[];
      activeTab?: 'capabilities' | 'spend';
      selectedConnectionIds?: string[];
      sparkStart?: string;
      sparkEnd?: string;
    };

    if (parsed.start && parsed.end) {
      filters.value.start = parsed.start;
      filters.value.end = parsed.end;
      rangeSelection.value = [new Date(parsed.start), new Date(parsed.end)];
    }
    if (Array.isArray(parsed.rows)) {
      allRows.value = parsed.rows;
    }
    if (parsed.activeTab === 'capabilities' || parsed.activeTab === 'spend') {
      activeTab.value = parsed.activeTab;
    }
    if (Array.isArray(parsed.selectedConnectionIds)) {
      selectedConnectionIds.value = parsed.selectedConnectionIds.filter((id): id is string => typeof id === 'string' && id.length > 0);
    }
    if (parsed.sparkStart && parsed.sparkEnd) {
      sparkRange.value = { start: parsed.sparkStart, end: parsed.sparkEnd };
    }
    return true;
  } catch {
    return false;
  }
}

function fmtDate(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  return `${mm}/${dd}/${yy}`;
}

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
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 3 }).format(value || 0);
}

function compact(value: number): string {
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(value || 0);
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
}

function sparkTooltipDate(day: string): string {
  if (!day) return '';
  const d = new Date(`${day}T00:00:00.000Z`);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function sparkX(index: number, length: number): number {
  if (length <= 1) return 50;
  return (index / (length - 1)) * 100;
}

function hoverIndex(event: MouseEvent, pointCount: number): number | null {
  if (pointCount === 0) return null;
  const target = event.currentTarget as HTMLElement | null;
  if (!target) return null;
  const rect = target.getBoundingClientRect();
  const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(rect.width, 1)));
  const idx = Math.round(ratio * Math.max(pointCount - 1, 0));
  return Math.max(0, Math.min(pointCount - 1, idx));
}

function clampXForTooltip(rawX: number, tooltipWidth: number): number {
  const sidePadding = 12;
  const half = tooltipWidth / 2;
  return Math.max(sidePadding + half, Math.min(window.innerWidth - sidePadding - half, rawX));
}

function onTokenSparkMove(event: MouseEvent) {
  const idx = hoverIndex(event, dailyTrend.value.days.length);
  tokenHoverIndex.value = idx;
  if (idx === null) {
    tokenTooltipPos.value = null;
    return;
  }
  const tooltipWidth = 280;
  const tooltipHeight = 132;
  tokenTooltipPos.value = {
    left: clampXForTooltip(event.clientX, tooltipWidth),
    top: Math.max(12, event.clientY - tooltipHeight - 14)
  };
}

function onRequestSparkMove(event: MouseEvent) {
  const idx = hoverIndex(event, dailyTrend.value.days.length);
  requestHoverIndex.value = idx;
  if (idx === null) {
    requestTooltipPos.value = null;
    return;
  }
  const tooltipWidth = 260;
  const tooltipHeight = 86;
  requestTooltipPos.value = {
    left: clampXForTooltip(event.clientX, tooltipWidth),
    top: Math.max(12, event.clientY - tooltipHeight - 14)
  };
}

function clearTokenSparkHover() {
  tokenHoverIndex.value = null;
  tokenTooltipPos.value = null;
}

function clearRequestSparkHover() {
  requestHoverIndex.value = null;
  requestTooltipPos.value = null;
}

function providerLabel(provider: ProviderKey): string {
  return providerMeta[provider]?.label ?? provider;
}

function providerColor(provider: ProviderKey): string {
  return providerMeta[provider]?.color ?? '#6b7280';
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function connectionColor(connectionId: string): string {
  const palette = ['#5B4EE6', '#2F80ED', '#8B5CF6', '#06B6D4', '#F59E0B', '#EC4899', '#6366F1', '#0EA5A4'];
  return palette[hashString(connectionId) % palette.length];
}

function connectionLabel(connection: SupportedConnection): string {
  const suffix = connection.config?.openaiProject?.trim() || connection.id.slice(0, 8);
  return `${providerLabel(connection.provider)} · ${suffix}`;
}

function connectionLabelById(connectionId: string): string {
  const connection = connectionById.value.get(connectionId);
  if (!connection) return connectionId.slice(0, 8);
  return connectionLabel(connection);
}

function connectionProjectId(connectionId: string): string {
  const connection = connectionById.value.get(connectionId);
  return connection?.config?.openaiProject?.trim() || 'not set';
}

function toggleConnectionInfo(connectionId: string) {
  activeInfoConnectionId.value = activeInfoConnectionId.value === connectionId ? null : connectionId;
}

function tooltipDateLabel(isoDay: string): string {
  const d = new Date(`${isoDay}T00:00:00.000Z`);
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} UTC`;
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

function toggleRangePicker() {
  showRangePicker.value = !showRangePicker.value;
}

function buildMiniPoints(byDay: Map<string, number>): MiniPoint[] {
  const entries = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return [];
  const max = Math.max(...entries.map(([, v]) => Number(v || 0)), 0);
  return entries.map(([date, raw], idx) => {
    const value = Number(raw || 0);
    const left = entries.length === 1 ? 50 : (idx / (entries.length - 1)) * 100;
    const ratio = max > 0 ? value / max : 0;
    return {
      date,
      value,
      left,
      height: Math.max(4, Math.round(ratio * 84))
    };
  });
}

function buildSeries(byConnection: Map<string, Map<string, number>>): MiniSeries[] {
  return selectedConnectionIds.value
    .filter((connectionId) => byConnection.has(connectionId))
    .map((connectionId) => {
      const byDay = byConnection.get(connectionId)!;
      return {
        connectionId,
        label: connectionLabelById(connectionId),
        color: connectionColor(connectionId),
        points: buildMiniPoints(byDay)
      };
    });
}

function stickStyle(point: MiniPoint, seriesIndex: number, seriesCount: number, color: string) {
  const spread = Math.min(12, Math.max(0, (seriesCount - 1) * 4));
  const step = seriesCount > 1 ? spread / (seriesCount - 1) : 0;
  const offset = -spread / 2 + seriesIndex * step;
  return {
    left: `calc(${point.left}% + ${offset}px)`,
    height: `${Math.max(8, point.height)}px`,
    backgroundColor: color,
    zIndex: String(10 + seriesIndex)
  };
}

function showCardTooltip(
  event: MouseEvent,
  cardKey: string,
  label: string,
  isoDay: string,
  value: number,
  format: 'currency' | 'number',
  color: string
) {
  const target = event.currentTarget as HTMLElement;
  const targetRect = target.getBoundingClientRect();
  const rawLeft = targetRect.left + targetRect.width / 2;
  const left = clampXForTooltip(rawLeft, 360);
  const top = Math.max(12, targetRect.top - 108);

  hoverTooltip.value = {
    cardKey,
    label,
    dateLabel: tooltipDateLabel(isoDay),
    valueLabel: format === 'currency' ? usd(value) : `${compact(value)} requests`,
    color,
    left,
    top
  };
}

function hideCardTooltip(cardKey: string) {
  if (hoverTooltip.value?.cardKey === cardKey) hoverTooltip.value = null;
}

function onRangeSelect() {
  const [start, end] = rangeSelection.value ?? [];
  if (!start || !end) return;
  filters.value.start = start.toISOString();
  filters.value.end = end.toISOString();
  persistDashboardCache();
}

function applyPreset(value: string) {
  const end = new Date();
  let start = new Date(end);
  if (value === 'wtd') {
    const day = end.getDay();
    const diff = day === 0 ? 6 : day - 1;
    start.setDate(end.getDate() - diff);
    start.setHours(0, 0, 0, 0);
  } else if (value === 'mtd') {
    start = new Date(end.getFullYear(), end.getMonth(), 1);
  } else if (value === '7d') {
    start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
  } else if (value === '14d') {
    start = new Date(end.getTime() - 14 * 24 * 60 * 60 * 1000);
  } else {
    start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
  rangeSelection.value = [start, end];
  filters.value.start = start.toISOString();
  filters.value.end = end.toISOString();
  persistDashboardCache();
}

function applyRangeOnly() {
  showRangePicker.value = false;
  message.value = 'Date range updated. Click Refresh to fetch data for this range.';
  persistDashboardCache();
}

async function loadConnectionContext() {
  try {
    const res = await api<{ connections: SupportedConnection[] }>('/api/connections');
    const supportedConnections = (Array.isArray(res.connections) ? res.connections : [])
      .filter((c) => c.provider === 'openai' || c.provider === 'fake')
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    hasConnections.value = supportedConnections.length > 0;
    if (!hasConnections.value) {
      clearDashboardCache();
      return;
    }
    availableConnections.value = supportedConnections;
    const availableIds = new Set(supportedConnections.map((c) => c.id));
    if (activeInfoConnectionId.value && !availableIds.has(activeInfoConnectionId.value)) {
      activeInfoConnectionId.value = null;
    }
    if (selectedConnectionIds.value.length === 0) {
      selectedConnectionIds.value = supportedConnections.map((c) => c.id);
    } else {
      selectedConnectionIds.value = selectedConnectionIds.value.filter((id) => availableIds.has(id));
      if (selectedConnectionIds.value.length === 0) {
        selectedConnectionIds.value = supportedConnections.map((c) => c.id);
      }
    }
    persistDashboardCache();
  } catch {
    hasConnections.value = false;
    availableConnections.value = [];
    selectedConnectionIds.value = [];
  }
}

function renderChart() {
  if (!canvasRef.value) return;
  const connectionIds = selectedConnectionIds.value;
  const groupedByConnection = new Map<string, Map<string, number>>();
  for (const row of rows.value) {
    const day = row.bucketStart.slice(0, 10);
    const connectionId = row.connectionId;
    if (!groupedByConnection.has(connectionId)) groupedByConnection.set(connectionId, new Map());
    const map = groupedByConnection.get(connectionId)!;
    map.set(day, (map.get(day) ?? 0) + Number(row.costUsd || 0));
  }
  const labels = [...new Set([...groupedByConnection.values()].flatMap((m) => [...m.keys()]))].sort();
  const datasets = connectionIds
    .filter((connectionId) => groupedByConnection.has(connectionId))
    .map((connectionId) => {
      const series = groupedByConnection.get(connectionId)!;
      const color = connectionColor(connectionId);
      return {
        label: `${connectionLabelById(connectionId)} spend`,
        data: labels.map((day) => series.get(day) ?? 0),
        borderColor: color,
        backgroundColor: `${color}2e`,
        fill: true,
        borderWidth: 2,
        pointRadius: 0,
        pointHitRadius: 18,
        pointHoverRadius: 5,
        tension: 0.35
      };
    });

  if (chart) chart.destroy();
  chart = new Chart(canvasRef.value, {
    type: 'line',
    data: {
      labels,
      datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'nearest',
        intersect: false
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#ffffff',
          titleColor: '#374151',
          bodyColor: '#111827',
          borderColor: '#d8dbe7',
          borderWidth: 1,
          cornerRadius: 10,
          padding: 10,
          displayColors: true,
          callbacks: {
            title(items) {
              const first = items[0];
              const raw = typeof first?.label === 'string' ? first.label : '';
              if (!raw) return '';
              return tooltipDateLabel(raw);
            },
            label(ctx) {
              const value = typeof ctx.parsed?.y === 'number' ? ctx.parsed.y : 0;
              return `${ctx.dataset.label}: ${usd(value)}`;
            }
          }
        }
      },
      scales: {
        x: { grid: { display: false } },
        y: { grid: { color: '#ececf4' } }
      }
    }
  });
}

async function queryUsage() {
  if (!hasConnections.value) return;
  if (querying.value) return;
  querying.value = true;
  try {
    const p = new URLSearchParams();
    p.set('granularity', 'hour');
    p.set('start', filters.value.start);
    p.set('end', filters.value.end);

    const res = await api<{ rows: UsageRow[] }>(`/api/usage/query?${p.toString()}`);
    allRows.value = res.rows.filter((row) => row.provider === 'openai' || row.provider === 'fake');
    sparkRange.value = { start: filters.value.start, end: filters.value.end };
    persistDashboardCache();
  } catch (err) {
    message.value = `Query failed: ${formatApiError(err)}`;
  } finally {
    querying.value = false;
  }
}

async function refreshUsage() {
  if (!hasConnections.value) {
    message.value = 'No connection yet. Go to Connections to create one.';
    return;
  }
  if (refreshing.value || querying.value) return;
  refreshing.value = true;
  message.value = 'Refreshing usage...';
  try {
    const res = await api<{ ok: boolean; rowsAdded: number; errors?: Array<{ message: string }> }>('/api/usage/refresh', {
      method: 'POST',
      body: JSON.stringify({
        start: filters.value.start,
        end: filters.value.end
      })
    });
    if (res.ok) {
      message.value = `Refresh complete (${res.rowsAdded} rows added).`;
    } else {
      const details = (res.errors ?? []).map((e) => e.message).filter(Boolean).join(' | ');
      message.value = `Refresh completed with issue(s): ${details || 'unknown_error'}`;
    }
    await queryUsage();
    persistDashboardCache();
  } catch (err) {
    message.value = `Refresh failed: ${formatApiError(err)}`;
  } finally {
    refreshing.value = false;
  }
}

const capabilityCards = computed(() => {
  const map = new Map<
    string,
    {
      key: string;
      title: string;
      secondaryLabel: string;
      requests: number;
      secondaryValue: number;
      byConnection: Map<string, Map<string, number>>;
    }
  >();

  const capabilityMeta: Record<CapabilityKey, { title: string; secondaryLabel: string }> = {
    responses: { title: 'Responses and Chat Completions', secondaryLabel: 'input tokens' },
    images: { title: 'Images', secondaryLabel: 'images' },
    webSearches: { title: 'Web Searches', secondaryLabel: 'searches' },
    fileSearches: { title: 'File Searches', secondaryLabel: 'searches' },
    moderation: { title: 'Moderation', secondaryLabel: 'input tokens' },
    embeddings: { title: 'Embeddings', secondaryLabel: 'input tokens' },
    audioSpeeches: { title: 'Audio Speeches', secondaryLabel: 'characters' },
    audioTranscriptions: { title: 'Audio Transcriptions', secondaryLabel: 'seconds' },
    vectorStores: { title: 'Vector Stores', secondaryLabel: 'bytes' },
    codeInterpreter: { title: 'Code Interpreter Sessions', secondaryLabel: 'sessions' }
  };

  for (const row of rows.value) {
    const capKey = capabilityOf(row.model);
    const key = capKey;
    if (!map.has(key)) {
      map.set(key, {
        key,
        title: capabilityMeta[capKey].title,
        secondaryLabel: capabilityMeta[capKey].secondaryLabel,
        requests: 0,
        secondaryValue: 0,
        byConnection: new Map()
      });
    }
    const item = map.get(key)!;
    item.requests += Number(row.numModelRequests || 0);
    item.secondaryValue += Number(row.inputTokens || 0);
    const day = row.bucketStart.slice(0, 10);
    if (!item.byConnection.has(row.connectionId)) {
      item.byConnection.set(row.connectionId, new Map());
    }
    const seriesByDay = item.byConnection.get(row.connectionId)!;
    seriesByDay.set(day, (seriesByDay.get(day) ?? 0) + Number(row.numModelRequests || 0));
  }

  return [...map.values()]
    .map((item) => ({ ...item, series: buildSeries(item.byConnection) }))
    .sort((a, b) => b.requests - a.requests);
});

const spendCards = computed(() => {
  const map = new Map<string, { title: string; total: number; peak: number; byConnection: Map<string, Map<string, number>> }>();

  for (const row of rows.value) {
    const totalToken = Math.max(1, Number(row.inputTokens || 0) + Number(row.inputCachedTokens || 0) + Number(row.outputTokens || 0));
    const day = row.bucketStart.slice(0, 10);
    const pieces = [
      { label: 'input', tokens: Number(row.inputTokens || 0) },
      { label: 'cached input', tokens: Number(row.inputCachedTokens || 0) },
      { label: 'output', tokens: Number(row.outputTokens || 0) }
    ];

    for (const piece of pieces) {
      if (piece.tokens <= 0) continue;
      const partialCost = (Number(row.costUsd || 0) * piece.tokens) / totalToken;
      const key = `${row.provider}|${row.model}|${piece.label}`;
      if (!map.has(key)) {
        map.set(key, {
          title: `${providerLabel(row.provider)} · ${row.model}, ${piece.label}`,
          total: 0,
          peak: 0,
          byConnection: new Map()
        });
      }
      const item = map.get(key)!;
      item.total += partialCost;
      if (!item.byConnection.has(row.connectionId)) {
        item.byConnection.set(row.connectionId, new Map());
      }
      const seriesByDay = item.byConnection.get(row.connectionId)!;
      const dayValue = (seriesByDay.get(day) ?? 0) + partialCost;
      seriesByDay.set(day, dayValue);
      item.peak = Math.max(item.peak, dayValue);
    }
  }

  return [...map.entries()]
    .map(([key, item]) => {
      return {
        key,
        title: item.title,
        total: Number(item.total.toFixed(6)),
        peak: Number(item.peak.toFixed(6)),
        series: buildSeries(item.byConnection)
      };
    })
    .sort((a, b) => b.total - a.total);
});

watch(rows, renderChart);
watch(activeTab, persistDashboardCache);
watch(selectedConnectionIds, () => {
  renderChart();
  persistDashboardCache();
});
async function onConnectionsChanged(event: Event) {
  const detail = event instanceof CustomEvent ? (event.detail as ConnectionsChangedDetail | undefined) : undefined;
  if (detail?.action === 'deleted') {
    clearDashboardCache();
    message.value = 'Connection deleted. Cached dashboard data cleared.';
  }
  await loadConnectionContext();
  if (!hasConnections.value) {
    clearDashboardCache();
    message.value = 'No connection yet. Go to Connections to create one.';
    return;
  }
  if (detail?.action !== 'deleted') {
    message.value = 'Connection context updated. Data remains cached until Refresh.';
  }
}

onMounted(async () => {
  const restored = restoreDashboardCache();
  if (restored) {
    message.value = 'Loaded cached dashboard data. Click Refresh to update usage.';
  }
  await loadConnectionContext();
  window.addEventListener('tokensun:connections-changed', onConnectionsChanged);

  if (!hasConnections.value) {
    clearDashboardCache();
  }
  if (!restored && hasConnections.value) {
    await queryUsage();
  }
  if (!restored && !hasConnections.value) {
    message.value = 'No connection yet. Go to Connections to create one.';
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('tokensun:connections-changed', onConnectionsChanged);
  persistDashboardCache();
});
</script>

<style scoped>
.usage-page {
  display: grid;
  gap: 14px;
  position: relative;
}

.usage-shell {
  display: grid;
  gap: 14px;
  position: relative;
}

.usage-shell-dimmed {
  pointer-events: none;
}

.usage-shell-dimmed::after {
  content: '';
  position: absolute;
  inset: 0;
  background: rgba(100, 116, 139, 0.48);
  border-radius: 14px;
  z-index: 12;
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

.provider-filters {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.provider-filter {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid #d8dbe7;
  border-radius: 999px;
  padding: 6px 10px;
  background: #fff;
  color: #374151;
  font-size: 12px;
  font-weight: 600;
  position: relative;
}

.provider-filter input {
  margin: 0;
}

.provider-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
}

.provider-info-btn {
  width: 16px;
  height: 16px;
  border: 1px solid #9ca3af;
  border-radius: 50%;
  background: #fff;
  color: #6b7280;
  font-size: 11px;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
}

.provider-info-popover {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  background: #111827;
  color: #f9fafb;
  font-size: 11px;
  font-weight: 500;
  padding: 6px 8px;
  border-radius: 8px;
  white-space: nowrap;
  z-index: 20;
}

.range-trigger {
  border: 2px solid #0d6fd6;
  background: #fff;
  border-radius: 999px;
  padding: 10px 16px;
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  cursor: pointer;
}

.range-icon {
  font-size: 14px;
}

.range-popover {
  position: absolute;
  top: 76px;
  right: 0;
  z-index: 40;
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  width: min(920px, calc(100vw - 40px));
  background: #fff;
  border: 1px solid #dfe4ef;
  border-radius: 14px;
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.16);
  overflow: hidden;
}

.range-presets {
  border-right: 1px solid #eceef6;
  padding: 12px;
  display: grid;
  gap: 8px;
}

.preset-btn {
  text-align: left;
  border: 0;
  background: transparent;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
}

.preset-btn:hover {
  background: #f4f6fc;
}

.range-calendar {
  padding: 8px;
}

.range-calendar :deep(.p-calendar) {
  width: 100%;
}

.range-footer {
  display: flex;
  justify-content: flex-end;
  padding: 8px 4px 2px;
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

.connect-callout {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 16px;
  border: 1px solid #c4b5fd;
  background: linear-gradient(90deg, #faf5ff, #f5f3ff);
  border-radius: 12px;
  padding: 14px 16px;
}

.connect-callout h2 {
  margin: 0;
  font-size: 18px;
}

.connect-callout p {
  margin: 4px 0 0;
  color: #5b6074;
  font-size: 13px;
}

.usage-main {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: auto 1fr;
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
  border-bottom: 1px solid #eceef6;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.usage-side-card {
  padding: 16px;
  border-right: 1px solid #eceef6;
}

.usage-side-card:last-child {
  border-right: 0;
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

.usage-spark {
  margin-top: 16px;
  position: relative;
  height: 56px;
}

.usage-spark svg {
  width: 100%;
  height: 100%;
  overflow: visible;
}

.usage-spark-bar {
  shape-rendering: crispEdges;
}

.usage-spark-bar-input {
  fill: #f59e0b;
}

.usage-spark-bar-output {
  fill: #ec4899;
}

.usage-spark-bar-requests {
  fill: #6366f1;
}

.usage-spark-hover-line {
  stroke: #e5e7eb;
  stroke-width: 0.8;
}

.usage-spark-tooltip {
  position: fixed;
  width: min(280px, 92vw);
  background: rgba(17, 24, 39, 0.94);
  color: #f8fafc;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  padding: 10px;
  z-index: 60;
  pointer-events: none;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.35);
}

.usage-spark-tooltip-date {
  margin: 0;
  color: #cbd5e1;
  font-size: 12px;
}

.usage-spark-tooltip-total {
  margin: 6px 0 8px;
  font-weight: 700;
  font-size: 14px;
}

.usage-spark-tooltip-row {
  display: grid;
  grid-template-columns: 10px 1fr auto;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.usage-spark-dot {
  width: 8px;
  height: 8px;
  border-radius: 2px;
}

.usage-spark-dot-input {
  background: #f59e0b;
}

.usage-spark-dot-output {
  background: #ec4899;
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
  position: relative;
  border: 1px solid #e5e7ef;
  border-radius: 14px;
  background: #fff;
  padding: 16px;
  min-height: 220px;
  display: grid;
  grid-template-rows: auto auto auto 1fr auto;
  overflow: hidden;
}

.cap-empty {
  font-size: 18px;
  color: #6b7280;
}

.cap-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.cap-head h3 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  line-height: 1.25;
  max-width: calc(100% - 24px);
  overflow-wrap: anywhere;
}

.cap-head span {
  color: #5f6477;
  font-size: 24px;
  line-height: 1;
}

.cap-meta {
  margin: 8px 0 0;
  display: flex;
  gap: 14px;
  color: #666c82;
  font-size: 16px;
  flex-wrap: wrap;
}

.cap-info {
  display: grid;
  gap: 4px;
}

.cap-series {
  margin-top: 6px;
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  color: #5f657d;
  font-size: 12px;
}

.cap-series-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.cap-strong {
  margin: 6px 0 0;
  color: #4b5563;
  font-size: 30px;
}

.cap-chart {
  position: relative;
  height: 108px;
  margin-top: 8px;
  display: flex;
  align-items: flex-end;
  overflow: hidden;
  padding-bottom: 1px;
}

.cap-line {
  width: 100%;
  border-bottom: 3px dashed #ccd2e4;
}

.cap-stick {
  position: absolute;
  bottom: 1px;
  width: 4px;
  border-radius: 2px;
  background: #6d4aff;
  transform: translateX(-50%);
}

.cap-stick-hit {
  border: 0;
  padding: 0;
  cursor: pointer;
}

.cap-foot {
  display: flex;
  justify-content: space-between;
  color: #6f758a;
  font-size: 16px;
}

.cap-tooltip {
  position: fixed;
  background: #fff;
  border: 1px solid #d8dbe7;
  border-radius: 10px;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.14);
  padding: 10px 12px;
  width: min(92%, 360px);
  z-index: 60;
  pointer-events: none;
}

.cap-tooltip-date {
  margin: 0 0 8px;
  font-size: 13px;
  color: #374151;
}

.cap-tooltip-row {
  display: grid;
  grid-template-columns: 10px 1fr auto;
  align-items: center;
  gap: 8px;
  border-top: 1px solid #eceff6;
  padding-top: 8px;
}

.cap-tooltip-dot {
  width: 8px;
  height: 8px;
  border-radius: 2px;
  background: #6d4aff;
}

.cap-tooltip-name {
  color: #374151;
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cap-tooltip-val {
  color: #111827;
  font-weight: 600;
  font-size: 13px;
}

@media (max-width: 1280px) {
  .usage-side {
    border-bottom: 1px solid #eceef6;
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

  .usage-side {
    grid-template-columns: 1fr;
    grid-template-rows: repeat(3, minmax(0, 1fr));
  }

  .usage-side-card {
    border-right: 0;
    border-bottom: 1px solid #eceef6;
  }

  .usage-side-card:last-child {
    border-bottom: 0;
  }

  .usage-spend h2,
  .usage-side-value,
  .cap-strong {
    font-size: 24px;
  }

  .cap-meta,
  .usage-side-label,
  .usage-spend p {
    font-size: 14px;
  }

  .range-popover {
    position: static;
    grid-template-columns: 1fr;
  }

  .range-presets {
    border-right: 0;
    border-bottom: 1px solid #eceef6;
  }
}
</style>
