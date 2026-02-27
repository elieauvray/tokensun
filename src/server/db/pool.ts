import { createRequire } from 'node:module';

type PlatformRelationship = {
  host?: string;
  port?: number | string;
  username?: string;
  password?: string;
  path?: string;
  query?: Record<string, unknown>;
};

type QueryResultRow = Record<string, unknown>;
type QueryResult<T extends QueryResultRow = QueryResultRow> = {
  rowCount: number | null;
  rows: T[];
};

type PgPool = {
  query: <T extends QueryResultRow = QueryResultRow>(sql: string, values?: unknown[]) => Promise<QueryResult<T>>;
};

let pool: PgPool | undefined;
const require = createRequire(import.meta.url);

export function hasDatabaseConfig(): boolean {
  return Boolean(process.env.DATABASE_URL || process.env.PLATFORM_RELATIONSHIPS);
}

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

function buildConnectionStringFromRelationships(): string | undefined {
  const raw = process.env.PLATFORM_RELATIONSHIPS;
  if (!raw) return undefined;

  const parsed = decodeMaybeBase64Json(raw);
  const candidates = Object.values(parsed).filter(Array.isArray) as PlatformRelationship[][];

  for (const relList of candidates) {
    const chosen =
      relList.find((r) => String(r?.query?.is_master) === 'true') ??
      relList.find((r) => typeof r?.host === 'string' && typeof r?.username === 'string');
    if (!chosen?.host || !chosen.username) continue;

    const username = encodeURIComponent(chosen.username);
    const password = encodeURIComponent(chosen.password ?? '');
    const host = chosen.host;
    const port = Number(chosen.port ?? 5432);
    const dbName = String(chosen.path ?? '').replace(/^\//, '') || 'main';
    return `postgresql://${username}:${password}@${host}:${port}/${dbName}`;
  }

  return undefined;
}

function resolveConnectionString(): string {
  const fromEnv = process.env.DATABASE_URL;
  if (fromEnv) return fromEnv;
  const fromPlatform = buildConnectionStringFromRelationships();
  if (fromPlatform) return fromPlatform;
  throw new Error('DATABASE_URL or PLATFORM_RELATIONSHIPS is required');
}

export function getPool(): PgPool {
  if (process.env.NODE_ENV === 'test') {
    throw new Error('PostgreSQL pool is disabled in tests');
  }
  if (!pool) {
    const { Pool } = require('pg') as { Pool: new (opts: { connectionString: string; max: number }) => PgPool };
    pool = new Pool({
      connectionString: resolveConnectionString(),
      max: 10
    });
  }
  return pool;
}
