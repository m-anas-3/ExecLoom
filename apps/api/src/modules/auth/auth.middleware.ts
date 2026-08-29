import type { NextFunction, Request, Response } from "express";

import { AuthServiceError, verifyAccessToken } from "./auth.service.js";

export type AuthenticatedLocals = {
  userId: string;
};

export async function requireAuth(
  req: Request,
  res: Response<unknown, AuthenticatedLocals>,
  next: NextFunction
) {
  try {
    const token = parseBearerToken(req.header("authorization"));
    res.locals.userId = await verifyAccessToken(token);
    next();
  } catch (error) {
    if (error instanceof AuthServiceError) {
      res.status(error.statusCode).json({
        code: error.code,
        message: error.message
      });
      return;
    }

    next(error);
  }
}

function parseBearerToken(value: string | undefined): string {
  if (!value) {
    throw new AuthServiceError(401, "MISSING_TOKEN", "Provide an Authorization Bearer token");
  }

  const [scheme, token] = value.split(" ");

  if (scheme !== "Bearer" || !token) {
    throw new AuthServiceError(401, "INVALID_TOKEN", "Provide a valid Bearer token");
  }

  return token;
}
