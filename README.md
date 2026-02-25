# TokenSun (Stateless MVP)

- Stateless runtime: no database, no server-side persistence.
- Session state is encrypted into an HttpOnly cookie with AES-256-GCM.
- `TOKENSUN_MASTER_KEY` must be a base64-encoded 32-byte key.
- Gemini and Mistral secret handling uses `TOKENSUN_<CONN>_API_KEY` (shared secret variable pattern), not provider-specific secret key variable names.
- Plugin install URL is `https://<your-tokensun-domain>/manifest.json` (Upsun Console -> `/-/add-plugin`).
