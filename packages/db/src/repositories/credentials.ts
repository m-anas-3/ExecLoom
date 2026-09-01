import { randomUUID } from "node:crypto";

import { and, desc, eq, isNull } from "drizzle-orm";

import { withDatabase } from "../client.js";
import { decryptCredentialSecret, encryptCredentialSecret } from "../credential-crypto.js";
import { credentials, workflowVersions, workflows } from "../schema.js";

export type CredentialRecordType = "api_key" | "bearer_token";

export type CreateCredentialRecordInput = {
  ownerId: string;
  name: string;
  type: CredentialRecordType;
  secret: string;
  headerName?: string;
};

export type UpdateCredentialRecordInput = {
  ownerId: string;
  credentialId: string;
  name?: string;
  secret?: string;
  headerName?: string;
};

export async function createCredentialRecord(input: CreateCredentialRecordInput) {
  const credentialId = randomUUID();
  const encrypted = encryptCredentialSecret(
    input.secret,
    credentialEncryptionContext(input.ownerId, credentialId)
  );

  return withDatabase(async ({ db }) => {
    const [credential] = await db
      .insert(credentials)
      .values({
        id: credentialId,
        ownerId: input.ownerId,
        name: input.name,
        type: input.type,
        headerName: input.type === "api_key" ? input.headerName ?? "x-api-key" : null,
        encryptedSecret: encrypted.ciphertext,
        encryptionIv: encrypted.iv,
        encryptionAuthTag: encrypted.authTag
      })
      .returning();

    if (!credential) {
      throw new Error("Failed to create credential");
    }

    return credential;
  });
}

export async function listCredentialRecordsByOwner(ownerId: string) {
  return withDatabase(async ({ db }) => {
    return db
      .select({
        id: credentials.id,
        ownerId: credentials.ownerId,
        name: credentials.name,
        type: credentials.type,
        headerName: credentials.headerName,
        createdAt: credentials.createdAt,
        updatedAt: credentials.updatedAt
      })
      .from(credentials)
      .where(and(eq(credentials.ownerId, ownerId), isNull(credentials.archivedAt)))
      .orderBy(desc(credentials.updatedAt));
  });
}

export async function listCredentialIdsByOwner(ownerId: string) {
  return withDatabase(async ({ db }) => {
    const rows = await db
      .select({ id: credentials.id })
      .from(credentials)
      .where(and(eq(credentials.ownerId, ownerId), isNull(credentials.archivedAt)));

    return rows.map(({ id }) => id);
  });
}

export async function getCredentialRecordByOwner(credentialId: string, ownerId: string) {
  return withDatabase(async ({ db }) => {
    const [credential] = await db
      .select()
      .from(credentials)
      .where(
        and(
          eq(credentials.id, credentialId),
          eq(credentials.ownerId, ownerId),
          isNull(credentials.archivedAt)
        )
      )
      .limit(1);

    return credential ?? null;
  });
}

export async function updateCredentialRecord(input: UpdateCredentialRecordInput) {
  return withDatabase(async ({ db }) => {
    return db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(credentials)
        .where(
          and(
            eq(credentials.id, input.credentialId),
            eq(credentials.ownerId, input.ownerId),
            isNull(credentials.archivedAt)
          )
        )
        .limit(1)
        .for("update");

      if (!existing) {
        return null;
      }

      const encrypted = input.secret
        ? encryptCredentialSecret(
            input.secret,
            credentialEncryptionContext(existing.ownerId, existing.id)
          )
        : null;
      const [updated] = await tx
        .update(credentials)
        .set({
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.headerName === undefined ? {} : { headerName: input.headerName }),
          ...(encrypted
            ? {
                encryptedSecret: encrypted.ciphertext,
                encryptionIv: encrypted.iv,
                encryptionAuthTag: encrypted.authTag
              }
            : {}),
          updatedAt: new Date()
        })
        .where(eq(credentials.id, existing.id))
        .returning();

      return updated ?? null;
    });
  });
}

export async function archiveCredentialRecord(credentialId: string, ownerId: string) {
  return withDatabase(async ({ db }) => {
    return db.transaction(async (tx) => {
      const [credential] = await tx
        .select()
        .from(credentials)
        .where(
          and(
            eq(credentials.id, credentialId),
            eq(credentials.ownerId, ownerId),
            isNull(credentials.archivedAt)
          )
        )
        .limit(1)
        .for("update");

      if (!credential) {
        return { kind: "not_found" as const };
      }

      const activeDefinitions = await tx
        .select({ definitionJson: workflowVersions.definitionJson })
        .from(workflows)
        .innerJoin(workflowVersions, eq(workflows.activeVersionId, workflowVersions.id))
        .where(and(eq(workflows.ownerId, ownerId), eq(workflows.status, "published")));

      if (
        activeDefinitions.some(({ definitionJson }) =>
          definitionUsesCredential(definitionJson, credentialId)
        )
      ) {
        return { kind: "in_use" as const };
      }

      const now = new Date();
      await tx
        .update(credentials)
        .set({ archivedAt: now, updatedAt: now })
        .where(eq(credentials.id, credential.id));

      return { kind: "archived" as const };
    });
  });
}

export async function resolveCredentialSecretForOwner(
  credentialId: string,
  ownerId: string
) {
  const credential = await getCredentialRecordByOwner(credentialId, ownerId);

  if (!credential) {
    return null;
  }

  return {
    id: credential.id,
    type: credential.type,
    headerName: credential.headerName,
    secret: decryptCredentialSecret(
      {
        ciphertext: credential.encryptedSecret,
        iv: credential.encryptionIv,
        authTag: credential.encryptionAuthTag
      },
      credentialEncryptionContext(credential.ownerId, credential.id)
    )
  };
}

function credentialEncryptionContext(ownerId: string, credentialId: string): string {
  return `${ownerId}:${credentialId}`;
}

function definitionUsesCredential(definition: unknown, credentialId: string): boolean {
  if (!definition || typeof definition !== "object" || !("steps" in definition)) {
    return false;
  }

  const steps = (definition as { steps?: unknown }).steps;

  if (!Array.isArray(steps)) {
    return false;
  }

  return steps.some((step) => {
    if (!step || typeof step !== "object" || !("config" in step)) {
      return false;
    }

    const config = (step as { config?: unknown }).config;
    return (
      config !== null &&
      typeof config === "object" &&
      "credentialId" in config &&
      (config as { credentialId?: unknown }).credentialId === credentialId
    );
  });
}
