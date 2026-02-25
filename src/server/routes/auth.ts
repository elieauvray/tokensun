import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

const bootstrapSchema = z.object({
  upsunApiToken: z.string().min(20),
  upsunOrgId: z.string().min(1),
  upsunProjectId: z.string().min(1)
});

const authRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/auth/bootstrap', async (req, reply) => {
    const body = bootstrapSchema.parse(req.body);

    const session = {
      ...req.session,
      workspace: {
        upsunApiToken: body.upsunApiToken,
        upsunOrgId: body.upsunOrgId,
        upsunProjectId: body.upsunProjectId
      },
      connections: req.session.connections ?? [],
      usage: req.session.usage ?? []
    };

    reply.commitSession(session);
    return {
      ok: true,
      workspace: {
        upsunOrgId: body.upsunOrgId,
        upsunProjectId: body.upsunProjectId
      }
    };
  });
};

export default authRoutes;
