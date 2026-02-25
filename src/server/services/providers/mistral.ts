import type { ConnectionRecord } from '../../types/models.js';

export async function testMistral(connection: ConnectionRecord): Promise<void> {
  const base = connection.config.baseUrl ?? 'https://api.mistral.ai';
  const res = await fetch(`${base}/v1/models`, {
    headers: {
      authorization: `Bearer ${connection.secrets.apiKey}`
    }
  });
  if (!res.ok) throw new Error(`mistral_test_failed:${res.status}`);
}

export async function fetchMistralUsage(): Promise<
  Array<{ ts: string; model: string; inputTokens: number; outputTokens: number; totalTokens: number }>
> {
  return [];
}
