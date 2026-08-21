import express from "express";
import type { HealthResponse } from "@execloom/contracts";

export function createApp() {
  const app = express();

  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => {
    const response: HealthResponse = {
      service: "api",
      status: "ok",
      timestamp: new Date().toISOString()
    };

    res.json(response);
  });

  return app;
}
