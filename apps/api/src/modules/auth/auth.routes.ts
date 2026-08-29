import { Router } from "express";
import { loginRequestSchema, registerRequestSchema } from "@execloom/contracts";

import { requireAuth } from "./auth.middleware.js";
import { AuthServiceError, getCurrentUser, login, register } from "./auth.service.js";

export function createAuthRoutes() {
  const router = Router();

  router.post("/register", async (req, res, next) => {
    try {
      const body = registerRequestSchema.safeParse(req.body);

      if (!body.success) {
        res.status(400).json({
          code: "VALIDATION_ERROR",
          message: "Invalid register request body",
          details: body.error.flatten()
        });
        return;
      }

      const response = await register(body.data);

      res.status(201).json(response);
    } catch (error) {
      handleAuthError(error, res, next);
    }
  });

  router.post("/login", async (req, res, next) => {
    try {
      const body = loginRequestSchema.safeParse(req.body);

      if (!body.success) {
        res.status(400).json({
          code: "VALIDATION_ERROR",
          message: "Invalid login request body",
          details: body.error.flatten()
        });
        return;
      }

      const response = await login(body.data);

      res.json(response);
    } catch (error) {
      handleAuthError(error, res, next);
    }
  });

  router.get("/me", requireAuth, async (_req, res, next) => {
    try {
      const user = await getCurrentUser(res.locals.userId);

      res.json({
        user
      });
    } catch (error) {
      handleAuthError(error, res, next);
    }
  });

  return router;
}

function handleAuthError(
  error: unknown,
  res: { status: (statusCode: number) => { json: (body: unknown) => void } },
  next: (error: unknown) => void
) {
  if (error instanceof AuthServiceError) {
    res.status(error.statusCode).json({
      code: error.code,
      message: error.message
    });
    return;
  }

  next(error);
}
