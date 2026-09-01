import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";

import type {
  AuthResponse,
  CredentialListResponse,
  CredentialResponse,
  CurrentUserResponse,
  ExecutionDetailResponse,
  ExecutionListResponse,
  WorkflowDetailResponse
} from "@execloom/contracts";
import {
  claimQueuedExecutionStep,
  createDatabaseClient,
  type DatabaseClient
} from "@execloom/db";
import { createExecutionQueue } from "@execloom/queue";

import { createApp } from "./app.js";

loadDotenv({ path: fileURLToPath(new URL("../../../.env", import.meta.url)) });

const runIntegrationTests = process.env.EXECLOOM_RUN_INTEGRATION_TESTS === "1";

describe("api integration", { skip: !runIntegrationTests }, () => {
  let dbClient: DatabaseClient | undefined;
  let server: Server | undefined;
  let baseUrl: string;
  let userId: string;
  let accessToken: string;
  let executionId: string | undefined;
  let secondaryUserId: string | undefined;

  before(async () => {
    dbClient = createDatabaseClient();
    const testServer = createApp().listen(0);
    server = testServer;

    await new Promise<void>((resolve) => {
      testServer.once("listening", resolve);
    });

    const address = testServer.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;

    const registerResponse = await postPublicJson("/auth/register", {
      email: `api-integration-${Date.now()}@example.com`,
      password: "local-test-password"
    });

    assert.equal(registerResponse.status, 201);
    const auth = (await registerResponse.json()) as AuthResponse;
    userId = auth.user.id;
    accessToken = auth.accessToken;

    const meResponse = await getProtectedJson("/auth/me");

    assert.equal(meResponse.status, 200);
    const me = (await meResponse.json()) as CurrentUserResponse;
    assert.equal(me.user.id, userId);
    assert.equal(me.user.email, auth.user.email);
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
        delete from credentials
        where owner_id = ${userId}
      `;

      await dbClient.queryClient`
        delete from users
        where id = ${userId}
      `;

      if (secondaryUserId) {
        await dbClient.queryClient`
          delete from users
          where id = ${secondaryUserId}
        `;
      }
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

  it("versions, publishes, triggers, and cancels a workflow execution", async () => {
    const createResponse = await postProtectedJson("/workflows", {
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

    const publishResponse = await postProtectedJson(`/workflows/${workflowId}/publish`);

    assert.equal(publishResponse.status, 200);
    const published = (await publishResponse.json()) as WorkflowDetailResponse;
    assert.ok(published.versions[0]);
    assert.equal(published.workflow.status, "published");
    assert.equal(published.versions[0].status, "published");

    const firstVersionId = published.versions[0].id;
    assert.equal(published.workflow.activeVersionId, firstVersionId);

    const createVersionResponse = await postProtectedJson(`/workflows/${workflowId}/versions`, {
      inputSchema: {
        requestId: {
          type: "string"
        }
      },
      definition: {
        steps: [
          {
            key: "wait-v2",
            type: "delay",
            config: {
              ms: 30_000
            }
          }
        ]
      }
    });

    assert.equal(createVersionResponse.status, 201);
    const versioned = (await createVersionResponse.json()) as WorkflowDetailResponse;
    assert.equal(versioned.versions.length, 2);
    assert.equal(versioned.versions[0]?.versionNo, 2);
    assert.equal(versioned.versions[0]?.status, "draft");
    assert.equal(versioned.workflow.activeVersionId, firstVersionId);

    const replaceDraftResponse = await postProtectedJson(`/workflows/${workflowId}/versions`, {
      inputSchema: {
        requestId: {
          type: "string"
        }
      },
      definition: {
        steps: [
          {
            key: "wait-v3",
            type: "delay",
            config: {
              ms: 30_000
            }
          }
        ]
      }
    });

    assert.equal(replaceDraftResponse.status, 201);
    const replacedDraft = (await replaceDraftResponse.json()) as WorkflowDetailResponse;
    assert.equal(replacedDraft.versions.length, 3);
    assert.equal(replacedDraft.versions[0]?.versionNo, 3);
    assert.equal(replacedDraft.versions[0]?.status, "draft");
    assert.equal(replacedDraft.versions[1]?.status, "retired");
    assert.equal(replacedDraft.versions[2]?.status, "published");

    const publishVersionResponse = await postProtectedJson(`/workflows/${workflowId}/publish`);

    assert.equal(publishVersionResponse.status, 200);
    const republished = (await publishVersionResponse.json()) as WorkflowDetailResponse;
    assert.equal(republished.versions.length, 3);
    assert.equal(republished.versions[0]?.status, "published");
    assert.equal(republished.versions[1]?.status, "retired");
    assert.equal(republished.versions[2]?.status, "retired");
    assert.equal(republished.workflow.activeVersionId, republished.versions[0]?.id);

    const workflowListResponse = await getProtectedJson("/workflows");

    assert.equal(workflowListResponse.status, 200);
    const workflowList = (await workflowListResponse.json()) as {
      workflows: WorkflowDetailResponse["workflow"][];
    };
    const listedWorkflow = workflowList.workflows.find(
      (workflow) => workflow.id === workflowId
    );
    assert.equal(listedWorkflow?.activeVersionNo, republished.versions[0]?.versionNo);

    const triggerResponse = await postProtectedJson(`/workflows/${workflowId}/executions`, {
      input: {
        requestId: "integration-test"
      }
    });

    assert.equal(triggerResponse.status, 202);
    const triggered = (await triggerResponse.json()) as ExecutionDetailResponse;
    assert.ok(triggered.steps[0]);
    assert.ok(triggered.events[0]);
    executionId = triggered.execution.id as string;
    assert.equal(triggered.execution.workflowVersionId, republished.workflow.activeVersionId);
    assert.equal(triggered.execution.status, "queued");
    assert.equal(triggered.steps[0].status, "queued");
    assert.equal(triggered.events[0].type, "execution.queued");

    const listExecutionsResponse = await getProtectedJson(
      `/workflows/${workflowId}/executions?limit=1&status=queued`
    );

    assert.equal(listExecutionsResponse.status, 200);
    const listedExecutions = (await listExecutionsResponse.json()) as ExecutionListResponse;
    assert.equal(
      listedExecutions.executions.some((execution) => execution.id === executionId),
      true
    );
    assert.equal(
      listedExecutions.executions.every((execution) => execution.status === "queued"),
      true
    );
    assert.equal(listedExecutions.nextCursor, null);

    const [cancelResponse] = await Promise.all([
      postProtectedJson(`/executions/${executionId}/cancel`),
      claimQueuedExecutionStep(executionId)
    ]);

    assert.equal(cancelResponse.status, 200);
    const cancelled = (await cancelResponse.json()) as ExecutionDetailResponse;
    assert.ok(cancelled.steps[0]);
    assert.equal(cancelled.execution.status, "cancelled");
    assert.equal(cancelled.steps[0].status, "cancelled");
    assert.equal(
      cancelled.events.some((event: { type: string }) => event.type === "execution.cancelled"),
      true
    );
    assert.deepEqual(
      cancelled.events.map((event) => event.sequenceNo),
      cancelled.events.map((_, index) => index + 1)
    );
  });

  it("manages masked credentials and protects active workflow references", async () => {
    const secret = "integration-secret-value";
    const createCredentialResponse = await postProtectedJson("/credentials", {
      type: "api_key",
      name: "Integration API key",
      headerName: "x-integration-key",
      secret
    });

    assert.equal(createCredentialResponse.status, 201);
    const rawCreatedBody = await createCredentialResponse.text();
    assert.equal(rawCreatedBody.includes(secret), false);
    assert.equal(rawCreatedBody.includes("encryptedSecret"), false);
    const credential = JSON.parse(rawCreatedBody) as CredentialResponse;
    assert.equal(credential.type, "api_key");
    assert.equal(credential.headerName, "x-integration-key");

    assert.ok(dbClient);
    const [storedCredential] = await dbClient.queryClient<
      Array<{
        encrypted_secret: string;
        encryption_iv: string;
        encryption_auth_tag: string;
      }>
    >`
      select encrypted_secret, encryption_iv, encryption_auth_tag
      from credentials
      where id = ${credential.id}
    `;
    assert.ok(storedCredential);
    assert.notEqual(storedCredential.encrypted_secret, secret);
    assert.equal(storedCredential.encrypted_secret.includes(secret), false);
    assert.ok(storedCredential.encryption_iv.length > 0);
    assert.ok(storedCredential.encryption_auth_tag.length > 0);

    const secondaryRegisterResponse = await postPublicJson("/auth/register", {
      email: `api-integration-secondary-${Date.now()}@example.com`,
      password: "local-test-password"
    });
    assert.equal(secondaryRegisterResponse.status, 201);
    const secondaryAuth = (await secondaryRegisterResponse.json()) as AuthResponse;
    secondaryUserId = secondaryAuth.user.id;
    const crossOwnerUpdate = await fetch(`${baseUrl}/credentials/${credential.id}`, {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${secondaryAuth.accessToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({ name: "Unauthorized update" })
    });
    assert.equal(crossOwnerUpdate.status, 404);

    const listResponse = await getProtectedJson("/credentials");
    assert.equal(listResponse.status, 200);
    const listed = (await listResponse.json()) as CredentialListResponse;
    assert.equal(listed.credentials.some(({ id }) => id === credential.id), true);

    const rotateResponse = await patchProtectedJson(`/credentials/${credential.id}`, {
      secret: "rotated-integration-secret"
    });
    assert.equal(rotateResponse.status, 200);
    assert.equal((await rotateResponse.text()).includes("rotated-integration-secret"), false);

    const createWorkflowResponse = await postProtectedJson("/workflows", {
      name: "Credential integration workflow",
      inputSchema: {},
      definition: {
        steps: [
          {
            key: "authenticated-request",
            type: "http",
            config: {
              url: "https://example.com/api",
              credentialId: credential.id
            }
          }
        ]
      }
    });
    assert.equal(createWorkflowResponse.status, 201);
    const workflow = (await createWorkflowResponse.json()) as WorkflowDetailResponse;
    const credentialWorkflowId = workflow.workflow.id as string;

    assert.equal(
      (await postProtectedJson(`/workflows/${credentialWorkflowId}/publish`)).status,
      200
    );
    const blockedArchive = await deleteProtected(`/credentials/${credential.id}`);
    assert.equal(blockedArchive.status, 409);
    assert.equal(
      ((await blockedArchive.json()) as { code: string }).code,
      "CREDENTIAL_IN_USE"
    );

    assert.equal(
      (
        await postProtectedJson(`/workflows/${credentialWorkflowId}/versions`, {
          inputSchema: {},
          definition: {
            steps: [{ key: "replacement", type: "noop", config: {} }]
          }
        })
      ).status,
      201
    );
    assert.equal(
      (await postProtectedJson(`/workflows/${credentialWorkflowId}/publish`)).status,
      200
    );

    assert.equal((await deleteProtected(`/credentials/${credential.id}`)).status, 204);
    const afterArchive = (await (
      await getProtectedJson("/credentials")
    ).json()) as CredentialListResponse;
    assert.equal(afterArchive.credentials.some(({ id }) => id === credential.id), false);
  });

  async function postPublicJson(path: string, body?: unknown) {
    return fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  }

  async function postProtectedJson(path: string, body?: unknown) {
    return fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json"
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  }

  async function getProtectedJson(path: string) {
    return fetch(`${baseUrl}${path}`, {
      headers: {
        authorization: `Bearer ${accessToken}`
      }
    });
  }

  async function patchProtectedJson(path: string, body: unknown) {
    return fetch(`${baseUrl}${path}`, {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(body)
    });
  }

  async function deleteProtected(path: string) {
    return fetch(`${baseUrl}${path}`, {
      method: "DELETE",
      headers: {
        authorization: `Bearer ${accessToken}`
      }
    });
  }
});
