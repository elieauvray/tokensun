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
        return new Response(JSON.stringify({ data: [{ bucket: 1 }, { bucket: 2 }], next_page: null }), {
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
    expect(body.details.endpoint).toBe('/v1/organization/usage/completions');
    expect(body.details.bucketCount).toBe(2);
    expect(body.details.hasNextPage).toBe(false);
    expect(typeof body.details.checkedAt).toBe('string');

    await app.close();
  });

  it('deletes usage rows tied to a deleted connection', async () => {
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
        name: 'cleanup-target',
        config: {},
        secrets: { apiKey: 'secret-key' }
      }
    });
    expect(create.statusCode).toBe(200);
    const id = create.json().connection.id as string;

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/v1/organization/costs')) {
          return new Response(
            JSON.stringify({
              data: [
                {
                  start_time: 1735689600,
                  results: [{ project_id: 'project_local', amount: { value: 1.25 } }]
                }
              ],
              next_page: null
            }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({
            data: [
              {
                start_time: 1735689600,
                results: [
                  {
                    model: 'gpt-4o-mini',
                    project_id: 'project_local',
                    input_tokens: 100,
                    output_tokens: 50,
                    total_tokens: 150,
                    num_model_requests: 2
                  }
                ]
              }
            ],
            next_page: null
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      })
    );

    const start = new Date('2025-01-01T00:00:00.000Z').toISOString();
    const end = new Date('2025-01-03T00:00:00.000Z').toISOString();
    const refresh = await app.inject({
      method: 'POST',
      url: '/api/usage/refresh',
      payload: { connectionId: id, start, end }
    });
    expect(refresh.statusCode).toBe(200);
    expect(refresh.json().rowsAdded).toBeGreaterThan(0);

    const beforeDelete = await app.inject({
      method: 'GET',
      url: `/api/usage/query?granularity=hour&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&provider=openai&connectionId=${id}`
    });
    expect(beforeDelete.statusCode).toBe(200);
    expect(beforeDelete.json().rows.length).toBeGreaterThan(0);

    const remove = await app.inject({
      method: 'DELETE',
      url: `/api/connections/${id}`
    });
    expect(remove.statusCode).toBe(200);
    expect(remove.json().ok).toBe(true);

    const afterDelete = await app.inject({
      method: 'GET',
      url: `/api/usage/query?granularity=hour&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&provider=openai&connectionId=${id}`
    });
    expect(afterDelete.statusCode).toBe(200);
    expect(afterDelete.json().rows).toHaveLength(0);

    await app.close();
  });
});
