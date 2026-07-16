import { env } from "./config/env.js";
import { createApp } from "./app.js";
import { attachLiveSocket } from "./services/live.service.js";
import { startLyricsTranslationQueue } from "./services/lyrics-translation-queue.service.js";

const app = createApp();
startLyricsTranslationQueue();

for (const port of env.ports) {
  const server = app.listen(port, env.host, () => {
    console.log(`Translator is running on http://${env.host}:${port}`);
  });
  server.on("error", (err) => {
    console.error(`Could not bind port ${port}: ${err.message}`);
  });
  attachLiveSocket(server);
}
