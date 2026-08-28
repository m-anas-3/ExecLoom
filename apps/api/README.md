# API

HTTP API, authentication, workflow management, execution trigger endpoints, and realtime gateway.

## Tests

Normal tests run without local infrastructure:

```bash
pnpm --filter @execloom/api test
```

API integration tests are opt-in because they need local PostgreSQL and Redis:

```bash
EXECLOOM_RUN_INTEGRATION_TESTS=1 pnpm --filter @execloom/api test
```
