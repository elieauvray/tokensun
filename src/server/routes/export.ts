import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireWorkspace } from '../middleware/requireWorkspace.js';
import { queryUsage } from '../services/usageAggregator.js';

const querySchema = z.object({
  granularity: z.enum(['hour', 'week', 'month', 'year']),
  start: z.string().datetime(),
  end: z.string().datetime(),
  provider: z.string().optional(),
  model: z.string().optional(),
  connectionId: z.string().uuid().optional()
});

const exportRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/export.csv', { preHandler: requireWorkspace }, async (req, reply) => {
    const filters = querySchema.parse(req.query);
    const rows = queryUsage(req.session.usage, filters);

    const header = [
      'bucketStart',
      'granularity',
      'connectionId',
      'provider',
      'model',
      'inputTokens',
      'outputTokens',
      'totalTokens',
      'costUsd',
      'costMode'
    ];

    const csvRows = rows.map((r) =>
      [
        r.bucketStart,
        r.bucketGranularity,
        r.connectionId,
        r.provider,
        r.model,
        r.inputTokens,
        r.outputTokens,
        r.totalTokens,
        r.costUsd,
        r.costMode
      ]
        .map((v) => `"${String(v).replaceAll('"', '""')}"`)
        .join(',')
    );

    const csv = [header.join(','), ...csvRows].join('\n');
    reply.header('content-type', 'text/csv; charset=utf-8');
    return csv;
  });
};

export default exportRoutes;
