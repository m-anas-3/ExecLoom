import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createRedisConnectionOptions,
  executionJobPayloadSchema,
  executionQueueName
} from "../dist/index.js";

describe("queue configuration", () => {
  it("uses the expected execution queue name", () => {
    assert.equal(executionQueueName, "execloom-executions");
  });

  it("parses a basic Redis URL", () => {
    assert.deepEqual(createRedisConnectionOptions("redis://localhost:6379"), {
      host: "localhost",
      port: 6379,
      username: undefined,
      password: undefined,
      db: undefined
    });
  });

  it("parses Redis auth and database index", () => {
    assert.deepEqual(createRedisConnectionOptions("redis://user:pass@redis.internal:6380/2"), {
      host: "redis.internal",
      port: 6380,
      username: "user",
      password: "pass",
      db: 2
    });
  });
});

describe("execution job payload", () => {
  it("accepts valid execution job payloads", () => {
    const payload = {
      executionId: "00000000-0000-4000-8000-000000000001",
      workflowVersionId: "00000000-0000-4000-8000-000000000002"
    };

    assert.deepEqual(executionJobPayloadSchema.parse(payload), payload);
  });

  it("rejects invalid execution job payloads", () => {
    assert.throws(
      () =>
        executionJobPayloadSchema.parse({
          executionId: "not-a-uuid",
          workflowVersionId: "00000000-0000-4000-8000-000000000002"
        }),
      /Invalid uuid/
    );
  });
});
