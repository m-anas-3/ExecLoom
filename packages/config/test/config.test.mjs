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
    assert.equal(
      config.CREDENTIAL_ENCRYPTION_KEY,
      "bG9jYWwtZGV2ZWxvcG1lbnQtY3JlZGVudGlhbC1rZXk="
    );
    assert.equal(config.WORKER_STALLED_STEP_TIMEOUT_MS, 300_000);
    assert.equal(config.WORKER_RECOVERY_INTERVAL_MS, 60_000);
  });

  it("rejects credential encryption keys that are not 32 bytes", () => {
    assert.throws(
      () =>
        loadConfig({
          DATABASE_URL: "postgresql://execloom:execloom@localhost:5433/execloom",
          REDIS_URL: "redis://localhost:6379",
          CREDENTIAL_ENCRYPTION_KEY: Buffer.from("too-short").toString("base64")
        }),
      /CREDENTIAL_ENCRYPTION_KEY/
    );
  });

  it("rejects the local credential key in production", () => {
    assert.throws(
      () =>
        loadConfig({
          NODE_ENV: "production",
          DATABASE_URL: "postgresql://execloom:execloom@localhost:5433/execloom",
          REDIS_URL: "redis://localhost:6379"
        }),
      /CREDENTIAL_ENCRYPTION_KEY/
    );
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
