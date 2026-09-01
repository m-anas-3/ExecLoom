# ADR 002: Transactional Execution Outbox

## Status

Accepted

## Context

Execution state is stored in PostgreSQL while runnable work is delivered through BullMQ. Writing those systems sequentially can leave a queued execution step without a queue job when Redis is unavailable or a process exits between the two writes.

## Decision

Every transition that makes a step runnable writes an `execution_outbox` record in the same PostgreSQL transaction. This includes initial execution creation, next-step creation, step retries, and stalled-step recovery.

The worker hosts an outbox dispatcher that:

- leases due rows with `FOR UPDATE SKIP LOCKED`;
- publishes jobs with a deterministic ID for the exact step attempt;
- marks an outbox row dispatched only after BullMQ confirms publication;
- releases failed publications with exponential backoff;
- reclaims expired leases after dispatcher crashes; and
- reconciles queued steps when their deterministic BullMQ job is missing.

Cancellation discards pending intents in the same transaction that cancels the execution. BullMQ delivery remains at least once, while PostgreSQL step claiming makes execution idempotent.

## Consequences

- Redis outages no longer make committed workflow state permanently undispatchable.
- Duplicate outbox processing is expected and safe.
- PostgreSQL is the source of truth for dispatch intent; BullMQ remains the delivery mechanism.
- The dispatcher adds polling and retained outbox rows. Retention cleanup can be added separately after operational requirements are known.
