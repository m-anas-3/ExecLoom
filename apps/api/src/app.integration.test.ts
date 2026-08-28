import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";

import type { ExecutionDetailResponse, WorkflowDetailResponse } from "@execloom/contracts";
import { createDatabaseClient, type DatabaseClient } from "@execloom/db";
import { createExecutionQueue } from "@execloom/queue";

import { createApp } from "./app.js";

loadDotenv({ path: fileURLToPath(new URL("../../../.env", import.meta.url)) });

const runIntegrationTests = process.env.EXECLOOM_RUN_INTEGRATION_TESTS === "1";

describe("api integration", { skip: !runIntegrationTests }, () => {
  let dbClient: DatabaseClient | undefined;
  let server: Server | undefined;
  let baseUrl: string;
  let userId: string;
  let executionId: string | undefined;

  before(async () => {
    dbClient = createDatabaseClient();

    const email = `api-integration-${Date.now()}@example.com`;
    const [user] = await dbClient.queryClient<{ id: string }[]>`
      insert into users (email, password_hash)
      values (${email}, 'local-test-password')
      returning id
    `;

    if (!user) {
      throw new Error("Failed to create integration test user");
    }

    userId = user.id;

    const testServer = createApp().listen(0);
    server = testServer;

    await new Promise<void>((resolve) => {
      testServer.once("listening", resolve);
    });

    const address = testServer.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    if (executionId) {
      const queue = createExecutionQueue();

      try {
        const job = await queue.getJob(executionId);
        await job?.remove();
      } catch {
        // The worker may already have claimed the job in local development.
      } finally {
        await queue.close();
      }
    }

    if (userId && dbClient) {
      await dbClient.queryClient`
        delete from execution_events
        where execution_id in (
          select executions.id
          from executions
          inner join workflow_versions
            on executions.workflow_version_id = workflow_versions.id
          inner join workflows
            on workflow_versions.workflow_id = workflows.id
          where workflows.owner_id = ${userId}
        )
      `;

      await dbClient.queryClient`
        delete from step_runs
        where execution_id in (
          select executions.id
          from executions
          inner join workflow_versions
            on executions.workflow_version_id = workflow_versions.id
          inner join workflows
            on workflow_versions.workflow_id = workflows.id
          where workflows.owner_id = ${userId}
        )
      `;

      await dbClient.queryClient`
        delete from executions
        where workflow_version_id in (
          select workflow_versions.id
          from workflow_versions
          inner join workflows
            on workflow_versions.workflow_id = workflows.id
          where workflows.owner_id = ${userId}
        )
      `;

      await dbClient.queryClient`
        delete from workflow_versions
        where workflow_id in (
          select id
          from workflows
          where owner_id = ${userId}
        )
      `;

      await dbClient.queryClient`
        delete from workflows
        where owner_id = ${userId}
      `;

      await dbClient.queryClient`
        delete from users
        where id = ${userId}
      `;
    }

    if (server) {
      await new Promise<void>((resolve, reject) => {
        server?.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    }

    await dbClient?.close();
  });

  it("creates, publishes, triggers, and cancels a workflow execution", async () => {
    const createResponse = await postJson("/workflows", {
      name: "Integration workflow",
      inputSchema: {},
      definition: {
        steps: [
          {
            key: "wait",
            type: "delay",
            config: {
              ms: 30_000
            }
          }
        ]
      }
    });

    assert.equal(createResponse.status, 201);
    const created = (await createResponse.json()) as WorkflowDetailResponse;
    assert.ok(created.versions[0]);
    assert.equal(created.workflow.status, "draft");
    assert.equal(created.versions[0].versionNo, 1);

    const workflowId = created.workflow.id as string;

    const publishResponse = await postJson(`/workflows/${workflowId}/publish`);

    assert.equal(publishResponse.status, 200);
    const published = (await publishResponse.json()) as WorkflowDetailResponse;
    assert.ok(published.versions[0]);
    assert.equal(published.workflow.status, "published");
    assert.equal(published.versions[0].status, "published");

    const triggerResponse = await postJson(`/workflows/${workflowId}/executions`, {
      input: {
        requestId: "integration-test"
      }
    });

    assert.equal(triggerResponse.status, 202);
    const triggered = (await triggerResponse.json()) as ExecutionDetailResponse;
    assert.ok(triggered.steps[0]);
    assert.ok(triggered.events[0]);
    executionId = triggered.execution.id as string;
    assert.equal(triggered.execution.status, "queued");
    assert.equal(triggered.steps[0].status, "queued");
    assert.equal(triggered.events[0].type, "execution.queued");

    const cancelResponse = await postJson(`/executions/${executionId}/cancel`);

    assert.equal(cancelResponse.status, 200);
    const cancelled = (await cancelResponse.json()) as ExecutionDetailResponse;
    assert.ok(cancelled.steps[0]);
    assert.equal(cancelled.execution.status, "cancelled");
    assert.equal(cancelled.steps[0].status, "cancelled");
    assert.equal(
      cancelled.events.some((event: { type: string }) => event.type === "execution.cancelled"),
      true
    );
  });

  async function postJson(path: string, body?: unknown) {
    return fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-user-id": userId
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  }
});
