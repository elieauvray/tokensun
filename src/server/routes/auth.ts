import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

const bootstrapSchema = z.object({
  upsunApiToken: z.string().min(20),
  upsunOrgId: z.string().optional(),
  upsunProjectId: z.string().optional()
});

function getRuntimeProjectId(): string | undefined {
  if (process.env.PLATFORM_PROJECT) return process.env.PLATFORM_PROJECT;

  const raw = process.env.PLATFORM_APPLICATION;
  if (!raw) return undefined;

  try {
    const decoded = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
    const parsed = JSON.parse(decoded) as { project?: string };
    return parsed.project;
  } catch {
    return undefined;
  }
}

const authRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/auth/bootstrap', async (req, reply) => {
    const body = bootstrapSchema.parse(req.body);
    const projectId = body.upsunProjectId ?? getRuntimeProjectId();
    if (!projectId) {
      reply.code(400).send({ error: 'project_id_required' });
      return;
    }

    const session = {
      ...req.session,
      workspace: {
        upsunApiToken: body.upsunApiToken,
        upsunOrgId: body.upsunOrgId ?? 'unknown',
        upsunProjectId: projectId
      },
      connections: req.session.connections ?? [],
      usage: req.session.usage ?? []
    };

    reply.commitSession(session);
    return {
      ok: true,
      workspace: {
        upsunOrgId: body.upsunOrgId ?? 'unknown',
        upsunProjectId: projectId
      }
    };
  });
};

export default authRoutes;
