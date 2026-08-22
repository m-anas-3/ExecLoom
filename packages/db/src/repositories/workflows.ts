import { and, desc, eq } from "drizzle-orm";

import { withDatabase } from "../client.js";
import { users, workflowVersions, workflows } from "../schema.js";

export type CreateWorkflowRecordInput = {
  ownerId: string;
  name: string;
  description?: string;
  inputSchemaJson: unknown;
  definitionJson: unknown;
};

export async function findUserById(userId: string) {
  return withDatabase(async ({ db }) => {
    const [user] = await db
      .select({
        id: users.id,
        email: users.email
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    return user ?? null;
  });
}

export async function createWorkflowWithInitialVersion(input: CreateWorkflowRecordInput) {
  return withDatabase(async ({ db }) => {
    return db.transaction(async (tx) => {
      const [workflow] = await tx
        .insert(workflows)
        .values({
          ownerId: input.ownerId,
          name: input.name,
          description: input.description ?? null
        })
        .returning();

      if (!workflow) {
        throw new Error("Failed to create workflow");
      }

      const [version] = await tx
        .insert(workflowVersions)
        .values({
          workflowId: workflow.id,
          versionNo: 1,
          inputSchemaJson: input.inputSchemaJson,
          definitionJson: input.definitionJson
        })
        .returning();

      if (!version) {
        throw new Error("Failed to create workflow version");
      }

      return { workflow, version };
    });
  });
}

export async function listWorkflowsByOwner(ownerId: string) {
  return withDatabase(async ({ db }) => {
    return db
      .select()
      .from(workflows)
      .where(and(eq(workflows.ownerId, ownerId)))
      .orderBy(desc(workflows.createdAt));
  });
}

export async function getWorkflowDetailByOwner(workflowId: string, ownerId: string) {
  return withDatabase(async ({ db }) => {
    const [workflow] = await db
      .select()
      .from(workflows)
      .where(and(eq(workflows.id, workflowId), eq(workflows.ownerId, ownerId)))
      .limit(1);

    if (!workflow) {
      return null;
    }

    const versions = await db
      .select()
      .from(workflowVersions)
      .where(eq(workflowVersions.workflowId, workflow.id))
      .orderBy(desc(workflowVersions.versionNo));

    return { workflow, versions };
  });
}

export async function publishLatestDraftVersion(workflowId: string, ownerId: string) {
  return withDatabase(async ({ db }) => {
    return db.transaction(async (tx) => {
      const [workflow] = await tx
        .select()
        .from(workflows)
        .where(and(eq(workflows.id, workflowId), eq(workflows.ownerId, ownerId)))
        .limit(1);

      if (!workflow) {
        return null;
      }

      const [draftVersion] = await tx
        .select()
        .from(workflowVersions)
        .where(
          and(
            eq(workflowVersions.workflowId, workflow.id),
            eq(workflowVersions.status, "draft")
          )
        )
        .orderBy(desc(workflowVersions.versionNo))
        .limit(1);

      if (!draftVersion) {
        return {
          workflow,
          version: null
        };
      }

      const now = new Date();

      const [publishedVersion] = await tx
        .update(workflowVersions)
        .set({
          status: "published",
          publishedAt: now
        })
        .where(eq(workflowVersions.id, draftVersion.id))
        .returning();

      if (!publishedVersion) {
        throw new Error("Failed to publish workflow version");
      }

      const [publishedWorkflow] = await tx
        .update(workflows)
        .set({
          status: "published",
          activeVersionId: publishedVersion.id,
          updatedAt: now
        })
        .where(eq(workflows.id, workflow.id))
        .returning();

      if (!publishedWorkflow) {
        throw new Error("Failed to update workflow active version");
      }

      return {
        workflow: publishedWorkflow,
        version: publishedVersion
      };
    });
  });
}
