import { getPool } from './pool.js';

export async function migrate(): Promise<void> {
  if (process.env.NODE_ENV === 'test') return;

  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_state (
      id SMALLINT PRIMARY KEY DEFAULT 1,
      payload TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK (id = 1)
    );
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'app_state_payload_base64url_chk'
      ) THEN
        ALTER TABLE app_state
          ADD CONSTRAINT app_state_payload_base64url_chk
          CHECK (payload ~ '^[A-Za-z0-9_-]+$');
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'app_state_payload_not_json_chk'
      ) THEN
        ALTER TABLE app_state
          ADD CONSTRAINT app_state_payload_not_json_chk
          CHECK (left(payload, 1) <> '{');
      END IF;
    END $$;
  `);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  migrate().catch((err) => {
    console.error(err instanceof Error ? err.message : 'migration_error');
    process.exit(1);
  });
}
