# ExecLoom

[![Code quality](https://github.com/m-anas-3/ExecLoom/actions/workflows/code-quality.yml/badge.svg)](https://github.com/m-anas-3/ExecLoom/actions/workflows/code-quality.yml)

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

The current editor supports Start, No-op, Delay, HTTP Request, and structured OpenAI nodes in one validated execution chain. See [Visual Workflow Builder Architecture](./docs/architecture/visual-workflow-builder.md) for the design boundaries and end-to-end flow.

HTTP requests and AI prompts can map trigger data and previous-step output through strict workflow expressions. See [Workflow Data and Structured AI](./docs/architecture/workflow-data-and-ai.md) for the expression, result, and provider boundaries.

HTTP and AI steps can reference encrypted API-key or Bearer-token credentials. See [Credential Management Architecture](./docs/architecture/credential-management.md) for the security boundary and runtime resolution flow.

Runnable step state and BullMQ publication are connected through a transactional PostgreSQL outbox. See [Transactional Execution Outbox](./docs/adr/002-transactional-execution-outbox.md) for the reliability guarantees and tradeoffs.

## Frontend Verification

```bash
pnpm --filter @execloom/web test
pnpm --filter @execloom/web test:e2e
```
