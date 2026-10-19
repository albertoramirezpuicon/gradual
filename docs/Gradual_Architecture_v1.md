# Gradual — Architecture v1

> Canonical reference document. Every decision is numbered, locked in order and cited by number. When a decision changes, it is updated here and the version is bumped.

**Status:** v1.5 · 2026-10-18 · F0, F1 and F2 built · Decisions D1–D51

---

## 1. Purpose

Gradual is a platform for a small employability consultancy. It has two modules:

1. **CV improver.** The client (or the consultant on their behalf) uploads a PDF CV. They get back an improved version that follows the consultant's standards, with comments per section and a download of the improved CV.
2. **Employability routes.** A space where the consultant organizes her content (CV guides, LinkedIn, networking, interviews, etc.) into routes made of configurable stages, and shares it with her clients. It replaces the current use of Google Drive.

v1 scale: 1 admin, ~30 clients.

---

## 2. Locked decisions

### Product

- **D1. Name:** Gradual.
- **D2. UI language:** Spanish only for everything users see (UI, emails, CV improver output). See D35 for code.
- **D3. Configurable branding:** a Branding page where the admin sets:
  - the logo (uploaded to S3);
  - primary and secondary colors;
  - a font (closed list of Google Fonts).
  Generic defaults apply until her brand identity is available.
- **D4. v1 scope:** documents and resources only. No exercises, fillable templates or session booking.

### Platform and infrastructure

- **D5. Stack:** same as Admisiones360.
  - Frontend: Next.js + Tailwind CSS + Radix UI primitives.
  - Backend: Node.js + Express, Knex (migrations run manually).
  - DB: MySQL on the shared RDS; every table uses the `gradual_` prefix (D33).
  - Files: S3. Email: SES.
  - LLM: OpenAI / Anthropic / Gemini rotation with failover.
  - PDF: `@react-pdf/renderer`.
- **D6. Hosting:** the same EC2 instance as Admisiones360, as a separate PM2 process with its own vhost/subdomain.
- **D7. Identifiers and time:** ULIDs; timestamps stored in UTC; displayed in `America/Lima`.
- **D8. Multi-tenant:** every business table has a `tenant_id`; the tenant is resolved by domain/subdomain. v1 has a single tenant. Not exposed commercially.

### Users and access

- **D9. Roles:** `admin` (consultant) and `client`.
- **D10. Authentication:** email + password (argon2id hash), session in an httpOnly cookie. Password recovery by email (SES) with a single-use token.
- **D11. Client onboarding:** by admin invitation only. The client receives an email to set a password and accept the privacy policy. No open sign-up.

### Routes and content

- **D12. Model:** Route → Stages (ordered, reorderable) → Resources (ordered).
- **D13. Multiple routes:** the admin can create several routes and assign routes to each client. A client can have more than one route assigned.
- **D14. Stage access:** all stages of an assigned route are visible from the start (no sequential unlocking).
- **D15. Resource types:**
  - `file`: PDF, DOCX or PPTX, stored in S3, downloaded through a short-lived signed URL.
  - `link`: external URL.
  - `video`: YouTube link, embedded. Videos are never uploaded to S3.
  - `text`: rich text edited in the platform.
- **D16. Progress:** tracked **per stage**. Both the client and the admin can mark a stage as done (and undo it). Who marked it and when is recorded.
- **D17. Migration from Drive:** content is uploaded into the platform (S3); no Google Drive integration.

### CV improver

- **D18. Who uses it:** the client on their own CV, and the admin on behalf of any client.
- **D19. Input:** PDF only. Text is extracted; a PDF with no extractable text (scanned/image) is rejected with a clear message. No OCR in v1.
- **D20. Configurable standards:** the improvement standards live in a versioned prompt the admin can edit. Each run stores the prompt version it used.
- **D21. Prompt split:**
  - **Standards** (editable by the admin): criteria, tone, desired structure, rules.
  - **Output contract** (fixed, in code): the structured JSON format the platform needs to render results. Editing the standards therefore cannot break the platform.
