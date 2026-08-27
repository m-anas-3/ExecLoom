# Multi-Step Worker Smoke Test

This verifies the API, queue, worker, and database flow together.

## Prerequisites

Start Docker services:

```bash
pnpm compose:up
```

Run migrations if the database is fresh:

```bash
pnpm --filter @execloom/db db:migrate
```

Build the workspace:

```bash
pnpm build
```

Start the API in one terminal:

```bash
pnpm dev:api
```

Start the worker in another terminal:

```bash
pnpm dev:worker
```

## Create A Test User

Until auth exists, the API expects an `x-user-id` header. Create a local user directly in Postgres:

```bash
docker exec -it execloom-postgres psql -U execloom -d execloom
```

Inside `psql`:

```sql
insert into users (email, password_hash)
values ('demo@example.com', 'local-dev-password')
returning id;
```

Use the returned `id` as `USER_ID`.

## Create A Multi-Step Workflow

This example uses only local worker step types, so it does not need an external API.

```bash
curl -sS -X POST http://localhost:4000/workflows \
  -H "content-type: application/json" \
  -H "x-user-id: USER_ID" \
  -d '{
    "name": "Multi-step demo",
    "inputSchema": {},
    "definition": {
      "steps": [
        {
          "key": "start",
          "type": "noop",
          "config": {}
        },
        {
          "key": "wait",
          "type": "delay",
          "config": {
            "ms": 100
          }
        },
        {
          "key": "finish",
          "type": "noop",
          "config": {}
        }
      ]
    }
  }'
```

Copy `workflow.id` from the response.

## Optional HTTP Step Workflow

Use this version when you want to test the HTTP executor against a public test endpoint.

```bash
curl -sS -X POST http://localhost:4000/workflows \
  -H "content-type: application/json" \
  -H "x-user-id: USER_ID" \
  -d '{
    "name": "HTTP step demo",
    "inputSchema": {},
    "definition": {
      "steps": [
        {
          "key": "start",
          "type": "noop",
          "config": {}
        },
        {
          "key": "call_api",
          "type": "http",
          "config": {
            "url": "https://httpbin.org/post",
            "method": "POST",
            "body": {
              "source": "execloom-smoke-test"
            },
            "timeoutMs": 10000
          }
        },
        {
          "key": "finish",
          "type": "noop",
          "config": {}
        }
      ]
    }
  }'
```

Copy `workflow.id` from the response and continue with the same publish and trigger steps below.

## Publish The Workflow

```bash
curl -sS -X POST http://localhost:4000/workflows/WORKFLOW_ID/publish \
  -H "x-user-id: USER_ID"
```

## Trigger An Execution

```bash
curl -sS -X POST http://localhost:4000/workflows/WORKFLOW_ID/executions \
  -H "content-type: application/json" \
  -H "x-user-id: USER_ID" \
  -d '{
    "input": {
      "requestId": "demo_001"
    }
  }'
```

Copy `execution.id` from the response.

## Optional: Cancel An Execution

For a long-running execution, cancel it before the worker finishes:

```bash
curl -sS -X POST http://localhost:4000/executions/EXECUTION_ID/cancel \
  -H "x-user-id: USER_ID"
```

Expected result:

- `execution.status` is `cancelled`
- active step rows are marked `cancelled`
- events include `execution.cancelled`

## Check Execution Result

Wait a moment, then run:

```bash
curl -sS http://localhost:4000/executions/EXECUTION_ID \
  -H "x-user-id: USER_ID"
```

Expected result:

- `execution.status` is `succeeded`
- `steps` has 3 rows
- events include `execution.started`, `step.started`, `step.succeeded`, `step.queued`, and `execution.completed`
