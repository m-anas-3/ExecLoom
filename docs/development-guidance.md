# Development Guidance

This project is built as a learning-focused, interview-ready backend system.

## How We Work

For each meaningful feature, explain:

- What we are building.
- Why this architecture fits ExecLoom.
- What alternatives exist.
- Why we are not choosing those alternatives right now.
- What backend concept is worth learning before or during the implementation.

## Learning Priorities

Focus especially on:

- API and worker separation.
- PostgreSQL as the source of truth.
- Redis and BullMQ as job dispatch infrastructure.
- Durable execution state.
- State machines.
- Idempotency.
- Retry policies and exponential backoff.
- Transactions.
- Realtime events and reconnect behavior.
- Observability with logs, IDs, and execution traces.

## Interview Readiness

For major decisions, keep the explanation concrete enough to answer questions like:

- Why did you use this architecture?
- Why not run workflow steps directly inside the API request?
- Why PostgreSQL instead of Redis for execution history?
- Why BullMQ instead of a simple cron job or in-memory queue?
- Why separate API and worker processes?
- How do you prevent duplicate job execution?
- What happens if the worker crashes?
- How does the frontend recover missed realtime events?

The goal is not only to build ExecLoom, but to understand and defend the engineering choices behind it.
