import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildServer } from '../src/server/index.js';

describe('connections routes', () => {
  beforeEach(() => {
    process.env.TOKENSUN_MASTER_KEY = Buffer.alloc(32, 3).toString('base64');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('validates provider on create', async () => {
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

    const invalid = await app.inject({
      method: 'POST',
      url: '/api/connections',
      payload: {
        provider: 'bad-provider',
        name: 'X',
        config: {},
        secrets: { apiKey: 'secret-key' }
      }
    });

    expect(invalid.statusCode).toBe(400);

    const valid = await app.inject({
      method: 'POST',
      url: '/api/connections',
      payload: {
        provider: 'openai',
        name: 'X',
        config: {},
        secrets: { apiKey: 'secret-key' }
      }
    });

    expect(valid.statusCode).toBe(200);

    const list = await app.inject({
      method: 'GET',
      url: '/api/connections'
    });

    expect(list.statusCode).toBe(200);
    const body = list.json();
    expect(body.connections).toHaveLength(1);
    expect(body.connections[0].hasSecrets).toBe(true);
    expect(body.connections[0].secrets).toBeUndefined();

    await app.close();
  });

  it('returns details when openai test succeeds', async () => {
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
    const id = create.json().connection.id as string;

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(JSON.stringify({ data: [{ id: 'gpt-4.1-mini' }, { id: 'gpt-4.1' }] }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      })
    );

    const testRes = await app.inject({
      method: 'POST',
      url: `/api/connections/${id}/test`
    });

    expect(testRes.statusCode).toBe(200);
    const body = testRes.json();
    expect(body.ok).toBe(true);
    expect(body.message).toBe('connection_ok');
    expect(body.details.modelCount).toBe(2);
    expect(body.details.sampleModels).toEqual(['gpt-4.1-mini', 'gpt-4.1']);
    expect(typeof body.details.checkedAt).toBe('string');

    await app.close();
  });
});
