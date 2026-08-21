import { config as loadDotenv } from "dotenv";
import { fileURLToPath } from "node:url";

import { loadConfig } from "@execloom/config";
import { createApp } from "./app.js";

loadDotenv({ path: fileURLToPath(new URL("../../../.env", import.meta.url)) });

const config = loadConfig();
const app = createApp();

const server = app.listen(config.API_PORT, () => {
  console.log(`API listening on port ${config.API_PORT}`);
});

process.on("SIGTERM", () => {
  server.close(() => {
    console.log("API server closed");
  });
});
