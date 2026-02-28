import type { ConnectionRecord } from '../../types/models.js';

export type FakeUsagePoint = {
  ts: string;
  model: string;
  projectId?: string;
  userId?: string;
  apiKeyId?: string;
  batch?: boolean;
  inputTokens: number;
  inputCachedTokens: number;
  inputAudioTokens: number;
  outputTokens: number;
  outputAudioTokens: number;
  totalTokens: number;
  numModelRequests: number;
  costUsd: number;
};

const SIX_MONTHS_MS = 183 * 24 * 60 * 60 * 1000;

type FakeModelProfile = {
  model: string;
  dailyRequestsBase: number;
  inputPerRequest: number;
  outputPerRequest: number;
  cacheRatio: number;
  usdPerReq: number;
};

const PROFILES: FakeModelProfile[] = [
  { model: 'gpt-4o-2024-08-06', dailyRequestsBase: 18, inputPerRequest: 720, outputPerRequest: 290, cacheRatio: 0.22, usdPerReq: 0.0024 },
  { model: 'gpt-4o-mini-2024-07-18', dailyRequestsBase: 44, inputPerRequest: 310, outputPerRequest: 145, cacheRatio: 0.31, usdPerReq: 0.00054 },
  { model: 'text-embedding-3-small', dailyRequestsBase: 28, inputPerRequest: 980, outputPerRequest: 0, cacheRatio: 0, usdPerReq: 0.00008 },
  { model: 'omni-moderation-latest', dailyRequestsBase: 12, inputPerRequest: 460, outputPerRequest: 0, cacheRatio: 0, usdPerReq: 0.00003 }
];

function dayStartUtc(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function hashConnectionId(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function daysBetween(start: Date, end: Date): Date[] {
  const out: Date[] = [];
  const cursor = dayStartUtc(start);
  const last = dayStartUtc(end);
  while (cursor.getTime() <= last.getTime()) {
    out.push(new Date(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

export function testFake(_connection: ConnectionRecord): Record<string, unknown> {
  return {
    checkedAt: new Date().toISOString(),
    endpoint: 'fake://local/synthetic-usage',
    bucketCount: 183,
    hasNextPage: false
  };
}

export function fetchFakeUsage(connection: ConnectionRecord, start: string, end: string): FakeUsagePoint[] {
  const now = new Date();
  const maxEnd = dayStartUtc(now);
  const minStart = dayStartUtc(new Date(maxEnd.getTime() - SIX_MONTHS_MS));

  const requestedStart = dayStartUtc(new Date(start));
  const requestedEnd = dayStartUtc(new Date(end));
  const from = requestedStart.getTime() < minStart.getTime() ? minStart : requestedStart;
  const to = requestedEnd.getTime() > maxEnd.getTime() ? maxEnd : requestedEnd;
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from.getTime() > to.getTime()) return [];

  const projectId = connection.config.openaiProject?.trim() || 'project_fake_demo';
  const connectionSalt = hashConnectionId(connection.id);
  const days = daysBetween(from, to);
  const points: FakeUsagePoint[] = [];

  days.forEach((day, dayIndex) => {
    const weekday = day.getUTCDay();
    const weekdayFactor = weekday === 0 || weekday === 6 ? 0.72 : 1;
    PROFILES.forEach((profile, modelIndex) => {
      const seed = day.getTime() ^ (modelIndex * 2654435761) ^ connectionSalt ^ 0x9e3779b9;
      const rand = mulberry32(seed);
      const jitter = 0.82 + rand() * 0.44;
      const trend = 0.85 + dayIndex / Math.max(days.length * 1.6, 1);
      const requests = Math.max(0, Math.round(profile.dailyRequestsBase * weekdayFactor * trend * jitter));
      if (requests === 0) return;

      const inputTokens = Math.round(requests * profile.inputPerRequest * (0.9 + rand() * 0.2));
      const cachedTokens = Math.round(inputTokens * profile.cacheRatio * (0.85 + rand() * 0.3));
      const outputTokens = Math.round(requests * profile.outputPerRequest * (0.88 + rand() * 0.24));
      const totalTokens = inputTokens + cachedTokens + outputTokens;
      const costUsd = Number((requests * profile.usdPerReq * (0.9 + rand() * 0.2)).toFixed(8));

      points.push({
        ts: day.toISOString(),
        model: profile.model,
        projectId,
        userId: `user_fake_${(modelIndex % 3) + 1}`,
        apiKeyId: 'key_fake_primary',
        batch: modelIndex === 2 ? true : false,
        inputTokens,
        inputCachedTokens: cachedTokens,
        inputAudioTokens: 0,
        outputTokens,
        outputAudioTokens: 0,
        totalTokens,
        numModelRequests: requests,
        costUsd
      });
    });
  });

  return points;
}
