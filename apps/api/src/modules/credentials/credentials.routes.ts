import {
  createCredentialRequestSchema,
  updateCredentialRequestSchema
} from "@execloom/contracts";
import { Router } from "express";
import { z } from "zod";

import {
  archiveCredential,
  createCredential,
  CredentialServiceError,
  listCredentials,
  updateCredential
} from "./credentials.service.js";

const uuidSchema = z.string().uuid();

export function createCredentialRoutes() {
  const router = Router();

  router.post("/", async (req, res, next) => {
    try {
      const ownerId = res.locals.userId as string;
      const body = createCredentialRequestSchema.safeParse(req.body);

      if (!body.success) {
        res.status(400).json({
          code: "VALIDATION_ERROR",
          message: "Invalid credential request body",
          details: body.error.flatten()
        });
        return;
      }

      res.status(201).json(await createCredential(ownerId, body.data));
    } catch (error) {
      handleCredentialError(error, res, next);
    }
  });

  router.get("/", async (_req, res, next) => {
    try {
      const ownerId = res.locals.userId as string;
      res.json({ credentials: await listCredentials(ownerId) });
    } catch (error) {
      handleCredentialError(error, res, next);
    }
  });

  router.patch("/:id", async (req, res, next) => {
    try {
      const ownerId = res.locals.userId as string;
      const credentialId = uuidSchema.parse(req.params.id);
      const body = updateCredentialRequestSchema.safeParse(req.body);

      if (!body.success) {
        res.status(400).json({
          code: "VALIDATION_ERROR",
          message: "Invalid credential request body",
          details: body.error.flatten()
        });
        return;
      }

      res.json(await updateCredential(ownerId, credentialId, body.data));
    } catch (error) {
      handleCredentialError(error, res, next);
    }
  });

  router.delete("/:id", async (req, res, next) => {
    try {
      const ownerId = res.locals.userId as string;
      const credentialId = uuidSchema.parse(req.params.id);
      await archiveCredential(ownerId, credentialId);
      res.status(204).send();
    } catch (error) {
      handleCredentialError(error, res, next);
    }
  });

  return router;
}

function handleCredentialError(
  error: unknown,
  res: {
    status: (statusCode: number) => {
      json: (body: unknown) => void;
    };
  },
  next: (error: unknown) => void
) {
  if (error instanceof z.ZodError) {
    res.status(400).json({
      code: "VALIDATION_ERROR",
      message: "Invalid credential id"
    });
    return;
  }

  if (error instanceof CredentialServiceError) {
    res.status(error.statusCode).json({
      code: error.code,
      message: error.message
    });
    return;
  }

  next(error);
}
