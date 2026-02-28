import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';

type Bucket = {
  count: number;
  resetAt: number;
};

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 600;

const buckets = new Map<string, Bucket>();

const rateLimitPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', async (req, reply) => {
    if (!req.url.startsWith('/api/')) return;

    const workspaceKey = req.session.workspace
      ? `${req.session.workspace.upsunOrgId}:${req.session.workspace.upsunProjectId}`
      : 'anon';

    const key = `${workspaceKey}:${req.ip}`;
    const now = Date.now();
    const current = buckets.get(key);

    if (!current || current.resetAt < now) {
      buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
      return;
    }

    if (current.count >= MAX_REQUESTS) {
      reply.code(429).send({ error: 'rate_limit_exceeded' });
      return;
    }

    current.count += 1;
  });
};

export default fp(rateLimitPlugin);
