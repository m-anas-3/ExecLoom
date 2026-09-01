import { z } from "zod";

const localCredentialEncryptionKey =
  "bG9jYWwtZGV2ZWxvcG1lbnQtY3JlZGVudGlhbC1rZXk=";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  API_PORT: z.coerce.number().int().positive().default(4000),
  AUTH_JWT_SECRET: z.string().min(32).default("local-development-jwt-secret-change-me"),
  AUTH_ACCESS_TOKEN_TTL: z.string().min(1).default("7d"),
  CREDENTIAL_ENCRYPTION_KEY: z
    .string()
    .default(localCredentialEncryptionKey)
    .refine((value) => isBase64Key(value, 32), "Must be a base64-encoded 32-byte key"),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  OUTBOX_DISPATCH_INTERVAL_MS: z.coerce.number().int().positive().default(1_000),
  OUTBOX_DISPATCH_BATCH_SIZE: z.coerce.number().int().min(1).max(500).default(25),
  OUTBOX_DISPATCH_LEASE_MS: z.coerce.number().int().positive().default(30_000),
  OUTBOX_RECONCILE_INTERVAL_MS: z.coerce.number().int().positive().default(60_000),
  WORKER_STALLED_STEP_TIMEOUT_MS: z.coerce.number().int().positive().default(300_000),
  WORKER_RECOVERY_INTERVAL_MS: z.coerce.number().int().positive().default(60_000)
}).superRefine((config, context) => {
  if (
    config.NODE_ENV === "production" &&
    config.CREDENTIAL_ENCRYPTION_KEY === localCredentialEncryptionKey
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["CREDENTIAL_ENCRYPTION_KEY"],
      message: "Must be explicitly configured in production"
    });
  }
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

function isBase64Key(value: string, expectedBytes: number): boolean {
  try {
    const decoded = Buffer.from(value, "base64");
    return decoded.length === expectedBytes && decoded.toString("base64") === value;
  } catch {
    return false;
  }
}
