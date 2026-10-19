# Deploying Gradual to production (D55)

Target: the existing EC2 instance (shared with Admisiones360), behind nginx with HTTPS, managed by PM2.
Database: shared RDS (`a360MoodleManual`), `gradual_*` tables, `gradual` MySQL user (D33/D34).

## 0. One-time AWS setup

1. **DNS:** create the subdomain (e.g. `gradual.genia.pro`) as an A record pointing to the EC2 public IP (or Elastic IP).
2. **S3 bucket `gradual-prod`** (region `us-east-2`). Block all public access stays ON. CORS:
   ```json
   [{ "AllowedOrigins": ["https://gradual.genia.pro"], "AllowedMethods": ["PUT", "GET"], "AllowedHeaders": ["*"], "MaxAgeSeconds": 3000 }]
   ```
3. **IAM:** update `gradual-app-policy` so its S3 resource covers the new bucket (`arn:aws:s3:::gradual-prod/*`). Then attach the policy to the **EC2 instance role**. No access keys go in `.env`.
4. **SES:** the sender domain (e.g. `genia.pro`) must be verified in `us-east-2`. If the SES account is still in the sandbox, emails only reach verified addresses. Request production access before inviting real clients.
5. **RDS security group:** the EC2 instance must be allowed on port 3306 (it already is for Admisiones360).

## 1. Get the code on the server

```bash
cd /srv            # or wherever Admisiones360 lives
git clone https://github.com/albertoramirezpuicon/gradual.git
cd gradual
npm ci             # also builds packages/shared (postinstall)
```

## 2. Environment files

```bash
cp apps/api/.env.production.example apps/api/.env   # fill in DB password, keys, domain
nano apps/api/.env
```

The web app needs no `.env` in production. Its default `API_URL=http://127.0.0.1:4000` is correct.

## 3. Build, migrate, create the admin

```bash
npm run build
npm run migrate:prod -w @gradual/api
npm run create-admin:prod -w @gradual/api -- --email <her email> --name "<her name>" --tenant "<consultancy name>" --domain gradual.genia.pro
```

`--domain` links the tenant to the subdomain (D8).

## 4. Start with PM2

```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 logs gradual-api --lines 20     # expect "listening on 127.0.0.1:4000", "CV worker started"
```

## 5. nginx + HTTPS

```bash
sudo cp docs/deploy/nginx-gradual.conf /etc/nginx/sites-available/gradual
sudo sed -i 's/gradual.example.com/gradual.genia.pro/' /etc/nginx/sites-available/gradual
sudo ln -s /etc/nginx/sites-available/gradual /etc/nginx/sites-enabled/gradual
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d gradual.genia.pro
```

## 6. Smoke test

- `https://gradual.genia.pro` shows the login screen with HTTPS.
- She logs in, uploads the logo and sets the brand (this tests S3 PUT and CORS).
- She invites a test client. The email must arrive (this tests SES).
- She uploads a resource and the client opens it (this tests S3 GET).
- The client runs a CV analysis (this tests the LLM keys).

## Updating later

```bash
cd /srv/gradual
git pull
npm ci
npm run build
npm run migrate:prod -w @gradual/api
pm2 restart gradual-api gradual-web
```

**New tables:** before running a migration that creates a new table, run its `GRANT` with the RDS master user (D34, see `docs/sql/`).

## Notes

- **Single API instance.** The CV worker (D49) and the daily maintenance job (D54) run inside `gradual-api`. Don't scale it to several PM2 instances without moving them to a separate process (`CV_WORKER=false` on the others).
- **Shared database, shared tables.** Development and production use the same `gradual_*` tables in `a360MoodleManual`. Test data created during development (test clients, routes, CV runs) is visible in production. See "Go-live cleanup" below.

## Go-live cleanup (optional, once)

To start production with empty tables, run this with the RDS master user **before step 3**, then run step 3:

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

The GRANTs survive dropping tables, so nothing else needs to change.
