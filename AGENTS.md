# ExecLoom Agent Guidance

ExecLoom is a durable workflow engine built as a TypeScript monorepo. PostgreSQL is the durable source of truth. Redis and BullMQ are transport and coordination infrastructure, not authoritative execution storage.

## Code Review Rules

### Execution durability

- Flag workflow state, status, logs, or step results that exist only in Redis, BullMQ, or process memory.
- State transitions and their durable execution events should be written atomically when they describe the same operation.
- Never infer that an execution or step succeeded only because a queue job is missing or completed.

### Queue safety

- Assume BullMQ jobs can be delivered more than once. Flag worker behavior that is not idempotent or cannot safely reject a duplicate claim.
- Queue payloads should contain identifiers and versioned contract data, not authoritative mutable workflow state.
- Flag jobs that can remain permanently queued after a database write succeeds but enqueueing fails. Prefer a transactional outbox or an explicit recovery mechanism when this slice is introduced.

### Service boundaries

- Keep HTTP request handling short: validate, persist durable state, dispatch work, and respond.
- Long-running workflow steps and external API calls belong in the separate worker service.
- Keep reusable state-transition rules pure and framework-independent inside `packages/workflow-core`.

### TypeScript and contracts

- Preserve strict TypeScript behavior and avoid unsafe casts, `any`, or duplicated cross-service payload types.
- Define shared API and queue payloads in `packages/contracts` and validate untrusted inputs with Zod.
- Flag changes to shared contracts that update only one producer or consumer.

### Testing

- Require tests for state transitions, retry and idempotency behavior, repository writes, and API contract changes.
- Prefer deterministic unit tests for workflow-core and integration tests with real PostgreSQL or Redis for infrastructure behavior.
- Keep review findings focused on correctness, durability, security, regressions, and missing meaningful tests. Do not report minor style preferences.
