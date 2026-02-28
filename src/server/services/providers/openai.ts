import type { ConnectionRecord } from '../../types/models.js';

type UsagePoint = {
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
  costUsd?: number;
};

const OPENAI_TIMEOUT_MS = Number(process.env.TOKENSUN_OPENAI_TIMEOUT_MS ?? 20000);

export type OpenAITestResult = {
  checkedAt: string;
  endpoint: string;
  bucketCount: number;
  hasNextPage: boolean;
};

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('openai_timeout');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

async function readOpenAIErrorDetail(res: Response): Promise<string> {
  const raw = await res.text();
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string } };
    return parsed.error?.message?.trim() ?? '';
  } catch {
    return raw.trim().slice(0, 200);
  }
}

async function requestOpenAI(
  connection: ConnectionRecord,
  endpoint: string,
  query: URLSearchParams
): Promise<any> {
  const base = connection.config.baseUrl ?? 'https://api.openai.com';
  const res = await fetchWithTimeout(`${base}${endpoint}?${query.toString()}`, {
    headers: {
      authorization: `Bearer ${connection.secrets.apiKey}`,
      ...(connection.config.openaiOrg ? { 'OpenAI-Organization': connection.config.openaiOrg } : {}),
      ...(connection.config.openaiProject ? { 'OpenAI-Project': connection.config.openaiProject } : {})
    }
  });

  if (!res.ok) {
    const detail = await readOpenAIErrorDetail(res);
    throw new Error(`openai_api_error:${res.status}${detail ? `:${detail}` : ''}`);
  }

  return res.json();
}

async function requestOpenAIPaginated(
  connection: ConnectionRecord,
  endpoint: string,
  baseQuery: URLSearchParams
): Promise<any[]> {
  const all: any[] = [];
  let cursor: string | undefined;

  while (true) {
    const query = new URLSearchParams(baseQuery.toString());
    if (cursor) query.set('page', cursor);
    const payload = await requestOpenAI(connection, endpoint, query);
    const data = Array.isArray(payload?.data) ? payload.data : [];
    all.push(...data);
    const next = payload?.next_page;
    if (typeof next !== 'string' || !next) break;
    cursor = next;
  }

  return all;
}

function toUnixSeconds(iso: string): string {
  return String(Math.floor(new Date(iso).getTime() / 1000));
}

export async function testOpenAI(connection: ConnectionRecord): Promise<OpenAITestResult> {
  const base = connection.config.baseUrl ?? 'https://api.openai.com';
  const nowSec = Math.floor(Date.now() / 1000);
  const startSec = nowSec - 24 * 60 * 60;
  const endpoint = `/v1/organization/usage/completions?start_time=${startSec}&end_time=${nowSec}&bucket_width=1d&limit=1`;
  const res = await fetchWithTimeout(`${base}${endpoint}`, {
    headers: {
      authorization: `Bearer ${connection.secrets.apiKey}`,
      ...(connection.config.openaiOrg ? { 'OpenAI-Organization': connection.config.openaiOrg } : {}),
      ...(connection.config.openaiProject ? { 'OpenAI-Project': connection.config.openaiProject } : {})
    }
  });
  if (!res.ok) {
    const detail = await readOpenAIErrorDetail(res);
    const normalizedDetail = detail || (res.status === 403 ? 'forbidden_check_admin_key_or_org_permissions' : '');
    throw new Error(`openai_test_failed:${res.status}${normalizedDetail ? `:${normalizedDetail}` : ''}`);
  }

  const payload = (await res.json()) as { data?: unknown[]; next_page?: string | null };
  const data = Array.isArray(payload.data) ? payload.data : [];
  const hasNextPage = typeof payload.next_page === 'string' && payload.next_page.length > 0;

  return {
    checkedAt: new Date().toISOString(),
    endpoint: '/v1/organization/usage/completions',
    bucketCount: data.length,
    hasNextPage
  };
}

