# ADR-002: PostgreSQL Is the Execution Source of Truth

## Status

Accepted

## Context

ExecLoom runs workflows through background workers. Queue jobs may be retried, delayed, duplicated, or lost from Redis during operational failures.

The system needs a durable record of workflow definitions, execution state, step results, and event history.

## Decision

ExecLoom stores durable workflow state in PostgreSQL.

Redis and BullMQ will be used for dispatching jobs, scheduling retries, and coordinating workers. They will not be the permanent source of execution history.

The database schema lives in `packages/db` and migrations are generated with Drizzle.

## Alternatives Considered

### Store execution state in Redis

Redis is fast, but it is a poor fit for long-term audit history and relational constraints. It is better used as queue infrastructure.

### Keep execution state in worker memory

This is simple, but a worker restart would lose active execution state.

### Store only final execution output

That would hide retries, failures, timings, and intermediate step history, which are core to ExecLoom's promise.

## Consequences

PostgreSQL becomes the authority for workflow and execution state. Workers must update the database carefully, using transactions and conditional updates when claiming work.

## Interview Answer

I used PostgreSQL as the source of truth because workflow executions need durable history, constraints, and recoverability. Redis is useful for queues and retry scheduling, but if Redis is the only place execution state lives, a crash or queue loss can erase important history. PostgreSQL gives us a reliable audit trail and lets the UI rebuild execution state after reconnecting.
