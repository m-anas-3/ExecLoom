import bcrypt from "bcryptjs";
import { jwtVerify, SignJWT } from "jose";

import type {
  AuthResponse,
  AuthUserResponse,
  LoginRequest,
  RegisterRequest
} from "@execloom/contracts";
import { loadConfig } from "@execloom/config";
import { createUser, findUserByEmailForAuth } from "@execloom/db";

type AuthUserRecord = {
  id: string;
  email: string;
  createdAt: Date;
};

export class AuthServiceError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
  }
}

export async function register(input: RegisterRequest): Promise<AuthResponse> {
  const passwordHash = await bcrypt.hash(input.password, 12);
  const user = await createUser({
    email: input.email,
    passwordHash
  });

  if (!user) {
    throw new AuthServiceError(409, "EMAIL_ALREADY_REGISTERED", "Email is already registered");
  }

  return createAuthResponse(user);
}

export async function login(input: LoginRequest): Promise<AuthResponse> {
  const user = await findUserByEmailForAuth(input.email);

  if (!user) {
    throw invalidCredentialsError();
  }

  const passwordValid = await bcrypt.compare(input.password, user.passwordHash);

  if (!passwordValid) {
    throw invalidCredentialsError();
  }

  return createAuthResponse(user);
}

export async function verifyAccessToken(accessToken: string): Promise<string> {
  try {
    const { payload } = await jwtVerify(accessToken, getJwtSecret());

    if (typeof payload.sub !== "string") {
      throw invalidTokenError();
    }

    return payload.sub;
  } catch {
    throw invalidTokenError();
  }
}

async function createAuthResponse(user: AuthUserRecord): Promise<AuthResponse> {
  return {
    accessToken: await signAccessToken(user.id),
    tokenType: "Bearer",
    user: mapAuthUser(user)
  };
}

async function signAccessToken(userId: string): Promise<string> {
  const config = loadConfig();

  return new SignJWT({})
    .setProtectedHeader({
      alg: "HS256"
    })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(config.AUTH_ACCESS_TOKEN_TTL)
    .sign(getJwtSecret(config.AUTH_JWT_SECRET));
}

function mapAuthUser(user: AuthUserRecord): AuthUserResponse {
  return {
    id: user.id,
    email: user.email,
    createdAt: user.createdAt.toISOString()
  };
}

function getJwtSecret(secret = loadConfig().AUTH_JWT_SECRET): Uint8Array {
  return new TextEncoder().encode(secret);
}

function invalidCredentialsError() {
  return new AuthServiceError(401, "INVALID_CREDENTIALS", "Invalid email or password");
}

function invalidTokenError() {
  return new AuthServiceError(401, "INVALID_TOKEN", "Provide a valid Bearer token");
}
