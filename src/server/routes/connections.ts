import type { FastifyPluginAsync } from 'fastify';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { testOpenAI } from '../services/providers/openai.js';
import type { ConnectionRecord, Provider } from '../types/models.js';

const providerSchema = z.literal('openai');

const upsertSchema = z.object({
  provider: providerSchema,
  name: z.string().min(1).max(120),
  config: z
    .object({
      baseUrl: z.string().url().optional(),
      models: z.array(z.string()).optional(),
      pricing: z.record(z.object({ inputUsdPer1k: z.number().nonnegative(), outputUsdPer1k: z.number().nonnegative() })).optional(),
      openaiOrg: z.string().optional(),
      openaiProject: z.string().optional(),
      anthropicVersion: z.string().optional()
    })
    .default({}),
  secrets: z.object({
    apiKey: z.string().min(8)
  })
});

const updateSchema = upsertSchema.partial().refine((v) => !!(v.name || v.config || v.secrets || v.provider), {
  message: 'at_least_one_field_required'
});

async function runConnectionTest(connection: ConnectionRecord): Promise<void> {
  if (connection.provider !== 'openai') {
    throw new Error('unsupported_provider');
  }
  return testOpenAI(connection);
}

function toPublicConnection(connection: ConnectionRecord) {
  return {
    id: connection.id,
    provider: connection.provider,
    name: connection.name,
    slug: `C${connection.id.replace(/-/g, '').slice(0, 8).toUpperCase()}`,
    config: connection.config,
    hasSecrets: Boolean(connection.secrets?.apiKey),
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt
  };
}

const connectionsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/connections', async (req) => {
    return {
      connections: req.session.connections.map(toPublicConnection)
    };
  });

  fastify.post('/connections', async (req, reply) => {
    const body = upsertSchema.parse(req.body);
    const now = new Date().toISOString();

    const next: ConnectionRecord = {
      id: randomUUID(),
      provider: body.provider as Provider,
      name: body.name,
      config: body.config,
      secrets: body.secrets,
      createdAt: now,
      updatedAt: now
    };

    const session = {
      ...req.session,
      connections: [...req.session.connections, next]
    };

    await reply.commitSession(session);
    return { connection: toPublicConnection(next) };
  });

  fastify.post('/connections/:id/test', async (req) => {
    const parsedId = z.string().uuid().safeParse((req.params as any).id);
    if (!parsedId.success) {
      return { ok: false, message: 'invalid_connection_id' };
    }
    const id = parsedId.data;
    const connection = req.session.connections.find((c) => c.id === id);
    if (!connection) {
      return { ok: false, message: 'connection_not_found' };
    }

    try {
      await runConnectionTest(connection);
      return { ok: true, message: 'connection_ok' };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'connection_test_failed';
      return { ok: false, message: msg };
    }
  });

  fastify.put('/connections/:id', async (req, reply) => {
    const id = z.string().uuid().parse((req.params as any).id);
    const body = updateSchema.parse(req.body);

    const idx = req.session.connections.findIndex((c) => c.id === id);
    if (idx < 0) {
      reply.code(404).send({ error: 'connection_not_found' });
      return;
    }

    const current = req.session.connections[idx];
    const updated: ConnectionRecord = {
      ...current,
      provider: (body.provider as Provider | undefined) ?? current.provider,
      name: body.name ?? current.name,
      config: body.config ? { ...current.config, ...body.config } : current.config,
      secrets: body.secrets ? { ...current.secrets, ...body.secrets } : current.secrets,
      updatedAt: new Date().toISOString()
    };

    const connections = [...req.session.connections];
    connections[idx] = updated;
    await reply.commitSession({ ...req.session, connections });

    return { connection: toPublicConnection(updated) };
  });

  fastify.delete('/connections/:id', async (req, reply) => {
    const id = z.string().uuid().parse((req.params as any).id);

    const connections = req.session.connections.filter((c) => c.id !== id);
    await reply.commitSession({ ...req.session, connections });

    return { ok: true };
  });
};

export default connectionsRoutes;
