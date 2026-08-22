import { z } from "zod";

const jsonObjectSchema = z.record(z.string(), z.unknown());

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

export const workflowStepDefinitionSchema = z.object({
  key: z.string().min(1).max(80),
  type: z.string().min(1).max(80),
  name: z.string().min(1).max(120).optional(),
  config: jsonObjectSchema.default({})
});

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

export type CreateWorkflowRequest = z.infer<typeof createWorkflowRequestSchema>;
export type WorkflowResponse = z.infer<typeof workflowResponseSchema>;
export type WorkflowVersionResponse = z.infer<typeof workflowVersionResponseSchema>;
export type WorkflowDetailResponse = z.infer<typeof workflowDetailResponseSchema>;
