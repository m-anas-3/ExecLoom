import { Queue, type ConnectionOptions, type JobsOptions } from "bullmq";
import { z } from "zod";

import { loadConfig } from "@execloom/config";

export const executionQueueName = "execloom-executions";
export const executionJobName = "execution.run";

export const executionJobPayloadSchema = z.object({
  executionId: z.string().uuid(),
  workflowVersionId: z.string().uuid()
});

export type ExecutionJobPayload = z.infer<typeof executionJobPayloadSchema>;

export function createRedisConnectionOptions(redisUrl = loadConfig().REDIS_URL): ConnectionOptions {
  const url = new URL(redisUrl);
  const db = url.pathname.length > 1 ? Number(url.pathname.slice(1)) : undefined;

  if (db !== undefined && !Number.isInteger(db)) {
    throw new Error(`Invalid Redis database in REDIS_URL: ${url.pathname}`);
  }

  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 6379,
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db
  };
}

export function createExecutionQueue(
  redisUrl = loadConfig().REDIS_URL,
  queueName = executionQueueName
) {
  return new Queue<ExecutionJobPayload>(queueName, {
    connection: createRedisConnectionOptions(redisUrl)
  });
}

export async function publishExecutionJob(
  queue: Queue<ExecutionJobPayload>,
  payload: ExecutionJobPayload,
  options: JobsOptions = {}
) {
  const validatedPayload = executionJobPayloadSchema.parse(payload);

  return queue.add(executionJobName, validatedPayload, {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 1_000
    },
    removeOnComplete: 100,
    removeOnFail: 500,
    ...options
  });
}
