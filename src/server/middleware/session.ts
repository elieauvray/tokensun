import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import { getPool } from '../db/pool.js';
import { decodeStateFromStorage, encodeStateForStorage } from '../services/stateCodec.js';
import type { SessionState } from '../types/models.js';

const EMPTY_SESSION: SessionState = {
  connections: [],
  usage: []
};

function emptySession(): SessionState {
  return { connections: [], usage: [] };
}

function normalizeSession(input: SessionState | undefined): SessionState {
  const connections = input?.connections;
  const usage = input?.usage;
  return {
    workspace: input?.workspace,
    connections: Array.isArray(connections) ? connections : [],
    usage: Array.isArray(usage) ? usage : []
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
  let inMemoryState = normalizeSession(EMPTY_SESSION);

  fastify.addHook('onRequest', async (req) => {
    req.sessionId = 'shared';
    req.session = useInMemory ? normalizeSession(inMemoryState) : await loadStateFromDb();
  });

  fastify.decorateReply('commitSession', async function commitSession(nextSession: SessionState) {
    if (useInMemory) {
      inMemoryState = normalizeSession(nextSession);
      return;
    }
    await saveStateToDb(nextSession);
  });
};

export default fp(sessionPlugin);
