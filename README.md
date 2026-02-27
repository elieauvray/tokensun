# TokenSun

TokenSun is an Upsun plugin app for managing LLM provider connections and credentials across providers.

This repository is implemented as a **stateful plugin app**:
- PostgreSQL-backed shared persistence
- Runtime migrations at startup
- Session/workspace payload is encrypted before storage

## Features

- Multi-provider connection management:
  - OpenAI
  - Anthropic (Claude)
  - Gemini (API key)
  - Mistral
- Connection-focused plugin flow (variable provisioning UI disabled)
- Usage + cost dashboard with timeline buckets:
  - hour
  - week
  - month
  - year
- CSV export
- Encrypted secret storage (AES-256-GCM)
- Shared server-side app state
- API input validation with `zod`
- Per-workspace/session rate limiting

## Architecture

- Frontend: Vue 3 + TypeScript + PrimeVue + Chart.js
- Backend: Fastify + TypeScript
- Deployment pattern: SPA served from `dist` + Node server process for `/api/*`
- Plugin integration: `manifest.json` + `.upsun/config.yaml`

## Shared Persistence (Important)

TokenSun now runs with shared PostgreSQL persistence.

What this means:
- Connection metadata, encrypted provider secrets, and usage buckets are stored server-side in PostgreSQL.
- State is shared across users of the same deployed environment.
- Cookie loss no longer removes app state.

## Repository Layout

```text
manifest.json
.upsun/config.yaml
src/
  main.ts
  router/
  views/
  server/
```

## Requirements

- Node.js 22
- Upsun project/environment for deployment
- One runtime secret set in Upsun:
  - `TOKENSUN_MASTER_KEY` (base64, 32 bytes)

Generate a valid master key:

```bash
openssl rand -base64 32
```

## Local Development

Install and run:

```bash
npm ci
npm run dev
```

Build and run server build:

```bash
npm run build
TOKENSUN_MASTER_KEY="<base64-32-byte-key>" npm start
```

Run tests:

```bash
npm test
```

## Upsun Deployment

This app uses:
- `.upsun/config.yaml` for build/start + static serving
- deploy hook to copy `manifest.json` into the writable plugin mount and rewrite localhost URL to deployed route

### Deploy steps

1. Push this repository to your Upsun project/environment.
2. Set runtime environment variable `TOKENSUN_MASTER_KEY` (sensitive).
3. Confirm health endpoint:
   - `https://<your-app-domain>/healthz`
4. Confirm plugin manifest endpoint:
   - `https://<your-app-domain>/manifest.json`

## Install as Upsun Plugin

Install the plugin exactly like other Upsun plugins:

1. Open `https://console.upsun.com/-/add-plugin`
2. Click **Add plugin**
3. Enter manifest URL:
   - `https://<your-app-domain>/manifest.json`
4. Click **Create**

## First-Time User Flow

1. Open **Connections**.
2. Bootstrap workspace session with:
   - Upsun API token
   - Upsun organization ID
   - Upsun project ID
3. Create one or more provider connections.
4. Test each connection.
5. Open **Provision** and push `TOKENSUN_*` variables to project/environment.
6. Open **Dashboard** to refresh/query usage and export CSV.

## Upsun Variable Contract

Connection slug format:
- `CONN = "C" + first 8 chars of connection UUID (uppercase)`

Variables written:
- `TOKENSUN_DEFAULT_CONNECTION`
- `TOKENSUN_CONNECTIONS`
- `TOKENSUN_<CONN>_PROVIDER`
- `TOKENSUN_<CONN>_BASE_URL`
- `TOKENSUN_<CONN>_API_KEY` (sensitive)

Provider-specific extras:
- OpenAI:
  - `TOKENSUN_<CONN>_OPENAI_ORG`
  - `TOKENSUN_<CONN>_OPENAI_PROJECT`
- Anthropic:
  - `TOKENSUN_<CONN>_ANTHROPIC_VERSION`
- Gemini:
  - uses `TOKENSUN_<CONN>_API_KEY`
- Mistral:
  - uses `TOKENSUN_<CONN>_API_KEY`

Secret variable defaults:
- `sensitive=true`
- `visible_runtime=true`
- `visible_build=false`
- `inheritable=false`

## API Reference

### Auth

- `POST /api/auth/bootstrap`
  - body: `{ upsunApiToken, upsunOrgId, upsunProjectId }`

### Connections

- `GET /api/connections`
- `POST /api/connections`
- `POST /api/connections/:id/test`
- `PUT /api/connections/:id`
- `DELETE /api/connections/:id`

### Provision

- `POST /api/provision`
  - body: `{ connectionId, level, environmentId?, appScope?, makeDefault? }`

### Usage

- `POST /api/usage/refresh`
  - body: `{ connectionId?, start, end }`
- `GET /api/usage/query`
  - query: `granularity=hour|week|month|year&start=...&end=...&provider?&model?&connectionId?`

### Export

- `GET /api/export.csv`
  - same filters as usage query

## Security Model

- AES-256-GCM encryption for workspace/session payload and secrets before PostgreSQL storage
- Database constraint checks enforce encrypted payload format (base64url envelope, plaintext JSON rejected)
- Master key loaded from `TOKENSUN_MASTER_KEY`
- Fast fail on missing/invalid master key
- Server-side persistence (shared across users)
- Input validation on all routes with `zod`
- Redaction of sensitive fields in logs
- Route rate limiting
- Strict server-side allowlist for variable names (prevents arbitrary variable injection)

## Testing Scope

Included unit/API tests cover:
- crypto envelope encrypt/decrypt integrity
- pricing calculations
- usage bucket uniqueness upsert behavior
- connections CRUD validation behavior
- provision route allowlist behavior

## Known Limitations

- Current schema stores all state as a single encrypted payload row; very large histories should eventually be normalized into dedicated tables.
- Gemini/Mistral usage ingestion is currently estimate-oriented unless detailed provider usage signals are available.
- No realtime streaming updates (polling/refresh model only).

## License

Apache-2.0. See [LICENSE](./LICENSE).
