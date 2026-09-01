# ExecLoom

Visual workflow builder backed by a durable API, BullMQ workers, and PostgreSQL execution history.

## Repository Structure

```txt
apps/
  web/              Next.js frontend
  api/              HTTP API and realtime gateway
  worker/           Background workflow execution workers

packages/
  contracts/        Shared Zod schemas and TypeScript types
  db/               Database schema, migrations, repositories
  workflow-core/    Pure workflow state machine and execution rules
  config/           Typed environment configuration

infra/
  compose/          Local Docker Compose services

docs/
  adr/              Architecture decision records
  architecture/     System and visual-builder design
  demo/             Demo scripts and walkthrough notes
```

The current editor supports Start, No-op, Delay, and HTTP Request nodes in one validated execution chain. See [Visual Workflow Builder Architecture](./docs/architecture/visual-workflow-builder.md) for the design boundaries and end-to-end flow.

## Frontend Verification

```bash
pnpm --filter @execloom/web test
pnpm --filter @execloom/web test:e2e
```
