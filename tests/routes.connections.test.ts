import { beforeEach, describe, expect, it } from 'vitest';
import { buildServer } from '../src/server/index.js';

describe('connections routes', () => {
  beforeEach(() => {
    process.env.TOKENSUN_MASTER_KEY = Buffer.alloc(32, 3).toString('base64');
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
});