- **D22. Output:** both of the following.
  - (a) On screen: original vs. improved per section, with comments and an overall summary.
  - (b) A download of the improved CV as a PDF with a standard template, and as a DOCX so the client can keep editing it.
- **D23. History:** each client sees their previous runs; the admin sees everyone's.

### Personal data

- **D24. Consent:**
  - Accepting the privacy policy (Ley N.º 29733 and its regulation) is mandatory to activate the account.
  - The policy version, date and IP are recorded.
  - When a new policy version is published, acceptance is requested again.
- **D25. Retention and deletion:**
  - Original PDFs are deleted from S3 180 days after the run; the structured result is kept.
  - The admin can delete a client with all their data (hard delete, including S3 files).
  - The client can request deletion from their profile.
- **D26. LLM:** only the text extracted from the CV is sent to the provider, never the file. No provider that trains on API data is used.

---

## 3. Architecture

```
gradual/
  apps/
    web/        Next.js (admin + client), consumes the API
    api/        Express + Knex
  packages/
    shared/     types, validation (zod), constants
  docs/
```

- `api` exposes REST under `/api/v1`. Middleware order: tenant (by `Host`) → session → role.
- S3 uploads use presigned URLs issued by the API, with MIME type and size checks (max 20 MB per file, 5 MB per CV).
- CV improver runs execute asynchronously (simple MySQL queue + worker in the same process); the frontend polls for status.
- Web routes are in English (`/forgot-password`, `/invitation`, `/admin/clients`, …); only their visible text is Spanish (D35).

---

## 4. Data model (draft)

Every table uses the `gradual_` prefix (D33); it is omitted below for brevity.

| Table | Main columns |
|---|---|
| `tenants` | id, slug, name, domain |
| `tenant_settings` | tenant_id, brand_name, primary_color, secondary_color, font, logo_s3_key |
| `users` | id, tenant_id, role (admin/client), email, name, password_hash, status (invited/active/deleted), failed_logins, locked_until, last_login_at, invited_by, created_at |
| `auth_tokens` | id, user_id, type (invitation/reset), token_hash, expires_at, used_at |
| `sessions` | id, user_id, token_hash, expires_at, ip, user_agent |
| `privacy_policies` | id, tenant_id, version, content, published_by, published_at |
| `consents` | id, user_id, policy_id, accepted_at, ip |
| `routes` | id, tenant_id, title, description, published, position, created_at, updated_at |
| `stages` | id, route_id, title, description, position |
| `resources` | id, stage_id, type (file/link/video/text), title, description, s3_key, file_name, mime, size_bytes, url, youtube_id, content_html, position |
| `route_assignments` | id, route_id, user_id, assigned_by, assigned_at |
| `stage_completions` | id, stage_id, user_id, marked_by, marked_at |
| `cv_prompts` | id, tenant_id, version, standards, created_by, created_at (highest version = active) |
| `cv_runs` | id, tenant_id, user_id, started_by, source_s3_key, source_file_name, extracted_text, prompt_id, status (queued/processing/done/failed), attempts, provider, model, result_json, initial_score, final_score, tokens_in, tokens_out, cost_usd, error, created_at, started_at, finished_at |
| `tenant_settings` (F2 column) | cv_footer_text |

---

## 5. CV improver output contract (draft)

Keys are in English; values (the generated content) are in Spanish.

```json
{
  "summary": "string",
  "initialScore": 0,
  "finalScore": 0,
  "sections": [
    {
      "name": "Perfil profesional",
      "original": "string",
      "improved": "string",
      "comments": ["string"]
    }
  ],
  "improvedCv": {
    "name": "", "headline": "", "contact": {},
    "profile": "", "experience": [], "education": [],
    "skills": [], "languages": [], "other": []
  }
}
```

`improvedCv` feeds the PDF/DOCX template. The output is validated with zod. On failure it is retried once, then the next provider is used.

---

## 6. Screens

**Admin**
- Dashboard.
- Clients: invite, view, assign routes, view progress, delete.
- Routes: create and edit routes, reorder stages and resources.
- CV improver: run for a client, view history.
- CV standards: edit the prompt and view its versions.
- Settings: branding and privacy policy.

