import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { fetchOpenAIUsage } from '../services/providers/openai.js';
import { fetchAnthropicUsage } from '../services/providers/anthropic.js';
import { fetchGeminiUsage } from '../services/providers/gemini.js';
import { fetchMistralUsage } from '../services/providers/mistral.js';
import { computeCostUsd } from '../services/pricing.js';
import { queryUsage, toBucketStart, upsertUsageBuckets } from '../services/usageAggregator.js';
import type { ConnectionRecord, UsageBucket } from '../types/models.js';

const refreshSchema = z.object({
  connectionId: z.string().uuid().optional(),
  start: z.string().datetime(),
  end: z.string().datetime()
});

const querySchema = z.object({
  granularity: z.enum(['hour', 'week', 'month', 'year']),
  start: z.string().datetime(),
  end: z.string().datetime(),
  provider: z.string().optional(),
  model: z.string().optional(),
  connectionId: z.string().uuid().optional()
});

type Point = {
  ts: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd?: number;
};

async function loadPoints(connection: ConnectionRecord, start: string, end: string): Promise<Point[]> {
  if (connection.provider === 'openai') return fetchOpenAIUsage(connection, start, end);
  if (connection.provider === 'anthropic') return fetchAnthropicUsage(connection, start, end);
  if (connection.provider === 'gemini') return fetchGeminiUsage();
  return fetchMistralUsage();
}

const usageRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/usage/refresh', async (req, reply) => {
    const body = refreshSchema.parse(req.body);

    const selected = body.connectionId
      ? req.session.connections.filter((c) => c.id === body.connectionId)
      : req.session.connections;

    const incoming: UsageBucket[] = [];

    for (const connection of selected) {
      const points = await loadPoints(connection, body.start, body.end);
      for (const point of points) {
        for (const granularity of ['hour', 'week', 'month', 'year'] as const) {
          const reported = typeof point.costUsd === 'number';
          const cost = reported ? Number(point.costUsd) : computeCostUsd(connection, point.model, point.inputTokens, point.outputTokens);

          incoming.push({
            connectionId: connection.id,
            provider: connection.provider,
            model: point.model,
            bucketStart: toBucketStart(point.ts, granularity),
            bucketGranularity: granularity,
            inputTokens: point.inputTokens,
            outputTokens: point.outputTokens,
            totalTokens: point.totalTokens,
            costUsd: Number(cost.toFixed(8)),
            costMode: reported ? 'reported' : 'estimated'
          });
        }
      }
    }

    const usage = upsertUsageBuckets(req.session.usage, incoming);
    reply.commitSession({ ...req.session, usage });

    return { ok: true, rowsAdded: incoming.length };
  });

  fastify.get('/usage/query', async (req) => {
    const filters = querySchema.parse(req.query);

    return {
      rows: queryUsage(req.session.usage, filters)
    };
  });
};

export default usageRoutes;
