import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildServer } from '../src/server/index.js';

describe('usage routes', () => {
  beforeEach(() => {
    process.env.TOKENSUN_MASTER_KEY = Buffer.alloc(32, 5).toString('base64');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns structured refresh errors instead of 500', async () => {
    const app = buildServer();

    const bootstrap = await app.inject({
      method: 'POST',
      url: '/api/auth/bootstrap',
      payload: {
        upsunApiToken: 'u'.repeat(30),
        upsunOrgId: 'org',
        upsunProjectId: 'proj'
      }
    });
    expect(bootstrap.statusCode).toBe(200);

    const create = await app.inject({
      method: 'POST',
      url: '/api/connections',
      payload: {
        provider: 'openai',
        name: 'X',
        config: {},
        secrets: { apiKey: 'secret-key' }
      }
    });
    expect(create.statusCode).toBe(200);

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(JSON.stringify({ error: { message: 'forbidden' } }), {
          status: 403,
          headers: { 'content-type': 'application/json' }
        });
      })
    );

    const now = new Date();
    const ago = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const refresh = await app.inject({
      method: 'POST',
      url: '/api/usage/refresh',
      payload: {
        start: ago.toISOString(),
        end: now.toISOString()
      }
    });

    expect(refresh.statusCode).toBe(200);
    const body = refresh.json();
    expect(body.ok).toBe(false);
    expect(body.rowsAdded).toBe(0);
    expect(Array.isArray(body.errors)).toBe(true);
    expect(body.errors[0].message).toContain('openai_api_error:403');

    await app.close();
  });
});
