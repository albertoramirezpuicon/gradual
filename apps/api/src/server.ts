import { createApp } from "./app.js";
import { env } from "./lib/env.js";
import { startCvWorker } from "./lib/cv.js";
import { startMaintenance } from "./lib/maintenance.js";

createApp().listen(env.PORT, env.HOST, () => {
  console.log(`Gradual API listening on ${env.HOST}:${env.PORT} (${env.NODE_ENV})`);
  // Background processing of CV improver runs (D49)
  startCvWorker();
  // Daily retention purge and cleanup (D28 / D54)
  startMaintenance();
});
