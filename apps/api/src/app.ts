import express from "express";
import type { HealthResponse } from "@execloom/contracts";
import { getDatabaseHealth } from "@execloom/db";

export function createApp() {
  const app = express();

  app.use(express.json({ limit: "1mb" }));

  app.get("/health", async (_req, res) => {
    const database = await getDatabaseHealth();
    const response: HealthResponse = {
      service: "api",
      status: "ok",
      database,
      timestamp: new Date().toISOString()
    };

    res.status(database.status === "ok" ? 200 : 503).json(response);
  });

  return app;
}
