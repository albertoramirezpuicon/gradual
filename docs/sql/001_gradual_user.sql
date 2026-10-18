-- =====================================================================
-- Gradual — database user with access ONLY to the gradual_* tables (D33/D34)
-- Run on the shared RDS with the administrator (master) user.
-- Executed on 2026-10-18 against a360MoodleManual.
--
-- MySQL does not support wildcards in table names, so privileges are granted
-- table by table. Because ALL PRIVILEGES includes CREATE, they can be granted
-- before the tables exist; migrations can then run as this same user.
-- F1 and F2 tables are already included. When a new table is added in the
-- future, add its GRANT line here (or in a new NNN_*.sql) and run it BEFORE
-- the migration that creates it.
-- =====================================================================

CREATE USER IF NOT EXISTS 'gradual'@'%' IDENTIFIED BY 'CHANGE_THIS_PASSWORD';

-- Knex migration bookkeeping
GRANT ALL PRIVILEGES ON `a360MoodleManual`.`gradual_knex_migrations`      TO 'gradual'@'%';
GRANT ALL PRIVILEGES ON `a360MoodleManual`.`gradual_knex_migrations_lock` TO 'gradual'@'%';

-- F0
GRANT ALL PRIVILEGES ON `a360MoodleManual`.`gradual_tenants`              TO 'gradual'@'%';
GRANT ALL PRIVILEGES ON `a360MoodleManual`.`gradual_tenant_settings`      TO 'gradual'@'%';
GRANT ALL PRIVILEGES ON `a360MoodleManual`.`gradual_users`                TO 'gradual'@'%';
GRANT ALL PRIVILEGES ON `a360MoodleManual`.`gradual_auth_tokens`          TO 'gradual'@'%';
GRANT ALL PRIVILEGES ON `a360MoodleManual`.`gradual_sessions`             TO 'gradual'@'%';
GRANT ALL PRIVILEGES ON `a360MoodleManual`.`gradual_privacy_policies`     TO 'gradual'@'%';
GRANT ALL PRIVILEGES ON `a360MoodleManual`.`gradual_consents`             TO 'gradual'@'%';

-- F1 (routes)
GRANT ALL PRIVILEGES ON `a360MoodleManual`.`gradual_routes`               TO 'gradual'@'%';
GRANT ALL PRIVILEGES ON `a360MoodleManual`.`gradual_stages`               TO 'gradual'@'%';
GRANT ALL PRIVILEGES ON `a360MoodleManual`.`gradual_resources`            TO 'gradual'@'%';
GRANT ALL PRIVILEGES ON `a360MoodleManual`.`gradual_route_assignments`    TO 'gradual'@'%';
GRANT ALL PRIVILEGES ON `a360MoodleManual`.`gradual_stage_completions`    TO 'gradual'@'%';

-- F2 (CV improver)
GRANT ALL PRIVILEGES ON `a360MoodleManual`.`gradual_cv_prompts`           TO 'gradual'@'%';
GRANT ALL PRIVILEGES ON `a360MoodleManual`.`gradual_cv_runs`              TO 'gradual'@'%';

-- Verification: expect 17 rows (1 USAGE + 16 table grants)
SHOW GRANTS FOR 'gradual'@'%';
