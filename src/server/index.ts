import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { access, readFile } from 'node:fs/promises';
import { ZodError } from 'zod';
import { assertMasterKeyConfigured } from './crypto/envelope.js';
import { migrate } from './db/migrate.js';
import sessionPlugin from './middleware/session.js';
import rateLimitPlugin from './middleware/rateLimit.js';
import authRoutes from './routes/auth.js';
import connectionsRoutes from './routes/connections.js';
import provisionRoutes from './routes/provision.js';
import usageRoutes from './routes/usage.js';
import exportRoutes from './routes/export.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function buildServer() {
  const app = Fastify({
    logger: {
      redact: {
        paths: [
          'req.headers.authorization',
          'req.body.upsunApiToken',
          'req.body.secrets',
          'res.headers.set-cookie',
          '*.apiKey',
          '*.upsunApiToken'
        ],
        censor: '[REDACTED]'
      }
    }
  });

  app.register(sessionPlugin);
  app.register(rateLimitPlugin);

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ZodError) {
      reply.code(400).send({ error: 'validation_error', details: err.issues });
      return;
    }
    reply.code(500).send({ error: 'internal_error' });
  });

  app.get('/healthz', async () => ({ ok: true }));
  app.get('/manifest.json', async (req, reply) => {
    reply.header('access-control-allow-origin', '*');
    reply.header('access-control-allow-methods', 'GET, OPTIONS');
    reply.header('access-control-allow-headers', 'content-type');
    try {
      const mountedPath = join(process.cwd(), 'plugins/manifest.json');
      await access(mountedPath);
      const content = await readFile(mountedPath, 'utf8');
      reply.type('application/json; charset=utf-8');
      return content;
    } catch {
      const localPath = join(process.cwd(), 'manifest.json');
      const content = await readFile(localPath, 'utf8');
      reply.type('application/json; charset=utf-8');
      return content;
    }
  });
  app.options('/manifest.json', async (_req, reply) => {
    reply.header('access-control-allow-origin', '*');
    reply.header('access-control-allow-methods', 'GET, OPTIONS');
    reply.header('access-control-allow-headers', 'content-type');
    reply.code(204).send();
  });

  app.register(async (api) => {
    api.register(authRoutes);
    api.register(connectionsRoutes);
    api.register(provisionRoutes);
    api.register(usageRoutes);
    api.register(exportRoutes);
  }, { prefix: '/api' });

  if (process.env.NODE_ENV !== 'test') {
    const distDir = join(__dirname, '../../dist');
    app.register(fastifyStatic, {
      root: distDir,
      wildcard: false
    });
  }

  app.setNotFoundHandler(async (req, reply) => {
    if (req.url.startsWith('/api/')) {
      reply.code(404).send({ error: 'not_found' });
      return;
    }
    return reply.sendFile('index.html');
  });

  return app;
}

async function start() {
  // Fail fast if encryption is not configured.
  assertMasterKeyConfigured();
  await migrate();

  const app = buildServer();
  const port = Number(process.env.PORT ?? 8888);
  await app.listen({ port, host: '0.0.0.0' });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  start().catch((err) => {
    // No secret material in logs.
    console.error(err instanceof Error ? err.message : 'fatal_start_error');
    process.exit(1);
  });
}
