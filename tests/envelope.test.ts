import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('envelope crypto', () => {
  beforeEach(() => {
    process.env.TOKENSUN_MASTER_KEY = Buffer.alloc(32, 7).toString('base64');
    vi.resetModules();
  });

  it('encrypts and decrypts json', async () => {
    const { encryptJson, decryptJson } = await import('../src/server/crypto/envelope.js');
    const plain = { token: 'secret', nested: { a: 1 } };
    const env = encryptJson(plain);
    const back = decryptJson<typeof plain>(env);
    expect(back).toEqual(plain);
  });

  it('fails on tampered auth tag', async () => {
    const { encryptString, decryptString } = await import('../src/server/crypto/envelope.js');
    const env = encryptString('hello');
    env.tag = Buffer.from('x'.repeat(16)).toString('base64');
    expect(() => decryptString(env)).toThrow();
  });
});
