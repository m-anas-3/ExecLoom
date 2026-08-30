import { z } from "zod";

declare const URL: {
  new (value: string): {
    hostname: string;
    protocol: string;
  };
};

const jsonObjectSchema = z.record(z.string(), z.unknown());
export const workflowStepTypeSchema = z.enum(["noop", "delay", "http"]);
export const httpStepMethodSchema = z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]);
const privateHttpStepUrlMessage =
  "URL must use http or https and cannot target local or private network hosts";

const workflowStepBaseSchema = z.object({
  key: z.string().min(1).max(80),
  name: z.string().min(1).max(120).optional(),
  retry: z
    .object({
      maxAttempts: z.number().int().min(1).max(10).default(1),
      backoffMs: z.number().int().min(0).max(300_000).default(0)
    })
    .default({
      maxAttempts: 1,
      backoffMs: 0
    })
});

export const noopStepConfigSchema = jsonObjectSchema.default({});
export const delayStepConfigSchema = z
  .object({
    ms: z.number().int().min(0).max(30_000).optional()
  })
  .default({});
export const httpStepConfigSchema = z.object({
  url: z
    .string()
    .url()
    .refine(isSafeHttpStepUrl, privateHttpStepUrlMessage),
  method: httpStepMethodSchema.default("GET"),
  headers: z.record(z.string()).default({}),
  body: z.unknown().optional(),
  timeoutMs: z.number().int().min(1).max(60_000).default(10_000)
});

export const healthResponseSchema = z.object({
  service: z.string(),
  status: z.literal("ok"),
  database: z.object({
    status: z.enum(["ok", "error"]),
    message: z.string().optional()
  }),
  timestamp: z.string().datetime()
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const authUserResponseSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  createdAt: z.string().datetime()
});

export const registerRequestSchema = z.object({
  email: z.string().email().max(255).transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(128)
});

export const loginRequestSchema = z.object({
  email: z.string().email().max(255).transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(128)
});

export const authResponseSchema = z.object({
  accessToken: z.string(),
  tokenType: z.literal("Bearer"),
  user: authUserResponseSchema
});

export const currentUserResponseSchema = z.object({
  user: authUserResponseSchema
});

export const workflowStepDefinitionSchema = z.discriminatedUnion("type", [
  workflowStepBaseSchema.extend({
    type: z.literal("noop"),
    config: noopStepConfigSchema
  }),
  workflowStepBaseSchema.extend({
    type: z.literal("delay"),
    config: delayStepConfigSchema
  }),
  workflowStepBaseSchema.extend({
    type: z.literal("http"),
    config: httpStepConfigSchema
  })
]);

export const workflowDefinitionSchema = z.object({
  steps: z.array(workflowStepDefinitionSchema).min(1).max(50)
});

export const createWorkflowRequestSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  inputSchema: jsonObjectSchema.default({}),
  definition: workflowDefinitionSchema
});

export const workflowResponseSchema = z.object({
  id: z.string().uuid(),
  ownerId: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  status: z.enum(["draft", "published", "archived"]),
  activeVersionId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  archivedAt: z.string().datetime().nullable()
});

export const workflowVersionResponseSchema = z.object({
  id: z.string().uuid(),
  workflowId: z.string().uuid(),
  versionNo: z.number().int(),
  status: z.enum(["draft", "published", "retired"]),
  inputSchema: jsonObjectSchema,
  definition: workflowDefinitionSchema,
  createdAt: z.string().datetime(),
  publishedAt: z.string().datetime().nullable(),
  retiredAt: z.string().datetime().nullable()
});

export const workflowDetailResponseSchema = z.object({
  workflow: workflowResponseSchema,
  versions: z.array(workflowVersionResponseSchema)
});

export const triggerExecutionRequestSchema = z.object({
  input: jsonObjectSchema.default({})
});

export const listWorkflowExecutionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

export const executionResponseSchema = z.object({
  id: z.string().uuid(),
  workflowVersionId: z.string().uuid(),
  status: z.enum(["queued", "running", "succeeded", "failed", "cancelled"]),
  triggerType: z.string(),
  input: jsonObjectSchema,
  output: z.unknown().nullable(),
  error: z.unknown().nullable(),
  createdAt: z.string().datetime(),
  queuedAt: z.string().datetime(),
  startedAt: z.string().datetime().nullable(),
  endedAt: z.string().datetime().nullable()
});

export const stepRunResponseSchema = z.object({
  id: z.string().uuid(),
  executionId: z.string().uuid(),
  stepKey: z.string(),
  status: z.enum([
    "pending",
    "queued",
    "running",
    "succeeded",
    "retrying",
    "failed",
    "skipped",
    "cancelled"
  ]),
  attemptCount: z.number().int(),
  input: z.unknown().nullable(),
  output: z.unknown().nullable(),
  error: z.unknown().nullable(),
  createdAt: z.string().datetime(),
  queuedAt: z.string().datetime().nullable(),
  startedAt: z.string().datetime().nullable(),
  endedAt: z.string().datetime().nullable()
});

