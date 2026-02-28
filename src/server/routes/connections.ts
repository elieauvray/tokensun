import type { FastifyPluginAsync } from 'fastify';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { testFake } from '../services/providers/fake.js';
import { testOpenAI } from '../services/providers/openai.js';
import type { ConnectionRecord, Provider } from '../types/models.js';

const providerSchema = z.enum(['openai', 'fake']);

const baseConnectionSchema = z.object({
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
    apiKey: z.string().min(8).optional()
  })
});

const upsertSchema = baseConnectionSchema.superRefine((value, ctx) => {
  if (value.provider === 'openai' && !value.secrets.apiKey) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['secrets', 'apiKey'],
      message: 'api_key_required_for_openai'
    });
  }
});

const updateSchema = baseConnectionSchema.partial().refine((v) => !!(v.name || v.config || v.secrets || v.provider), {
  message: 'at_least_one_field_required'
});

async function runConnectionTest(connection: ConnectionRecord): Promise<Record<string, unknown>> {
  if (connection.provider === 'openai') return testOpenAI(connection);
  if (connection.provider === 'fake') return testFake(connection);
  throw new Error('unsupported_provider');
}

function toPublicConnection(connection: ConnectionRecord) {
  return {
    id: connection.id,
    provider: connection.provider,
    name: connection.name,
    slug: `C${connection.id.replace(/-/g, '').slice(0, 8).toUpperCase()}`,
    config: connection.config,
    hasSecrets: connection.provider === 'fake' ? false : Boolean(connection.secrets?.apiKey),
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
      secrets: {
        apiKey: body.provider === 'fake' ? body.secrets.apiKey ?? 'fake-demo-key' : body.secrets.apiKey!
      },
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
    try {
      const parsedId = z.string().uuid().safeParse((req.params as any).id);
      if (!parsedId.success) {
        return { ok: false, message: 'invalid_connection_id' };
      }
      const id = parsedId.data;
      const connection = req.session.connections.find((c) => c.id === id);
      if (!connection) {
        return { ok: false, message: 'connection_not_found' };
      }

      const details = await runConnectionTest(connection);
      const checks = Array.isArray((details as any)?.checks) ? ((details as any).checks as Array<{ ok?: boolean; status?: number; error?: string }>) : [];
      const failed = checks.find((check) => check.ok === false);
      if (failed) {
        const status = typeof failed.status === 'number' ? failed.status : 500;
        const suffix = failed.error ? `:${failed.error}` : '';
        return { ok: false, message: `openai_test_failed:${status}${suffix}`, details };
      }
      return { ok: true, message: 'connection_ok', details };
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
    try {
      const parsedId = z.string().uuid().safeParse((req.params as any).id);
      if (!parsedId.success) {
        return { ok: false, message: 'invalid_connection_id' };
      }
      const id = parsedId.data;

      const before = req.session.connections.length;
      const connections = req.session.connections.filter((c) => c.id !== id);
      if (connections.length === before) {
        return { ok: false, message: 'connection_not_found' };
      }

      // Deleting a connection must clear usage/budget state to avoid stale dashboard data.
      await reply.commitSession({ ...req.session, connections, usage: [], usageBudgets: {} });
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'connection_delete_failed';
      return { ok: false, message: msg };
    }
  });
};

export default connectionsRoutes;
