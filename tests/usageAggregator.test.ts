import { describe, expect, it } from 'vitest';
import { upsertUsageBuckets } from '../src/server/services/usageAggregator.js';

describe('usage bucket upsert uniqueness', () => {
  it('replaces rows by unique key (idempotent refresh)', () => {
    const rows: any[] = [
      {
        connectionId: 'a',
        provider: 'openai',
        model: 'gpt',
        bucketStart: '2025-01-01T00:00:00.000Z',
        bucketGranularity: 'hour',
        inputTokens: 1,
        outputTokens: 2,
        totalTokens: 3,
        costUsd: 1,
        costMode: 'estimated'
      }
    ];

    const incoming: any[] = [
      {
        connectionId: 'a',
        provider: 'openai',
        model: 'gpt',
        bucketStart: '2025-01-01T00:00:00.000Z',
        bucketGranularity: 'hour',
        inputTokens: 4,
        outputTokens: 5,
        totalTokens: 9,
        costUsd: 2,
        costMode: 'estimated'
      }
    ];

    const merged = upsertUsageBuckets(rows, incoming);
    expect(merged).toHaveLength(1);
    expect(merged[0].totalTokens).toBe(9);
    expect(merged[0].costUsd).toBe(2);
  });
});