**Client**
- My routes: stages, resources, mark a stage as done.
- Improve my CV: upload the PDF, view the result and download it.
- History.
- Profile: change password, request deletion.

---

## 7. Build phases

| Phase | Content | Acceptance criterion |
|---|---|---|
| **F0** | Monorepo, Knex + migrations, tenant, auth (invitation, login, reset), consent, branding settings | Admin invites a client; the client activates the account, accepts the policy and signs in with the branding applied |
| **F1** | Routes, stages, resources, S3, assignment, progress | Admin builds a route with the 4 resource types and assigns it; the client sees it, downloads files and marks stages; the admin sees progress |
| **F2** | CV improver: upload, extraction, versioned prompt, LLM with failover, comparison view, PDF/DOCX | Client uploads a PDF and gets the result and downloads; the admin edits the standards and the new version applies |
| **F3** | Retention, deletion, SES emails, EC2 deployment, polish | 180-day purge verified; full deletion verified; in production with HTTPS |

---

## 8. Security

- Rate limiting on login and password reset.
- Temporary lockout after 10 failed attempts.
- Every query filters by `tenant_id` and, for the client role, by `user_id`.
- S3 signed URLs last 5 minutes.
- Private bucket.

## 9. LLM costs

Tokens and cost per run are recorded in `cv_runs` for monitoring. Limit: 5 runs per client per calendar month (Lima time); the admin has no limit (D30).

## 10. Emails (SES)

Invitation, password recovery, deletion-request confirmation. The sender is configurable through an environment variable (D31).

## 11. Out of scope for v1

- OCR.
- DOCX input.
- Google Drive or LinkedIn integration.
- Session booking.
- Interactive exercises.
- WhatsApp.
- Mobile app.

## 12. Closing decisions (previously open)

- **D27. (P1)** Clients join by admin invitation only; there is no open sign-up.
- **D28. (P2)** Original CV PDFs are purged from S3 180 days after the run.
- **D29. (P3)** The improved CV can be downloaded as PDF and as DOCX.
- **D30. (P4)** Maximum 5 CV improver runs per client per calendar month (Lima time). These don't count toward the limit:
  - runs the admin starts on a client's behalf;
  - failed runs.
- **D31. (P5)** A temporary sender and subdomain are used, on a domain already verified in SES.
  - They are set through environment variables (`MAIL_FROM`, `APP_BASE_URL`).
  - Switching to the final ones requires no code change.
- **D32. (P6)** The privacy policy is seeded with an editable draft, editable under Settings. Each publish creates a new version and requests acceptance again (D24).
- **D33.** Every table in the project uses the `gradual_` prefix, including the migrations table (`gradual_knex_migrations`), because the DB is shared with other projects.
  - An automated test fails if any table lacks the prefix.
  - Tests only run against a database whose name ends in `_test`.
- **D34.** DB: `a360MoodleManual` (shared).
  - The `gradual`@`%` user has `ALL PRIVILEGES` only on the `gradual_*` tables listed in `docs/sql/001_gradual_user.sql`. It cannot see any other table.
  - MySQL does not support wildcards in table names. Every new table therefore needs its `GRANT` line, run with the master user **before** the migration that creates it.
  - Each new migration ships with its own `docs/sql/NNN_*.sql` script.
- **D35. Language:** every file is written and commented in English, with no exceptions. This covers:
  - code, identifiers, DB columns and enum values;
  - URL paths, comments and console output;
  - tests, docs, README and SQL.
  
  Only customer-facing strings are in Spanish: UI text, error messages shown to users, emails and the privacy policy.

## 13. F1 decisions

- **D36. Ordering:** routes, stages and resources are reordered with ↑/↓ buttons, not drag and drop. Buttons work well on phones and are accessible.
- **D37. Text resources:** edited with TipTap using a limited toolbar: bold, italic, two heading levels, lists, quote and link.
  - The API sanitizes the HTML on save with `sanitize-html`.
  - Links are forced to `target="_blank" rel="noopener noreferrer"`.
  - Only http, https and mailto schemes are allowed.
