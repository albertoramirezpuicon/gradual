// PM2 process file for production (D55). Usage from the repo root:
//   pm2 start ecosystem.config.cjs && pm2 save
// Both processes bind to 127.0.0.1; nginx is the only public entry point.
module.exports = {
  apps: [
    {
      name: "gradual-api",
      cwd: "./apps/api",
      script: "dist/server.js",
      node_args: "--env-file=.env",
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
      instances: 1,
      exec_mode: "fork",
      max_memory_restart: "400M",
      time: true,
    },
  ],
};
