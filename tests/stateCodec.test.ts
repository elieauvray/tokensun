import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionState } from '../src/server/types/models.js';

describe('state storage codec', () => {
  beforeEach(() => {
    process.env.TOKENSUN_MASTER_KEY = Buffer.alloc(32, 5).toString('base64');
    vi.resetModules();
  });

  it('round-trips session state and does not expose plaintext', async () => {
    const { encodeStateForStorage, decodeStateFromStorage } = await import('../src/server/services/stateCodec.js');

    const state: SessionState = {
      workspace: {
        upsunApiToken: 'token-secret-1234567890',
        upsunOrgId: 'org',
        upsunProjectId: 'proj'
      },
      connections: [],
      usage: []
    };

    const encoded = encodeStateForStorage(state);
    expect(encoded.includes('token-secret-1234567890')).toBe(false);
    expect(decodeStateFromStorage(encoded)).toEqual(state);
  });

  it('rejects plaintext json payload', async () => {
    const { decodeStateFromStorage } = await import('../src/server/services/stateCodec.js');
    expect(() => decodeStateFromStorage('{"workspace":{"upsunApiToken":"x"}}')).toThrow('unencrypted_state_payload');
  });
});
