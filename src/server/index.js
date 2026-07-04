import { env } from "./config/env.js";
import { createApp } from "./app.js";
import { attachLiveSocket } from "./services/live.service.js";
import { gateEnabled } from "./services/auth.service.js";

const app = createApp();

const isLoopbackHost = (host) => ["127.0.0.1", "localhost", "::1"].includes(host);

if (!isLoopbackHost(env.host) && !gateEnabled()) {
  console.warn(
    "Warning: server is bound to a public host without OWNER_USERNAME/OWNER_PASSWORD set. " +
    "Anyone who can reach it can use the API keys configured above. Set both in .env to protect them."
  );
}

for (const port of env.ports) {
  const server = app.listen(port, env.host, () => {
    console.log(`Translator is running on http://${env.host}:${port}`);
  });
  server.on("error", (err) => {
    console.error(`Could not bind port ${port}: ${err.message}`);
  });
  attachLiveSocket(server);
}
