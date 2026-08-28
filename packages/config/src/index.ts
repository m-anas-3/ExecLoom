import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  API_PORT: z.coerce.number().int().positive().default(4000),
  AUTH_JWT_SECRET: z.string().min(32).default("local-development-jwt-secret-change-me"),
  AUTH_ACCESS_TOKEN_TTL: z.string().min(1).default("7d"),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  WORKER_STALLED_STEP_TIMEOUT_MS: z.coerce.number().int().positive().default(300_000),
  WORKER_RECOVERY_INTERVAL_MS: z.coerce.number().int().positive().default(60_000)
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");

    throw new Error(`Invalid environment configuration: ${details}`);
  }

  return parsed.data;
}
