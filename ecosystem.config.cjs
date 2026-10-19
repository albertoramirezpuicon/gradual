// PM2 process file for production (D55). Used by .github/workflows/deploy.yml.
// Ports are defined HERE only (they override apps/api/.env), chosen not to clash with
// Admisiones360 on the same server. nginx proxies the public subdomain to them.
//   web  → 127.0.0.1:3110
//   api  → 127.0.0.1:4110
const API_PORT = 4110;
const WEB_PORT = 3110;

module.exports = {
  apps: [
    {
      name: "gradual-api",
      cwd: "./apps/api",
      script: "dist/server.js",
      // Secrets come from apps/api/.env; variables set below take precedence over it.
      node_args: "--env-file=.env",
      env: { NODE_ENV: "production", PORT: String(API_PORT), HOST: "127.0.0.1" },
      // One instance only: the CV worker and the maintenance job run inside this process (D49 / D54).
      instances: 1,
      exec_mode: "fork",
      max_memory_restart: "400M",
      time: true,
    },
    {
      name: "gradual-web",
      cwd: "./apps/web",
      script: "npm",
      args: "run start:prod",
      env: { NODE_ENV: "production", PORT: String(WEB_PORT), API_URL: `http://127.0.0.1:${API_PORT}` },
      instances: 1,
      exec_mode: "fork",
      max_memory_restart: "400M",
      time: true,
    },
  ],
};
