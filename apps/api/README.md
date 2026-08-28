# API

HTTP API, authentication, workflow management, execution trigger endpoints, and realtime gateway.

## Auth

Register:

```bash
curl -sS -X POST http://localhost:4000/auth/register \
  -H "content-type: application/json" \
  -d '{"email":"demo@example.com","password":"local-dev-password"}'
```

Login:

```bash
curl -sS -X POST http://localhost:4000/auth/login \
  -H "content-type: application/json" \
  -d '{"email":"demo@example.com","password":"local-dev-password"}'
```

Protected routes require:

```text
Authorization: Bearer ACCESS_TOKEN
```

## Tests

Normal tests run without local infrastructure:

```bash
pnpm --filter @execloom/api test
```

API integration tests are opt-in because they need local PostgreSQL and Redis:

```bash
EXECLOOM_RUN_INTEGRATION_TESTS=1 pnpm --filter @execloom/api test
```
