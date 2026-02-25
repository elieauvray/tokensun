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

function getProjectIdFromRequestHost(hostHeader: string | undefined): string | undefined {
  if (!hostHeader) return undefined;
  const host = hostHeader.split(':')[0];
  const firstLabel = host.split('.')[0] ?? '';
  const pieces = firstLabel.split('-').filter(Boolean);
  if (pieces.length < 2) return undefined;
  const candidate = pieces[pieces.length - 1];
  if (!/^[a-z0-9]{8,}$/i.test(candidate)) return undefined;
  return candidate;
}

const authRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/auth/bootstrap', async (req, reply) => {
    const body = bootstrapSchema.parse(req.body);
    const normalizedProjectId = body.upsunProjectId?.trim() || undefined;
    const normalizedOrgId = body.upsunOrgId?.trim() || undefined;
    const projectId =
      normalizedProjectId ??
      getRuntimeProjectId() ??
      getProjectIdFromRequestHost(req.headers.host);
    if (!projectId) {
      reply.code(400).send({ error: 'project_id_required' });
      return;
    }

    const session = {
      ...req.session,
      workspace: {
        upsunApiToken: body.upsunApiToken,
        upsunOrgId: normalizedOrgId ?? 'unknown',
        upsunProjectId: projectId
      },
      connections: req.session.connections ?? [],
      usage: req.session.usage ?? []
    };

    reply.commitSession(session);
    return {
      ok: true,
      workspace: {
        upsunOrgId: normalizedOrgId ?? 'unknown',
        upsunProjectId: projectId
      }
    };
  });
};

export default authRoutes;
