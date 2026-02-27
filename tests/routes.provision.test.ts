import { beforeEach, describe, expect, it, vi } from 'vitest';

const capturedNames: string[] = [];

vi.mock('../src/server/services/upsunClient.js', () => ({
  writeVariables: vi.fn(async ({ variables }: any) => {
    capturedNames.splice(0, capturedNames.length, ...variables.map((v: any) => v.name));
  })
}));

import { buildServer } from '../src/server/index.js';

describe('provision route allowlist enforcement', () => {
  beforeEach(() => {
    process.env.TOKENSUN_MASTER_KEY = Buffer.alloc(32, 9).toString('base64');
    capturedNames.splice(0, capturedNames.length);
  });

  it('emits only TOKENSUN_ variables', async () => {
    const app = buildServer();

    const bootstrap = await app.inject({
      method: 'POST',
      url: '/api/auth/bootstrap',
      payload: {
        upsunApiToken: 'x'.repeat(40),
        upsunOrgId: 'org',
        upsunProjectId: 'proj'
      }
    });
    expect(bootstrap.statusCode).toBe(200);

    const create = await app.inject({
      method: 'POST',
      url: '/api/connections',
      payload: {
        provider: 'anthropic',
        name: 'claude',
        config: {},
        secrets: { apiKey: 'a'.repeat(16) }
      }
    });

    const id = create.json().connection.id;

    const provision = await app.inject({
      method: 'POST',
      url: '/api/provision',
      payload: {
        connectionId: id,
        level: 'project',
        makeDefault: true
      }
    });

    expect(provision.statusCode).toBe(200);
    expect(capturedNames.length).toBeGreaterThan(0);
    for (const name of capturedNames) {
      expect(name.startsWith('TOKENSUN_')).toBe(true);
    }

    await app.close();
  });
});
