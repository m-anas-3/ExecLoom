import type {
  CreateCredentialRequest,
  CredentialResponse,
  UpdateCredentialRequest
} from "@execloom/contracts";
import {
  archiveCredentialRecord,
  createCredentialRecord,
  getCredentialRecordByOwner,
  listCredentialRecordsByOwner,
  updateCredentialRecord
} from "@execloom/db";

type CredentialRecord = NonNullable<
  Awaited<ReturnType<typeof getCredentialRecordByOwner>>
>;
type CredentialMetadata = Pick<
  CredentialRecord,
  "id" | "ownerId" | "name" | "type" | "headerName" | "createdAt" | "updatedAt"
>;

export class CredentialServiceError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
  }
}

export async function createCredential(
  ownerId: string,
  input: CreateCredentialRequest
): Promise<CredentialResponse> {
  const credential = await createCredentialRecord({
    ownerId,
    name: input.name,
    type: input.type,
    secret: input.secret,
    headerName: input.type === "api_key" ? input.headerName : undefined
  });

  return mapCredential(credential);
}

export async function listCredentials(ownerId: string): Promise<CredentialResponse[]> {
  const credentials = await listCredentialRecordsByOwner(ownerId);
  return credentials.map(mapCredential);
}

export async function updateCredential(
  ownerId: string,
  credentialId: string,
  input: UpdateCredentialRequest
): Promise<CredentialResponse> {
  const existing = await getCredentialRecordByOwner(credentialId, ownerId);

  if (!existing) {
    throw new CredentialServiceError(404, "CREDENTIAL_NOT_FOUND", "Credential was not found");
  }

  if (existing.type === "bearer_token" && input.headerName !== undefined) {
    throw new CredentialServiceError(
      400,
      "INVALID_CREDENTIAL_UPDATE",
      "Bearer token credentials do not have a configurable header name"
    );
  }

  const credential = await updateCredentialRecord({
    ownerId,
    credentialId,
    name: input.name,
    secret: input.secret,
    headerName: input.headerName
  });

  if (!credential) {
    throw new CredentialServiceError(404, "CREDENTIAL_NOT_FOUND", "Credential was not found");
  }

  return mapCredential(credential);
}

export async function archiveCredential(ownerId: string, credentialId: string): Promise<void> {
  const result = await archiveCredentialRecord(credentialId, ownerId);

  if (result.kind === "not_found") {
    throw new CredentialServiceError(404, "CREDENTIAL_NOT_FOUND", "Credential was not found");
  }

  if (result.kind === "in_use") {
    throw new CredentialServiceError(
      409,
      "CREDENTIAL_IN_USE",
      "Credential is used by an active published workflow"
    );
  }
}

function mapCredential(credential: CredentialMetadata): CredentialResponse {
  return {
    id: credential.id,
    ownerId: credential.ownerId,
    name: credential.name,
    type: credential.type,
    headerName: credential.headerName,
    createdAt: credential.createdAt.toISOString(),
    updatedAt: credential.updatedAt.toISOString()
  };
}
