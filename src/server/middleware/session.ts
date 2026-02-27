import fp from 'fastify-plugin';
import cookie from '@fastify/cookie';
import type { FastifyPluginAsync } from 'fastify';
import { randomUUID } from 'node:crypto';
import { decodeEnvelope, decryptJson, encodeEnvelope, encryptJson } from '../crypto/envelope.js';
import type { SessionState } from '../types/models.js';

const COOKIE_NAME = 'tokensun_session';
const EMPTY_SESSION: SessionState = {
  connections: [],
  usage: []
};

const sessionPlugin: FastifyPluginAsync = async (fastify) => {
  await fastify.register(cookie, {
    hook: 'onRequest'
  });

  fastify.addHook('onRequest', async (req, reply) => {
    req.sessionId = req.cookies[COOKIE_NAME] ? 'existing' : randomUUID();

    const raw = req.cookies[COOKIE_NAME];
    if (!raw) {
      req.session = { ...EMPTY_SESSION, connections: [], usage: [] };
      return;
    }

    try {
      const env = decodeEnvelope(raw);
      req.session = decryptJson<SessionState>(env);
    } catch {
      req.session = { ...EMPTY_SESSION, connections: [], usage: [] };
      reply.clearCookie(COOKIE_NAME, { path: '/' });
    }
  });

  fastify.decorateReply('commitSession', function commitSession(nextSession: SessionState) {
    const encoded = encodeEnvelope(encryptJson(nextSession));
    const isProd = process.env.NODE_ENV === 'production';
    this.setCookie(COOKIE_NAME, encoded, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      // Plugin UI is embedded in Upsun Console (third-party context).
      // Partitioned cookies (CHIPS) keep session persistence working in modern browsers.
      ...(isProd ? ({ partitioned: true } as const) : {}),
      path: '/',
      maxAge: 60 * 60 * 24 * 7
    });
  });
};

export default fp(sessionPlugin);
