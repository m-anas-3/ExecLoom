import { config as loadDotenv } from "dotenv";
import { fileURLToPath } from "node:url";

import { loadConfig } from "@execloom/config";

loadDotenv({ path: fileURLToPath(new URL("../../../.env", import.meta.url)) });

const config = loadConfig();

console.log("Worker booted", {
  nodeEnv: config.NODE_ENV,
  redisConfigured: Boolean(config.REDIS_URL),
  databaseConfigured: Boolean(config.DATABASE_URL)
});

process.on("SIGTERM", () => {
  console.log("Worker shutting down");
  process.exit(0);
});