export async function fetchOpenAIUsage(
  connection: ConnectionRecord,
  start: string,
  end: string
): Promise<UsagePoint[]> {
  const startSec = toUnixSeconds(start);
  const endSec = toUnixSeconds(end);

  const usageBuckets = await requestOpenAIPaginated(
    connection,
    '/v1/organization/usage/completions',
    new URLSearchParams({ start_time: startSec, end_time: endSec, bucket_width: '1d' })
  );

  let costBuckets: any[] = [];
  try {
    costBuckets = await requestOpenAIPaginated(
      connection,
      '/v1/organization/costs',
      new URLSearchParams({ start_time: startSec, end_time: endSec, bucket_width: '1d' })
    );
  } catch {
    costBuckets = [];
  }

  const costByBucketProject = new Map<string, number>();
  for (const bucket of costBuckets) {
    const bucketStart = Number(bucket?.start_time ?? 0);
    for (const row of bucket?.results ?? []) {
      const projectId = row?.project_id ?? 'unknown';
      const amount = Number(row?.amount?.value ?? 0);
      const key = `${bucketStart}|${projectId}`;
      costByBucketProject.set(key, (costByBucketProject.get(key) ?? 0) + amount);
    }
  }

  const usagePoints: Array<UsagePoint & { costKey: string }> = [];
  for (const bucket of usageBuckets) {
    const bucketStart = Number(bucket?.start_time ?? 0);
    const ts = new Date(bucketStart * 1000).toISOString();
    for (const row of bucket?.results ?? []) {
      const projectId = row?.project_id ?? 'unknown';
      usagePoints.push({
        ts,
        model: row?.model ?? 'unknown',
        projectId,
        userId: row?.user_id ?? undefined,
        apiKeyId: row?.api_key_id ?? undefined,
        batch: typeof row?.batch === 'boolean' ? row.batch : undefined,
        inputTokens: Number(row?.input_tokens ?? 0),
        inputCachedTokens: Number(row?.input_cached_tokens ?? 0),
        inputAudioTokens: Number(row?.input_audio_tokens ?? 0),
        outputTokens: Number(row?.output_tokens ?? 0),
        outputAudioTokens: Number(row?.output_audio_tokens ?? 0),
        totalTokens: Number(row?.total_tokens ?? 0),
        numModelRequests: Number(row?.num_model_requests ?? 0),
        costKey: `${bucketStart}|${projectId}`
      });
    }
  }

  const totalTokensByCostKey = new Map<string, number>();
  const rowCountByCostKey = new Map<string, number>();
  for (const point of usagePoints) {
    totalTokensByCostKey.set(point.costKey, (totalTokensByCostKey.get(point.costKey) ?? 0) + point.totalTokens);
    rowCountByCostKey.set(point.costKey, (rowCountByCostKey.get(point.costKey) ?? 0) + 1);
  }

  return usagePoints.map((point) => {
    const totalCost = costByBucketProject.get(point.costKey);
    const totalTokensForKey = totalTokensByCostKey.get(point.costKey) ?? 0;
    const distributedCost =
      typeof totalCost === 'number'
        ? totalTokensForKey > 0
          ? (totalCost * point.totalTokens) / totalTokensForKey
          : totalCost / Math.max(rowCountByCostKey.get(point.costKey) ?? 1, 1)
        : undefined;

    return {
      ts: point.ts,
      model: point.model,
      projectId: point.projectId,
      userId: point.userId,
      apiKeyId: point.apiKeyId,
      batch: point.batch,
      inputTokens: point.inputTokens,
      inputCachedTokens: point.inputCachedTokens,
      inputAudioTokens: point.inputAudioTokens,
      outputTokens: point.outputTokens,
      outputAudioTokens: point.outputAudioTokens,
      totalTokens: point.totalTokens,
      numModelRequests: point.numModelRequests,
      costUsd: distributedCost
    };
  });
}
