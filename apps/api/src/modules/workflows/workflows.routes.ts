import { Router } from "express";
import { createWorkflowRequestSchema } from "@execloom/contracts";
import { z } from "zod";

import {
  createWorkflow,
  getWorkflow,
  listWorkflows,
  publishWorkflow,
  WorkflowServiceError
} from "./workflows.service.js";

const uuidSchema = z.string().uuid();

export function createWorkflowRoutes() {
  const router = Router();

  router.post("/", async (req, res, next) => {
    try {
      const ownerId = parseOwnerId(req.header("x-user-id"));
      const body = createWorkflowRequestSchema.safeParse(req.body);

      if (!body.success) {
        res.status(400).json({
          code: "VALIDATION_ERROR",
          message: "Invalid workflow request body",
          details: body.error.flatten()
        });
        return;
      }

      const workflow = await createWorkflow(ownerId, body.data);

      res.status(201).json(workflow);
    } catch (error) {
      handleWorkflowError(error, res, next);
    }
  });

  router.get("/", async (req, res, next) => {
    try {
      const ownerId = parseOwnerId(req.header("x-user-id"));
      const workflows = await listWorkflows(ownerId);

      res.json({ workflows });
    } catch (error) {
      handleWorkflowError(error, res, next);
    }
  });

  router.post("/:id/publish", async (req, res, next) => {
    try {
      const ownerId = parseOwnerId(req.header("x-user-id"));
      const workflowId = uuidSchema.parse(req.params.id);
      const workflow = await publishWorkflow(ownerId, workflowId);

      res.json(workflow);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          code: "VALIDATION_ERROR",
          message: "Invalid workflow id"
        });
        return;
      }

      handleWorkflowError(error, res, next);
    }
  });

  router.get("/:id", async (req, res, next) => {
    try {
      const ownerId = parseOwnerId(req.header("x-user-id"));
      const workflowId = uuidSchema.parse(req.params.id);
      const workflow = await getWorkflow(ownerId, workflowId);

      res.json(workflow);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          code: "VALIDATION_ERROR",
          message: "Invalid workflow id"
        });
        return;
      }

      handleWorkflowError(error, res, next);
    }
  });

  return router;
}

function parseOwnerId(value: string | undefined): string {
  const parsed = uuidSchema.safeParse(value);

  if (!parsed.success) {
    throw new WorkflowServiceError(
      401,
      "MISSING_OWNER",
      "Provide a valid x-user-id header until auth is implemented"
    );
  }

  return parsed.data;
}

function handleWorkflowError(
  error: unknown,
  res: { status: (statusCode: number) => { json: (body: unknown) => void } },
  next: (error: unknown) => void
) {
  if (error instanceof WorkflowServiceError) {
    res.status(error.statusCode).json({
      code: error.code,
      message: error.message
    });
    return;
  }

  next(error);
}
