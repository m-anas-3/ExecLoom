# Credential Management Architecture

ExecLoom stores reusable API-key and Bearer-token credentials separately from immutable workflow definitions.

## Data Flow

1. The web app sends a credential secret to the authenticated API.
2. The API encrypts it with AES-256-GCM using a unique 12-byte IV and authenticated row context.
3. PostgreSQL stores ciphertext, IV, and authentication tag. API responses expose metadata only.
4. A workflow version stores only the credential UUID in its HTTP step configuration.
5. BullMQ continues to carry execution and workflow-version identifiers only.
6. The worker verifies credential ownership, decrypts the secret in memory, injects the HTTP header, and discards the plaintext after the request.

## Security Boundaries

- `CREDENTIAL_ENCRYPTION_KEY` is separate from the JWT signing secret and must be explicitly configured in production.
- Secrets are excluded from workflow JSON, queue jobs, step inputs, outputs, events, API responses, and logs.
- API-key credentials inject their configured header. Bearer credentials inject `Authorization: Bearer ...`.
- Credential headers override manual headers case-insensitively.
- A credential used by an active published workflow cannot be archived.
- Draft creation and publishing reject unavailable or cross-owner credential references.

## Immutability Tradeoff

Workflow versions remain immutable because they retain the same credential UUID. Rotating the secret intentionally changes runtime authentication for every version referencing that credential. This allows key rotation without creating new workflow versions while preserving the workflow's structural history.

## Why AES-GCM

AES-GCM provides confidentiality and authentication in one operation. The authentication tag makes modified ciphertext or mismatched row context fail during decryption. ExecLoom uses Node's built-in `crypto` module, so this boundary does not require another dependency.
