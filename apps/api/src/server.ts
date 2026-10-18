import { createApp } from "./app.js";
import { env } from "./lib/env.js";

createApp().listen(env.PORT, () => {
  console.log(`Gradual API listening on :${env.PORT} (${env.NODE_ENV})`);
});
