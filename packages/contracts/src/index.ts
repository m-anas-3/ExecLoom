import { z } from "zod";

export const healthResponseSchema = z.object({
  service: z.string(),
  status: z.literal("ok"),
  timestamp: z.string().datetime()
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
