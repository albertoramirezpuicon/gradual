# Deploying Gradual (D55)

**Target:** the same EC2 instance as Admisiones360. Gradual sits behind nginx with HTTPS, runs under PM2, and is deployed by a self-hosted GitHub Actions runner.
**Database:** shared RDS (`a360MoodleManual`), `gradual_*` tables, `gradual` MySQL user (D33/D34).

| | Value |
|---|---|
| Production directory | `/home/ubuntu/gradual` |
| Runner (name, label and folder) | `gradual-runner` (`/home/ubuntu/gradual-runner`) |
| Ports (127.0.0.1 only) | web **3110**, api **4110** (set in `ecosystem.config.cjs`) |
| PM2 processes | `gradual-api`, `gradual-web` |
| Workflow | `.github/workflows/deploy.yml` |

## How a deploy works

On every push to `main` (or "Run workflow" in GitHub → Actions → Deploy Gradual) the runner does the following:

1. Checks out and verifies the repo, and checks that `apps/api/.env` exists in production.
2. Runs `npm ci`, a typecheck, and `npm run build` (shared, api, web).
3. `rsync --delete` copies the built tree to `/home/ubuntu/gradual`. It never touches `.env` files or `node_modules`.
4. Runs `npm ci --omit=dev --ignore-scripts` in production.
5. Runs `npm run migrate:prod`. If it fails (e.g. a missing GRANT), PM2 is **not** reloaded and the current version keeps running.
6. Runs `pm2 reload` (or `pm2 start` the first time) and `pm2 save`.
7. Runs a health check on both ports.

## One-time setup

### AWS
1. **DNS:** an A record for the subdomain (e.g. `gradual.genia.pro`) pointing to the EC2's IP.
2. **S3:** production uses the same bucket as development, **`gradual-dev`** (`us-east-2`). Dev and prod share the `gradual_*` tables, so stored keys must resolve in both. Add the production origin to its CORS:
   ```json
   [{ "AllowedOrigins": ["http://localhost:3000", "http://192.168.0.7:3000", "https://gradual.genia.pro"], "AllowedMethods": ["PUT", "GET"], "AllowedHeaders": ["*"], "MaxAgeSeconds": 3000 }]
   ```
3. **IAM:** attach `gradual-app-policy` (already scoped to `arn:aws:s3:::gradual-dev/*` + SES send) to the **EC2 instance role**.
4. **SES:** `genia.pro` must be verified in `us-east-2`. If the account is still in the sandbox, request production access before inviting real clients.

### Server
1. `mkdir -p /home/ubuntu/gradual/apps/api`
2. Create `/home/ubuntu/gradual/apps/api/.env` from `apps/api/.env.production.example`.
3. **GitHub runner:** in the repo, go to Settings → Actions → Runners → New self-hosted runner (Linux, ARM64). Naming policy: the runner and its folder are called `[project]-runner`, so install it in `/home/ubuntu/gradual-runner`, with runner name and label `gradual-runner`, and install it as a service (`sudo ./svc.sh install ubuntu && sudo ./svc.sh start`).
4. **nginx:** site file named after the FQDN (policy): `/etc/nginx/sites-available/gradual.genia.pro.conf`, from `docs/deploy/gradual.genia.pro.conf`, symlinked into `sites-enabled`. Then `sudo nginx -t && sudo systemctl reload nginx`, then `sudo certbot --nginx -d gradual.genia.pro`.
5. First deploy: push to `main` or run the workflow manually.
6. Create the admin once:
   ```bash
   cd /home/ubuntu/gradual
   npm run create-admin:prod -w @gradual/api -- --email <her email> --name "<her name>" --tenant "<consultancy>" --domain <subdomain>
   ```

7. Create the platform owner once (D65). Use a separate address so the tenant admin account stays as it is:
   ```bash
   cd /home/ubuntu/gradual
   npm run create-superadmin:prod -w @gradual/api -- --email <alias>+platform@gmail.com --name "<name>"
   ```

## New tenants (D62/D63)
Create the tenant in **Plataforma → Nuevo tenant**. Its page then shows the exact steps to copy: DNS A record, nginx site file `<fqdn>.conf`, certbot, and the origin to add to the `gradual-dev` CORS rule. No deploy or restart is needed.

## Smoke test after the first deploy
- `https://<subdomain>` shows the login with HTTPS.
- Upload the logo (tests S3 PUT and CORS).
- Invite a test client; the email arrives (tests SES).
- The client opens a resource (tests S3 GET) and runs a CV analysis (tests the LLM keys).

## Rules
- **New tables:** run the `GRANT` for any new `gradual_*` table with the RDS master user *before* pushing the migration (D34, `docs/sql/`). Otherwise the deploy stops at the migration step, safely.
- **Single API instance:** the CV worker and the daily maintenance job run inside `gradual-api` (D49/D54). Don't scale it with PM2 cluster mode.
- **Logs:** `pm2 logs gradual-api` / `pm2 logs gradual-web`.

## Go-live cleanup (optional, once)
Development and production share the `gradual_*` tables. To start production empty, run this with the RDS master user **before the first deploy**. The GRANTs survive `DROP TABLE`.

```sql
SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS
  `a360MoodleManual`.`gradual_cv_runs`, `a360MoodleManual`.`gradual_cv_prompts`,
  `a360MoodleManual`.`gradual_stage_completions`, `a360MoodleManual`.`gradual_route_assignments`,
  `a360MoodleManual`.`gradual_resources`, `a360MoodleManual`.`gradual_stages`, `a360MoodleManual`.`gradual_routes`,
  `a360MoodleManual`.`gradual_consents`, `a360MoodleManual`.`gradual_privacy_policies`,
  `a360MoodleManual`.`gradual_sessions`, `a360MoodleManual`.`gradual_auth_tokens`, `a360MoodleManual`.`gradual_users`,
  `a360MoodleManual`.`gradual_tenant_settings`, `a360MoodleManual`.`gradual_tenants`,
  `a360MoodleManual`.`gradual_knex_migrations`, `a360MoodleManual`.`gradual_knex_migrations_lock`;
SET FOREIGN_KEY_CHECKS = 1;
```
