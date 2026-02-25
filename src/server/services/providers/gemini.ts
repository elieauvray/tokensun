import type { ConnectionRecord } from '../../types/models.js';

export async function testGemini(connection: ConnectionRecord): Promise<void> {
  const base = connection.config.baseUrl ?? 'https://generativelanguage.googleapis.com';
  const res = await fetch(`${base}/v1beta/models?key=${encodeURIComponent(connection.secrets.apiKey)}`);
  if (!res.ok) throw new Error(`gemini_test_failed:${res.status}`);
}

export async function fetchGeminiUsage(): Promise<
  Array<{ ts: string; model: string; inputTokens: number; outputTokens: number; totalTokens: number }>
> {
  return [];
}
