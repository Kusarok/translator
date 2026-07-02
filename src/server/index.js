import { env } from "./config/env.js";
import { createApp } from "./app.js";

const app = createApp();

app.listen(env.port, env.host, () => {
  console.log(`Translator is running on http://${env.host}:${env.port}`);
});
