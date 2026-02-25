import type { ConnectionRecord, PricingTable } from '../types/models.js';

export const defaultPricingByProvider: Record<string, PricingTable> = {
  openai: {
    'gpt-4o-mini': { inputUsdPer1k: 0.00015, outputUsdPer1k: 0.0006 },
    'gpt-4.1-mini': { inputUsdPer1k: 0.0004, outputUsdPer1k: 0.0016 },
    default: { inputUsdPer1k: 0.001, outputUsdPer1k: 0.002 }
  },
  anthropic: {
    'claude-3-5-sonnet': { inputUsdPer1k: 0.003, outputUsdPer1k: 0.015 },
    default: { inputUsdPer1k: 0.004, outputUsdPer1k: 0.02 }
  },
  gemini: {
    default: { inputUsdPer1k: 0.001, outputUsdPer1k: 0.002 }
  },
  mistral: {
    default: { inputUsdPer1k: 0.001, outputUsdPer1k: 0.003 }
  }
};

export function computeCostUsd(
  connection: ConnectionRecord,
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const table = connection.config.pricing ?? defaultPricingByProvider[connection.provider] ?? defaultPricingByProvider.openai;
  const key = table[model] ? model : 'default';
  const prices = table[key] ?? { inputUsdPer1k: 0, outputUsdPer1k: 0 };

  const cost = (inputTokens / 1000) * prices.inputUsdPer1k + (outputTokens / 1000) * prices.outputUsdPer1k;
  return Number(cost.toFixed(8));
}
