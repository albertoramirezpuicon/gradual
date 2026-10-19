# Gradual

Employability platform: content routes organized in stages + CV improver.
Architecture and decisions: [`docs/Gradual_Architecture_v1.md`](docs/Gradual_Architecture_v1.md).

> **Language rule (D35):** every file is written and commented in English. Only customer-facing strings (UI text, user-visible error messages, emails, privacy policy) are in Spanish.

## Structure

```
apps/api         Express + Knex (MySQL)          → :4000
apps/web         Next.js 15 + Tailwind + Radix    → :3000 (proxies /api/v1/* to the API)
packages/shared  zod schemas, constants and shared types
docs/            architecture reference and SQL scripts
```

## Getting started (development)

Requirements: Node 22+, MySQL 8 (local or the shared RDS). Every table uses the `gradual_` prefix (D33).

```bash
npm install          # also builds packages/shared (postinstall)

# API
cp apps/api/.env.example apps/api/.env        # fill in DB credentials
npm run migrate
npm run create-admin -w @gradual/api -- --email you@example.com --name "First Last"

# Web
cp apps/web/.env.example apps/web/.env.local

# In two terminals
npm run dev:api
npm run dev:web
```

Open http://localhost:3000.

For the CV improver, set at least one LLM key in `apps/api/.env` (see `.env.example`). To try the flow without keys or cost, set `LLM_STUB=true` (development only).

With `MAIL_TRANSPORT=console`, emails (invitations, password recovery) are printed to the API console together with their link.

## Database user

The `gradual` MySQL user only has privileges on the `gradual_*` tables (D34). See `docs/sql/001_gradual_user.sql`.
**Before adding a migration that creates a new table**, grant privileges on that table name with the master user.

## Tests

```bash
# ⚠️ Tests WIPE the gradual_* tables: always use a separate database whose name ends in _test
# (e.g. gradual_test), reachable with the .env user or TEST_DB_* variables. Tests refuse to run otherwise.
npm test
```

## Status

- **F0 ✅** Tenant, authentication (invitation, login, password recovery, lockout after 10 attempts), versioned privacy-policy consent, branding settings (logo, colors, font).
- **F1 ✅** Routes (draft/published), stages, resources (file on S3, link, YouTube video, rich text), assignment to clients, per-stage progress marked by client or admin.
- **F2 ✅** CV improver: PDF upload, text extraction, versioned standards prompt, LLM rotation with failover (background worker), score + per-section comments, PDF/DOCX download, 5 runs/month per client.
- **F3 ✅** Client deletion requests and admin hard delete, daily retention purge (CV PDFs > 180 days) and cleanup, production setup (PM2, nginx, HTTPS). Deploy guide: [`docs/deploy/DEPLOY.md`](docs/deploy/DEPLOY.md).

## Notes

- The logo and resource files are uploaded straight to S3 with signed URLs. The bucket needs a CORS rule that allows `PUT` and `GET` from the web app's origin(s).
- For local testing from a phone on the LAN, set `ALLOWED_DEV_ORIGINS` in `apps/web/.env` and use your PC's IP in `APP_BASE_URL`.
- The privacy policy is seeded with a draft in `apps/api/src/db/seeds/privacy-policy-v1.ts`. It is edited from **Privacidad** in the admin panel. The panel shows a warning while `[BRACKETED]` fields remain.
