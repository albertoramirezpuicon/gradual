import { createApp } from "./app.js";
import { env } from "./lib/env.js";
import { startCvWorker } from "./lib/cv.js";

createApp().listen(env.PORT, () => {
  console.log(`Gradual API listening on :${env.PORT} (${env.NODE_ENV})`);
  // Background processing of CV improver runs (D49)
  startCvWorker();
});