export const executionEventResponseSchema = z.object({
  id: z.string().uuid(),
  executionId: z.string().uuid(),
  sequenceNo: z.number().int(),
  type: z.string(),
  payload: jsonObjectSchema,
  createdAt: z.string().datetime()
});

export const executionDetailResponseSchema = z.object({
  execution: executionResponseSchema,
  steps: z.array(stepRunResponseSchema),
  events: z.array(executionEventResponseSchema)
});

export const executionListResponseSchema = z.object({
  executions: z.array(executionResponseSchema)
});

export type CreateWorkflowRequest = z.infer<typeof createWorkflowRequestSchema>;
export type RegisterRequest = z.infer<typeof registerRequestSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type AuthUserResponse = z.infer<typeof authUserResponseSchema>;
export type AuthResponse = z.infer<typeof authResponseSchema>;
export type CurrentUserResponse = z.infer<typeof currentUserResponseSchema>;
export type WorkflowStepType = z.infer<typeof workflowStepTypeSchema>;
export type HttpStepMethod = z.infer<typeof httpStepMethodSchema>;
export type WorkflowStepDefinition = z.infer<typeof workflowStepDefinitionSchema>;
export type WorkflowResponse = z.infer<typeof workflowResponseSchema>;
export type WorkflowVersionResponse = z.infer<typeof workflowVersionResponseSchema>;
export type WorkflowDetailResponse = z.infer<typeof workflowDetailResponseSchema>;
export type TriggerExecutionRequest = z.infer<typeof triggerExecutionRequestSchema>;
export type ListWorkflowExecutionsQuery = z.infer<
  typeof listWorkflowExecutionsQuerySchema
>;
export type ExecutionResponse = z.infer<typeof executionResponseSchema>;
export type StepRunResponse = z.infer<typeof stepRunResponseSchema>;
export type ExecutionEventResponse = z.infer<typeof executionEventResponseSchema>;
export type ExecutionDetailResponse = z.infer<typeof executionDetailResponseSchema>;
export type ExecutionListResponse = z.infer<typeof executionListResponseSchema>;

export function isSafeHttpStepUrl(value: string): boolean {
  try {
    const url = new URL(value);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return false;
    }

    return !isBlockedHttpStepHostname(url.hostname);
  } catch {
    return false;
  }
}

function isBlockedHttpStepHostname(hostname: string): boolean {
  const normalizedHostname = hostname.toLowerCase().replace(/^\[/, "").replace(/\]$/, "");

  if (normalizedHostname === "localhost" || normalizedHostname.endsWith(".localhost")) {
    return true;
  }

  if (isPrivateIpv4Address(normalizedHostname)) {
    return true;
  }

  return isPrivateIpv6Address(normalizedHostname);
}

function isPrivateIpv4Address(hostname: string): boolean {
  const parts = hostname.split(".");

  if (parts.length !== 4) {
    return false;
  }

  const octets = parts.map((part) => Number(part));

  if (!octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255)) {
    return false;
  }

  const [first, second] = octets;

  if (first === undefined || second === undefined) {
    return false;
  }

  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

function isPrivateIpv6Address(hostname: string): boolean {
  const ipv4MappedAddress = getIpv4MappedIpv6Address(hostname);

  if (ipv4MappedAddress !== null) {
    return isPrivateIpv4Address(ipv4MappedAddress);
  }

  const firstHextetText = hostname.split(":")[0];
  const firstHextet =
    firstHextetText === undefined ? Number.NaN : Number.parseInt(firstHextetText, 16);

  return (
    hostname === "::" ||
    hostname === "::1" ||
    (firstHextet >= 0xfc00 && firstHextet <= 0xfdff) ||
    (firstHextet >= 0xfe80 && firstHextet <= 0xfebf)
  );
}

function getIpv4MappedIpv6Address(hostname: string): string | null {
  if (!hostname.startsWith("::ffff:")) {
    return null;
  }

  const suffix = hostname.slice("::ffff:".length);

  if (suffix.includes(".")) {
    return suffix;
  }

  const parts = suffix.split(":");

  if (parts.length !== 2) {
    return null;
  }

  const high = Number.parseInt(parts[0] ?? "", 16);
  const low = Number.parseInt(parts[1] ?? "", 16);

  if (
    !Number.isInteger(high) ||
    !Number.isInteger(low) ||
    high < 0 ||
    high > 0xffff ||
    low < 0 ||
    low > 0xffff
  ) {
    return null;
  }

  return `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`;
}
