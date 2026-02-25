import 'fastify';
import type { SessionState } from './models.js';

declare module 'fastify' {
  interface FastifyRequest {
    session: SessionState;
    sessionId: string;
  }

  interface FastifyReply {
    commitSession: (nextSession: SessionState) => void;
  }
}
