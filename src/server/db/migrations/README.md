This project uses PostgreSQL for shared persistence.

Schema is currently managed by `src/server/db/migrate.ts`, which creates:

- `app_state`: encrypted singleton payload containing workspace, connections, and usage data.