- **D38. File resources:** PDF, DOCX or PPTX, up to 20 MB.
  - The browser uploads straight to S3 through a presigned URL (with an upload progress bar).
  - The API then verifies the object's real type and size with `HeadObject`.
  - Downloads go through `/api/v1/resources/:id/download`. It checks access and redirects to a 5-minute signed URL that carries the original file name. PDFs open inline; other types download.
- **D39. Draft/published:** a new route starts as a draft. Clients only see routes that are both assigned to them and published.
- **D40. Deletion:** deleting a route, stage or resource is a hard delete after a confirmation dialog.
  - It cascades to child rows, assignments and completions.
  - It removes the S3 files best-effort.
  - Replacing a file, or changing a resource's type, also deletes the old object.
- **D41. Admin progress:** each route has a "Progreso" tab with a client × stage matrix. Each client has a detail page where the admin:
  - assigns routes (replace-the-set semantics; progress is kept if a route is re-assigned);
  - sees each stage with who completed it and when;
  - can mark or unmark stages herself.
- **D42. YouTube:** the API accepts `watch`, `youtu.be`, `shorts`, `embed` and `live` URLs and stores the 11-character video ID.
  - The client sees a thumbnail first.
  - The iframe loads from `youtube-nocookie.com` only when tapped.
- **D43. Links:** only `http://` and `https://` URLs are accepted. They open in a new tab with `noopener noreferrer`.

## 14. F2 decisions

- **D44. LLM keys:** dedicated to Gradual (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`), so its costs are visible separately.
  - A provider is used only when its key is set.
  - The order comes from `LLM_PROVIDERS`; model IDs come from `*_MODEL`.
  - Optional `LLM_PRICING` records the cost per run.
  - Plain HTTPS calls are used, with no provider SDKs.
- **D45. Default standards:** version 1 is seeded from `apps/api/src/db/seeds/cv-standards-v1.ts` (Spanish, consultant-facing). It covers structure, achievements with metrics, action verbs, ATS compatibility, at most 2 pages, and the scoring rubric.
- **D46. Result:** a 0–100 score before and after, a summary addressed to the candidate, and per section the original, the improved text and 1–4 comments.
- **D47. CV template:** a single neutral, ATS-friendly, one-column template with standard fonts and no consultant branding (the CV belongs to the candidate). The footer text is configurable under CV standards; the default is "Creado con la ayuda de Gradual", and an empty value hides it.
- **D48. No invented facts:** the system prompt forbids adding employers, dates, numbers, tools or achievements that aren't in the original.
  - Missing metrics become bracketed placeholders (e.g. `[agrega una cifra: %]`). The UI highlights them and suggests the editable Word download.
  - Sensitive data (DNI, date of birth, marital status, photo) is dropped.
  - CV text is wrapped in `<cv>` tags and treated as data (prompt-injection guard).
- **D49. Processing:** asynchronous, through a MySQL-backed queue and an in-process worker that polls every 2 s and handles one run at a time.
  - Runs are claimed atomically (no double processing).
  - Each provider gets two tries (bad JSON counts as a failure), then the next provider is used.
  - The output is validated with zod.
  - Runs stuck in `processing` for more than 10 minutes are re-queued, up to 3 attempts.
  - Users only ever see a generic error; provider details stay in `cv_runs.error`.
  - `LLM_STUB=true` (development only, ignored in production) returns a sample result for testing without keys or cost.
- **D50. Downloads:** PDF (`@react-pdf/renderer`) and DOCX (`docx`) are generated on demand from the stored result. Nothing extra is stored. The file is named "CV - <name>.pdf/.docx".
- **D51. Visibility:** runs belong to the candidate.
  - Admin-started runs appear in the client's history, marked "iniciado por la consultora", and don't count toward the monthly quota.
  - Clients only ever see their own runs.
- **Input limits:** PDF only, up to 5 MB and 6 pages. PDFs with fewer than 200 characters of extractable text are rejected as scanned. The upload is deleted whenever a run is rejected.
