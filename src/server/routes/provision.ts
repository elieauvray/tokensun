import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireWorkspace } from '../middleware/requireWorkspace.js';
import { writeVariables } from '../services/upsunClient.js';

const schema = z.object({
  connectionId: z.string().uuid(),
  level: z.enum(['project', 'environment']),
  environmentId: z.string().min(1).optional(),
  appScope: z.array(z.string()).optional(),
  makeDefault: z.boolean().optional()
});

const provisionRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/provision', { preHandler: requireWorkspace }, async (req, reply) => {
    const body = schema.parse(req.body);

    if (body.level === 'environment' && !body.environmentId) {
      reply.code(400).send({ error: 'environmentId_required' });
      return;
    }

    const workspace = req.session.workspace!;
    const connection = req.session.connections.find((c) => c.id === body.connectionId);
    if (!connection) {
      reply.code(404).send({ error: 'connection_not_found' });
      return;
    }

    const conn = `C${connection.id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;

    const listPayload = req.session.connections.map((c) => ({
      conn: `C${c.id.replace(/-/g, '').slice(0, 8).toUpperCase()}`,
      provider: c.provider,
      name: c.name,
      baseUrl: c.config.baseUrl ?? '',
      models: c.config.models ?? []
    }));

    const appScope = body.appScope?.length ? body.appScope : undefined;

    const vars = [
      {
        name: 'TOKENSUN_CONNECTIONS',
        value: JSON.stringify(listPayload),
        sensitive: false,
        visible_runtime: true,
        visible_build: true,
        inheritable: true,
        applications: appScope
      },
      {
        name: 'TOKENSUN_DEFAULT_CONNECTION',
        value: body.makeDefault === false ? '' : conn,
        sensitive: false,
        visible_runtime: true,
        visible_build: true,
        inheritable: true,
        applications: appScope
      },
      {
        name: `TOKENSUN_${conn}_PROVIDER`,
        value: connection.provider,
        sensitive: false,
        visible_runtime: true,
        visible_build: true,
        inheritable: true,
        applications: appScope
      },
      {
        name: `TOKENSUN_${conn}_BASE_URL`,
        value: connection.config.baseUrl ?? '',
        sensitive: false,
        visible_runtime: true,
        visible_build: true,
        inheritable: true,
        applications: appScope
      },
      {
        name: `TOKENSUN_${conn}_API_KEY`,
        value: connection.secrets.apiKey,
        sensitive: true,
        visible_runtime: true,
        visible_build: false,
        inheritable: false,
        applications: appScope
      }
    ];

    if (connection.provider === 'openai') {
      vars.push({
        name: `TOKENSUN_${conn}_OPENAI_ORG`,
        value: connection.config.openaiOrg ?? '',
        sensitive: false,
        visible_runtime: true,
        visible_build: true,
        inheritable: true,
        applications: appScope
      });
      vars.push({
        name: `TOKENSUN_${conn}_OPENAI_PROJECT`,
        value: connection.config.openaiProject ?? '',
        sensitive: false,
        visible_runtime: true,
        visible_build: true,
        inheritable: true,
        applications: appScope
      });
    }

    if (connection.provider === 'anthropic') {
      vars.push({
        name: `TOKENSUN_${conn}_ANTHROPIC_VERSION`,
        value: connection.config.anthropicVersion ?? '2023-06-01',
        sensitive: false,
        visible_runtime: true,
        visible_build: true,
        inheritable: true,
        applications: appScope
      });
    }

    await writeVariables({
      token: workspace.upsunApiToken,
      projectId: workspace.upsunProjectId,
      level: body.level,
      environmentId: body.environmentId,
      variables: vars
    });

    return { ok: true, conn };
  });
};

export default provisionRoutes;
