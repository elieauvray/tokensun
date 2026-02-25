import { describe, expect, it } from 'vitest';
import { computeCostUsd } from '../src/server/services/pricing.js';

describe('pricing', () => {
  it('computes with model pricing', () => {
    const connection: any = {
      provider: 'openai',
      config: {
        pricing: {
          'gpt-x': { inputUsdPer1k: 1, outputUsdPer1k: 2 },
          default: { inputUsdPer1k: 0.1, outputUsdPer1k: 0.2 }
        }
      }
    };

    const cost = computeCostUsd(connection, 'gpt-x', 1000, 2000);
    expect(cost).toBe(5);
  });

  it('falls back to default model', () => {
    const connection: any = {
      provider: 'gemini',
      config: {
        pricing: {
          default: { inputUsdPer1k: 0.5, outputUsdPer1k: 0.5 }
        }
      }
    };

    const cost = computeCostUsd(connection, 'missing', 1000, 1000);
    expect(cost).toBe(1);
  });
});
