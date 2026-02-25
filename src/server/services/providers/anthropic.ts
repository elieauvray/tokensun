import type { ConnectionRecord } from '../../types/models.js';

type UsagePoint = {
  ts: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd?: number;
};

async function requestAnthropic(
  connection: ConnectionRecord,
  endpoint: string,
  body: Record<string, unknown>
): Promise<any> {
  const base = connection.config.baseUrl ?? 'https://api.anthropic.com';
  const version = connection.config.anthropicVersion ?? '2023-06-01';
  const res = await fetch(`${base}${endpoint}`, {
    method: 'POST',
    headers: {
      'x-api-key': connection.secrets.apiKey,
      'anthropic-version': version,
      'content-type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    throw new Error(`anthropic_api_error:${res.status}`);
  }

  return res.json();
}

export async function testAnthropic(connection: ConnectionRecord): Promise<void> {
  const base = connection.config.baseUrl ?? 'https://api.anthropic.com';
  const version = connection.config.anthropicVersion ?? '2023-06-01';
  const res = await fetch(`${base}/v1/models`, {
    headers: {
      'x-api-key': connection.secrets.apiKey,
      'anthropic-version': version
    }
  });
  if (!res.ok) throw new Error(`anthropic_test_failed:${res.status}`);
}

export async function fetchAnthropicUsage(
  connection: ConnectionRecord,
  start: string,
  end: string
): Promise<UsagePoint[]> {
  const usage = await requestAnthropic(connection, '/v1/organizations/usage_report/messages', {
    start_time: start,
    end_time: end
  });

  let costs: any = { data: [] };
  try {
    costs = await requestAnthropic(connection, '/v1/organizations/cost_report/messages', {
      start_time: start,
      end_time: end
    });
  } catch {
    costs = { data: [] };
  }

  const costMap = new Map<string, number>();
  for (const row of costs?.data ?? []) {
    costMap.set(`${row.timestamp}|${row.model}`, Number(row.cost_usd ?? 0));
  }

  return (usage?.data ?? []).map((row: any) => {
    const model = row.model ?? 'unknown';
    const ts = row.timestamp ?? row.start_time;
    const input = Number(row.input_tokens ?? 0);
    const output = Number(row.output_tokens ?? 0);
    return {
      ts,
      model,
      inputTokens: input,
      outputTokens: output,
      totalTokens: input + output,
      costUsd: costMap.get(`${ts}|${model}`)
    };
  });
}
