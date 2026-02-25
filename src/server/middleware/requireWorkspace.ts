import type { FastifyReply, FastifyRequest } from 'fastify';

export async function requireWorkspace(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!req.session.workspace) {
    reply.code(401).send({ error: 'workspace_not_bootstrapped' });
  }
}
