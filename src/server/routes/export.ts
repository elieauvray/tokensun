import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { queryUsage } from '../services/usageAggregator.js';

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

const exportRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/export.csv', async (req, reply) => {
    const filters = querySchema.parse(req.query);
    const rows = queryUsage(req.session.usage, filters);

    const header = [
      'bucketStart',
      'granularity',
      'connectionId',
      'provider',
      'model',
      'projectId',
      'userId',
      'apiKeyId',
      'batch',
      'inputTokens',
      'inputCachedTokens',
      'inputAudioTokens',
      'outputTokens',
      'outputAudioTokens',
      'totalTokens',
      'numModelRequests',
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
        r.projectId ?? '',
        r.userId ?? '',
        r.apiKeyId ?? '',
        r.batch === undefined ? '' : String(r.batch),
        r.inputTokens,
        r.inputCachedTokens,
        r.inputAudioTokens,
        r.outputTokens,
        r.outputAudioTokens,
        r.totalTokens,
        r.numModelRequests,
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
