import express from "express";
import type { HealthResponse } from "@execloom/contracts";
import { getDatabaseHealth } from "@execloom/db";

import { createAuthRoutes } from "./modules/auth/auth.routes.js";
import { requireAuth } from "./modules/auth/auth.middleware.js";
import { createCredentialRoutes } from "./modules/credentials/credentials.routes.js";
import { createExecutionRoutes } from "./modules/executions/executions.routes.js";
import { createWorkflowRoutes } from "./modules/workflows/workflows.routes.js";

export function createApp() {
  const app = express();

  app.use(express.json({ limit: "1mb" }));

  app.get("/health", async (_req, res) => {
    const database = await getDatabaseHealth();
    const response: HealthResponse = {
      service: "api",
      status: "ok",
      database,
      timestamp: new Date().toISOString(),
    };

    res.status(database.status === "ok" ? 200 : 503).json(response);
  });

  app.use("/auth", createAuthRoutes());
  app.use(requireAuth);
  app.use("/credentials", createCredentialRoutes());
  app.use(createExecutionRoutes());
  app.use("/workflows", createWorkflowRoutes());


  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      console.error(error);
      res.status(500).json({
        code: "INTERNAL_SERVER_ERROR",
        message: "Unexpected server error",
      });
    },
  );

  return app;
}
