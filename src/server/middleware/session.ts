import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { getPool } from '../db/pool.js';
import { hasDatabaseConfig } from '../db/pool.js';
import { decodeStateFromStorage, encodeStateForStorage } from '../services/stateCodec.js';
import type { SessionState } from '../types/models.js';

const EMPTY_SESSION: SessionState = {
  connections: [],
  usage: [],
  usageBudgets: {}
};

function emptySession(): SessionState {
  return { connections: [], usage: [], usageBudgets: {} };
}

function normalizeSession(input: SessionState | undefined): SessionState {
  const connections = input?.connections;
  const usage = input?.usage;
  const usageBudgets = input?.usageBudgets;
  return {
    workspace: input?.workspace,
    connections: Array.isArray(connections) ? connections : [],
    usage: Array.isArray(usage) ? usage : [],
    usageBudgets:
      usageBudgets && typeof usageBudgets === 'object'
        ? Object.fromEntries(Object.entries(usageBudgets).filter(([, value]) => typeof value === 'number'))
        : {}
  };
}

async function loadStateFromDb(): Promise<SessionState> {
  const pool = getPool();
  try {
    const result = await pool.query<{ payload: string }>('SELECT payload FROM app_state WHERE id = 1');
    if (!result.rowCount || !result.rows[0]?.payload) return emptySession();
    return normalizeSession(decodeStateFromStorage(result.rows[0].payload));
  } catch {
    return emptySession();
  }
}

function resolveStateFilePath(): string {
  if (process.env.TOKENSUN_STATE_FILE) return process.env.TOKENSUN_STATE_FILE;
  return join(process.cwd(), '.data', 'tokensun-state.enc');
}

async function loadStateFromFile(filePath: string): Promise<SessionState> {
  try {
    const raw = await readFile(filePath, 'utf8');
    return normalizeSession(decodeStateFromStorage(raw));
  } catch {
    return emptySession();
  }
}

async function saveStateToFile(filePath: string, nextSession: SessionState): Promise<void> {
  const normalized = normalizeSession(nextSession);
  const encoded = encodeStateForStorage(normalized);
  const dir = dirname(filePath);
  const tempPath = `${filePath}.tmp`;
  await mkdir(dir, { recursive: true });
  await writeFile(tempPath, encoded, 'utf8');
  await rename(tempPath, filePath);
}

async function saveStateToDb(nextSession: SessionState): Promise<void> {
  const pool = getPool();
  const normalized = normalizeSession(nextSession);
  const encoded = encodeStateForStorage(normalized);
  await pool.query(
    `
      INSERT INTO app_state (id, payload, updated_at)
      VALUES (1, $1, NOW())
      ON CONFLICT (id)
      DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()
    `,
    [encoded]
  );
}

const sessionPlugin: FastifyPluginAsync = async (fastify) => {
  const useInMemory = process.env.NODE_ENV === 'test';
  const useFileFallback = !useInMemory && !hasDatabaseConfig();
  const fallbackStateFile = resolveStateFilePath();
  let inMemoryState = normalizeSession(EMPTY_SESSION);

  fastify.addHook('onRequest', async (req) => {
    req.sessionId = 'shared';
    if (useInMemory) {
      req.session = normalizeSession(inMemoryState);
      return;
    }
    req.session = useFileFallback ? await loadStateFromFile(fallbackStateFile) : await loadStateFromDb();
  });

  fastify.decorateReply('commitSession', async function commitSession(nextSession: SessionState) {
    if (useInMemory) {
      inMemoryState = normalizeSession(nextSession);
      return;
    }
    if (useFileFallback) {
      await saveStateToFile(fallbackStateFile, nextSession);
      return;
    }
    await saveStateToDb(nextSession);
  });
};

export default fp(sessionPlugin);
