import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { loadConfig } from "../dist/index.js";

describe("loadConfig", () => {
  it("parses required service URLs and default worker recovery values", () => {
    const config = loadConfig({
      DATABASE_URL: "postgresql://execloom:execloom@localhost:5433/execloom",
      REDIS_URL: "redis://localhost:6379"
    });

    assert.equal(config.NODE_ENV, "development");
    assert.equal(config.API_PORT, 4000);
    assert.equal(config.AUTH_JWT_SECRET, "local-development-jwt-secret-change-me");
    assert.equal(config.AUTH_ACCESS_TOKEN_TTL, "7d");
    assert.equal(config.WORKER_STALLED_STEP_TIMEOUT_MS, 300_000);
    assert.equal(config.WORKER_RECOVERY_INTERVAL_MS, 60_000);
  });

  it("parses explicit worker recovery values", () => {
    const config = loadConfig({
      DATABASE_URL: "postgresql://execloom:execloom@localhost:5433/execloom",
      REDIS_URL: "redis://localhost:6379",
      WORKER_STALLED_STEP_TIMEOUT_MS: "120000",
      WORKER_RECOVERY_INTERVAL_MS: "30000"
    });

    assert.equal(config.WORKER_STALLED_STEP_TIMEOUT_MS, 120_000);
    assert.equal(config.WORKER_RECOVERY_INTERVAL_MS, 30_000);
  });
});
