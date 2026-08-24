import { config as loadDotenv } from "dotenv";
import { fileURLToPath } from "node:url";
import { Worker as BullWorker } from "bullmq";

import { loadConfig } from "@execloom/config";
import {
  claimQueuedExecutionStep,
  completeClaimedExecutionStep,
  failClaimedExecutionStep
} from "@execloom/db";
import {
  createRedisConnectionOptions,
  executionJobPayloadSchema,
  executionQueueName
} from "@execloom/queue";

import { executeWorkflowStep } from "./executors.js";

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

    const claim = await claimQueuedExecutionStep(payload.executionId);

    if (claim.kind !== "claimed") {
      console.log("Execution job skipped", {
        executionId: payload.executionId,
        result: claim.kind
      });
      return;
    }

    try {
      const output = await executeWorkflowStep({
        step: claim.stepDefinition,
        executionInput: claim.execution.inputJson,
        stepInput: claim.stepRun.inputJson ?? claim.execution.inputJson
      });

      const result = await completeClaimedExecutionStep({
        executionId: claim.execution.id,
        stepRunId: claim.stepRun.id,
        outputJson: output
      });

      console.log("Execution job processed", {
        executionId: payload.executionId,
        result: result.kind
      });
    } catch (error) {
      const failure = await failClaimedExecutionStep({
        executionId: claim.execution.id,
        stepRunId: claim.stepRun.id,
        errorJson: serializeError(error)
      });

      console.error("Execution job failed during step execution", {
        executionId: payload.executionId,
        result: failure.kind,
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
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

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack
    };
  }

  return {
    message: "Unknown error",
    value: error
  };
}
