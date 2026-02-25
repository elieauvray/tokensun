import type { UsageBucket } from '../types/models.js';

function truncateToGranularity(date: Date, granularity: UsageBucket['bucketGranularity']): Date {
  const d = new Date(date);
  if (granularity === 'hour') {
    d.setUTCMinutes(0, 0, 0);
    return d;
  }
  if (granularity === 'week') {
    const day = d.getUTCDay();
    const shift = day === 0 ? -6 : 1 - day;
    d.setUTCDate(d.getUTCDate() + shift);
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }
  if (granularity === 'month') {
    d.setUTCDate(1);
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }
  d.setUTCMonth(0, 1);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export function toBucketStart(iso: string, granularity: UsageBucket['bucketGranularity']): string {
  return truncateToGranularity(new Date(iso), granularity).toISOString();
}

function keyOf(row: UsageBucket): string {
  return [
    row.connectionId,
    row.provider,
    row.model,
    row.bucketStart,
    row.bucketGranularity,
    row.costMode
  ].join('|');
}

export function upsertUsageBuckets(existing: UsageBucket[], incoming: UsageBucket[]): UsageBucket[] {
  const map = new Map<string, UsageBucket>();
  for (const row of existing) {
    map.set(keyOf(row), row);
  }

  for (const row of incoming) {
    const key = keyOf(row);
    const previous = map.get(key);
    if (!previous) {
      map.set(key, row);
      continue;
    }

    map.set(key, {
      ...previous,
      inputTokens: previous.inputTokens + row.inputTokens,
      outputTokens: previous.outputTokens + row.outputTokens,
      totalTokens: previous.totalTokens + row.totalTokens,
      costUsd: Number((previous.costUsd + row.costUsd).toFixed(8))
    });
  }

  return [...map.values()].sort((a, b) => a.bucketStart.localeCompare(b.bucketStart));
}

export function queryUsage(
  rows: UsageBucket[],
  filters: {
    granularity: UsageBucket['bucketGranularity'];
    start: string;
    end: string;
    provider?: string;
    model?: string;
    connectionId?: string;
  }
): UsageBucket[] {
  const start = new Date(filters.start).getTime();
  const end = new Date(filters.end).getTime();

  const inRange = rows.filter((row) => {
    const ts = new Date(row.bucketStart).getTime();
    if (Number.isNaN(ts)) return false;
    if (row.bucketGranularity !== filters.granularity) return false;
    if (ts < start || ts > end) return false;
    if (filters.provider && row.provider !== filters.provider) return false;
    if (filters.model && row.model !== filters.model) return false;
    if (filters.connectionId && row.connectionId !== filters.connectionId) return false;
    return true;
  });

  return inRange;
}
