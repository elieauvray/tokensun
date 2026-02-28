import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { fetchOpenAIUsage } from '../services/providers/openai.js';
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
  projectId: z.string().optional(),
  userId: z.string().optional(),
  apiKeyId: z.string().optional(),
  batch: z.enum(['true', 'false']).optional(),
  connectionId: z.string().uuid().optional()
});

type Point = {
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

async function loadPoints(connection: ConnectionRecord, start: string, end: string): Promise<Point[]> {
  if (connection.provider !== 'openai') return [];
  return fetchOpenAIUsage(connection, start, end);
}

const usageRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/usage/refresh', async (req, reply) => {
    const parsed = refreshSchema.safeParse(req.body);
    if (!parsed.success) {
      return { ok: false, rowsAdded: 0, errors: [{ message: 'invalid_refresh_request' }] };
    }

    const body = parsed.data;
    const selected = body.connectionId
      ? req.session.connections.filter((c) => c.id === body.connectionId)
      : req.session.connections;

    const incoming: UsageBucket[] = [];
    const errors: Array<{ connectionId?: string; provider?: string; message: string }> = [];

    for (const connection of selected) {
      let points: Point[] = [];
      try {
        points = await loadPoints(connection, body.start, body.end);
      } catch (err) {
        errors.push({
          connectionId: connection.id,
          provider: connection.provider,
          message: err instanceof Error ? err.message : 'usage_fetch_failed'
        });
        continue;
      }

      const configuredProjectId = connection.config.openaiProject?.trim();

      for (const point of points) {
        if (configuredProjectId) {
          if (!point.projectId || point.projectId !== configuredProjectId) {
            continue;
          }
        }

        for (const granularity of ['hour', 'week', 'month', 'year'] as const) {
          const reported = typeof point.costUsd === 'number';
          const cost = reported ? Number(point.costUsd) : computeCostUsd(connection, point.model, point.inputTokens, point.outputTokens);

          incoming.push({
            connectionId: connection.id,
            provider: connection.provider,
            model: point.model,
            projectId: point.projectId,
            userId: point.userId,
            apiKeyId: point.apiKeyId,
            batch: point.batch,
            bucketStart: toBucketStart(point.ts, granularity),
            bucketGranularity: granularity,
            inputTokens: point.inputTokens,
            inputCachedTokens: point.inputCachedTokens,
            inputAudioTokens: point.inputAudioTokens,
            outputTokens: point.outputTokens,
            outputAudioTokens: point.outputAudioTokens,
            totalTokens: point.totalTokens,
            numModelRequests: point.numModelRequests,
            costUsd: Number(cost.toFixed(8)),
            costMode: reported ? 'reported' : 'estimated'
          });
        }
      }
    }

    const usage = upsertUsageBuckets(req.session.usage, incoming);
    await reply.commitSession({ ...req.session, usage });

    return { ok: errors.length === 0, rowsAdded: incoming.length, errors };
  });

  fastify.get('/usage/query', async (req, reply) => {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      reply.code(400);
      return { error: 'invalid_query' };
    }

    return {
      rows: queryUsage(req.session.usage, parsed.data)
    };
  });
};

export default usageRoutes;
