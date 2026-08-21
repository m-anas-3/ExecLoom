# ADR-001: Separate API and Worker Processes

## Status

Accepted

## Context

ExecLoom executes workflows that may run for a long time, call external services, retry failures, and continue after process restarts.

If workflow execution runs directly inside an HTTP request, the request can time out, the API process can become overloaded, and retry/recovery behavior becomes difficult to reason about.

## Decision

ExecLoom will use separate deployable processes:

- `apps/api` handles HTTP requests, authentication, validation, durable state creation, and enqueueing work.
- `apps/worker` processes queued workflow jobs outside the request lifecycle.
- PostgreSQL stores durable workflow and execution state.
- Redis/BullMQ will be used for job dispatch, retry scheduling, and worker coordination.

## Alternatives Considered

### Run work directly in the API

This is simpler at the start, but long-running workflows can block request handling and make retries unreliable.

### Use only cron jobs

Cron is useful for scheduled triggers, but it is not enough for per-execution retries, delayed jobs, concurrency, and detailed attempt tracking.

### Use an in-memory queue

An in-memory queue is easy to build, but queued work disappears when the process restarts and cannot be shared across multiple worker instances.

## Consequences

The system has more moving parts, but the separation gives ExecLoom a clearer reliability model:

- The API stays responsive.
- Workers can scale independently.
- Slow or failed execution work does not block HTTP traffic.
- Execution history remains durable in PostgreSQL.

## Interview Answer

I separated the API and worker because workflow execution can be slow, failure-prone, and retryable. The API validates the request, writes durable state, enqueues work, and returns quickly. The worker processes the workflow independently, which keeps the API responsive and lets execution scale separately.
