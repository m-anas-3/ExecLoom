# Worker

BullMQ workers responsible for executing workflow steps outside the request lifecycle.

## Supported Step Types

### noop

Returns the received step input. Useful for smoke tests and pipeline checks.

```json
{
  "key": "start",
  "type": "noop",
  "config": {}
}
```

### delay

Waits for the configured number of milliseconds. Defaults to `1000`.

```json
{
  "key": "wait",
  "type": "delay",
  "config": {
    "ms": 100
  }
}
```

### http

Calls an external HTTP API. `url` is required. `method`, `headers`, `body`, and `timeoutMs` are optional.

```json
{
  "key": "notify",
  "type": "http",
  "config": {
    "url": "https://example.com/webhook",
    "method": "POST",
    "headers": {
      "authorization": "Bearer local-dev-token"
    },
    "body": {
      "event": "execution.completed"
    },
    "timeoutMs": 10000
  }
}
```

HTTP steps fail when the response is not `2xx` or the request exceeds `timeoutMs`.
Localhost and private network URLs are rejected to reduce SSRF risk from user-defined workflows.

## Step Retries

Every step defaults to one attempt. Add `retry` when a failed step should be queued again before the execution is marked failed.

```json
{
  "key": "notify",
  "type": "http",
  "retry": {
    "maxAttempts": 3,
    "backoffMs": 2000
  },
  "config": {
    "url": "https://example.com/webhook",
    "method": "POST"
  }
}
```

Use retries only for idempotent steps or external APIs that can safely handle duplicate requests.

## Stalled Step Recovery

The worker periodically scans PostgreSQL for old `running` step runs. If a worker process crashed mid-step, recovery either queues that step again when retry attempts remain or marks the execution failed when attempts are exhausted.

Relevant environment variables:

- `WORKER_STALLED_STEP_TIMEOUT_MS`: how old a `running` step must be before recovery handles it
- `WORKER_RECOVERY_INTERVAL_MS`: how often the worker scans for stalled steps
