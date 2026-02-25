import type { ConnectionRecord } from '../../types/models.js';

type UsagePoint = {
  ts: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd?: number;
};

async function requestOpenAI(
  connection: ConnectionRecord,
  endpoint: string,
  query: URLSearchParams
): Promise<any> {
  const base = connection.config.baseUrl ?? 'https://api.openai.com';
  const res = await fetch(`${base}${endpoint}?${query.toString()}`, {
    headers: {
      authorization: `Bearer ${connection.secrets.apiKey}`,
      ...(connection.config.openaiOrg ? { 'OpenAI-Organization': connection.config.openaiOrg } : {}),
      ...(connection.config.openaiProject ? { 'OpenAI-Project': connection.config.openaiProject } : {})
    }
  });

  if (!res.ok) {
    throw new Error(`openai_api_error:${res.status}`);
  }

  return res.json();
}

export async function testOpenAI(connection: ConnectionRecord): Promise<void> {
  const base = connection.config.baseUrl ?? 'https://api.openai.com';
  const res = await fetch(`${base}/v1/models`, {
    headers: {
      authorization: `Bearer ${connection.secrets.apiKey}`
    }
  });
  if (!res.ok) throw new Error(`openai_test_failed:${res.status}`);
}

export async function fetchOpenAIUsage(
  connection: ConnectionRecord,
  start: string,
  end: string
): Promise<UsagePoint[]> {
  const usage = await requestOpenAI(
    connection,
    '/v1/organization/usage/completions',
    new URLSearchParams({ start_time: start, end_time: end })
  );

  let costs: any = { data: [] };
  try {
    costs = await requestOpenAI(
      connection,
      '/v1/organization/costs',
      new URLSearchParams({ start_time: start, end_time: end })
    );
  } catch {
    costs = { data: [] };
  }

  const byTsModel = new Map<string, number>();
  for (const c of costs?.data ?? []) {
    const key = `${c.timestamp}|${c.model ?? 'unknown'}`;
    byTsModel.set(key, Number(c.cost_usd ?? 0));
  }

  return (usage?.data ?? []).map((row: any) => {
    const model = row.model ?? 'unknown';
    const ts = row.timestamp ?? row.start_time;
    const key = `${ts}|${model}`;
    return {
      ts,
      model,
      inputTokens: Number(row.input_tokens ?? 0),
      outputTokens: Number(row.output_tokens ?? 0),
      totalTokens: Number(row.total_tokens ?? 0),
      costUsd: byTsModel.get(key)
    };
  });
}
