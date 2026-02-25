import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12;

type Envelope = {
  iv: string;
  tag: string;
  ciphertext: string;
};

function decodeMaybeBase64Json(raw: string): Record<string, unknown> {
  let decoded = raw;
  try {
    if (!raw.trim().startsWith('{')) {
      decoded = Buffer.from(raw, 'base64').toString('utf8');
    }
  } catch {
    decoded = raw;
  }

  try {
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function getMasterKeyString(): string | undefined {
  if (process.env.TOKENSUN_MASTER_KEY) {
    return process.env.TOKENSUN_MASTER_KEY;
  }

  const platformVars = process.env.PLATFORM_VARIABLES;
  if (!platformVars) return undefined;

  const vars = decodeMaybeBase64Json(platformVars);
  const fromEnvPrefix = vars['env:TOKENSUN_MASTER_KEY'];
  if (typeof fromEnvPrefix === 'string' && fromEnvPrefix.length > 0) {
    return fromEnvPrefix;
  }

  const fromPlain = vars.TOKENSUN_MASTER_KEY;
  if (typeof fromPlain === 'string' && fromPlain.length > 0) {
    return fromPlain;
  }

  return undefined;
}

function getMasterKey(): Buffer {
  const raw = getMasterKeyString();
  if (!raw) {
    throw new Error('TOKENSUN_MASTER_KEY is required');
  }

  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error('TOKENSUN_MASTER_KEY must decode to 32 bytes');
  }

  return key;
}

export function assertMasterKeyConfigured(): void {
  getMasterKey();
}

export function encryptString(plain: string): Envelope {
  const key = getMasterKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);

  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ciphertext: ciphertext.toString('base64')
  };
}

export function decryptString(envelope: Envelope): string {
  const key = getMasterKey();
  const iv = Buffer.from(envelope.iv, 'base64');
  const tag = Buffer.from(envelope.tag, 'base64');
  const ciphertext = Buffer.from(envelope.ciphertext, 'base64');

  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);

  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plain.toString('utf8');
}

export function encryptJson<T>(value: T): Envelope {
  return encryptString(JSON.stringify(value));
}

export function decryptJson<T>(envelope: Envelope): T {
  return JSON.parse(decryptString(envelope)) as T;
}

export function encodeEnvelope(envelope: Envelope): string {
  return Buffer.from(JSON.stringify(envelope), 'utf8').toString('base64url');
}

export function decodeEnvelope(value: string): Envelope {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Envelope;
}
