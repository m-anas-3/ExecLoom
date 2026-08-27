import { Router } from "express";
import { triggerExecutionRequestSchema } from "@execloom/contracts";
import { z } from "zod";

import {
  ExecutionServiceError,
  getExecution,
  triggerExecution
} from "./executions.service.js";

const uuidSchema = z.string().uuid();

export function createExecutionRoutes() {
  const router = Router();

  router.post("/workflows/:workflowId/executions", async (req, res, next) => {
    try {
      const ownerId = parseOwnerId(req.header("x-user-id"));
      const workflowId = uuidSchema.parse(req.params.workflowId);
      const body = triggerExecutionRequestSchema.safeParse(req.body);

      if (!body.success) {
        res.status(400).json({
          code: "VALIDATION_ERROR",
          message: "Invalid execution request body",
          details: body.error.flatten()
        });
        return;
      }

      const execution = await triggerExecution(ownerId, workflowId, body.data);

      res.status(202).json(execution);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          code: "VALIDATION_ERROR",
          message: "Invalid workflow id"
        });
        return;
      }

      handleExecutionError(error, res, next);
    }
  });

  router.get("/executions/:id", async (req, res, next) => {
    try {
      const ownerId = parseOwnerId(req.header("x-user-id"));
      const executionId = uuidSchema.parse(req.params.id);
      const execution = await getExecution(ownerId, executionId);

      res.json(execution);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          code: "VALIDATION_ERROR",
          message: "Invalid execution id"
        });
        return;
      }

      handleExecutionError(error, res, next);
    }
  });

  return router;
}

function parseOwnerId(value: string | undefined): string {
  const parsed = uuidSchema.safeParse(value);

  if (!parsed.success) {
    throw new ExecutionServiceError(
      401,
      "MISSING_OWNER",
      "Provide a valid x-user-id header until auth is implemented"
    );
  }

  return parsed.data;
}

function handleExecutionError(
  error: unknown,
  res: { status: (statusCode: number) => { json: (body: unknown) => void } },
  next: (error: unknown) => void
) {
  if (error instanceof ExecutionServiceError) {
    res.status(error.statusCode).json({
      code: error.code,
      message: error.message
    });
    return;
  }

  next(error);
}
