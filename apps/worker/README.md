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
