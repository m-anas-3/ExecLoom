# ExecLoom

Durable AI workflow engine.

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
  demo/             Demo scripts and walkthrough notes
```

Start with the API, worker, database package, and workflow core before building advanced UI features.
