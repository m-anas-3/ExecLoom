import { config as loadDotenv } from "dotenv";
import { fileURLToPath } from "node:url";
import { Worker as BullWorker } from "bullmq";

import { loadConfig } from "@execloom/config";
import {
  createRedisConnectionOptions,
  executionJobPayloadSchema,
  executionQueueName
} from "@execloom/queue";

loadDotenv({ path: fileURLToPath(new URL("../../../.env", import.meta.url)) });

const config = loadConfig();

console.log("Worker booting", {
  nodeEnv: config.NODE_ENV,
  redisConfigured: Boolean(config.REDIS_URL),
  databaseConfigured: Boolean(config.DATABASE_URL)
});

const executionWorker = new BullWorker(
  executionQueueName,
  async (job) => {
    const payload = executionJobPayloadSchema.parse(job.data);

    console.log("Execution job received", {
      jobId: job.id,
      executionId: payload.executionId,
      workflowVersionId: payload.workflowVersionId,
      attemptsMade: job.attemptsMade
    });
  },
  {
    connection: createRedisConnectionOptions(config.REDIS_URL),
    concurrency: 5
  }
);

executionWorker.on("ready", () => {
  console.log("Execution worker ready", {
    queue: executionQueueName
  });
});

executionWorker.on("completed", (job) => {
  console.log("Execution job completed", {
    jobId: job.id
  });
});

executionWorker.on("failed", (job, error) => {
  console.error("Execution job failed", {
    jobId: job?.id,
    error: error.message
  });
});

async function shutdown() {
  console.log("Worker shutting down");
  await executionWorker.close();
}

process.on("SIGTERM", () => {
  void shutdown().then(() => process.exit(0));
});

process.on("SIGINT", () => {
  void shutdown().then(() => process.exit(0));
});
