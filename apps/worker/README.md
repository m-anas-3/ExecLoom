# Worker

BullMQ workers responsible for executing workflow steps outside the request lifecycle.

Execution jobs are published by the worker's transactional-outbox dispatcher. API and step-state transactions persist an enqueue intent in PostgreSQL; the dispatcher publishes it to BullMQ with a deterministic job ID and retries safely when Redis is unavailable.

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

Calls an external HTTP API. `url` is required. `method`, `headers`, `body`, and `timeoutMs` are optional. URL, header values, and body values can use workflow expressions.

```json
{
  "key": "notify",
  "type": "http",
  "config": {
    "url": "https://example.com/webhook",
    "method": "POST",
    "headers": {
      "x-customer-id": "{{ trigger.customerId }}"
    },
    "body": {
      "email": "{{ steps.fetch-customer.output.email }}"
    },
    "timeoutMs": 10000
  }
}
```

HTTP steps fail when the response is not `2xx` or the request exceeds `timeoutMs`.
Localhost and private network URLs are rejected to reduce SSRF risk from user-defined workflows.

### ai

Calls the OpenAI Responses API with a selected Bearer-token credential and requires structured JSON output. Prompts support workflow expressions. The worker validates the JSON Schema before the request and validates the returned value again before completing the step.

```json
{
  "key": "analyze",
  "type": "ai",
  "config": {
    "credentialId": "00000000-0000-4000-8000-000000000001",
    "model": "gpt-5.6-luna",
    "systemPrompt": "Score the customer record.",
    "userPrompt": "Customer email: {{ steps.fetch-customer.output.email }}",
    "outputSchema": {
      "type": "object",
      "properties": {
        "score": { "type": "number" }
      },
      "required": ["score"],
      "additionalProperties": false
    },
    "timeoutMs": 60000,
    "maxOutputTokens": 2000
  }
}
```

Provider response IDs, model IDs, token counts, and duration are stored as step metadata. Credential secrets and prompts are not copied into result metadata.

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
