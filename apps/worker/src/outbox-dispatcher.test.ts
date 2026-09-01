import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getOutboxDispatchBackoffMs } from "./outbox-dispatcher.js";

describe("execution outbox dispatcher", () => {
  it("uses capped exponential backoff for publication failures", () => {
    assert.equal(getOutboxDispatchBackoffMs(1), 1_000);
    assert.equal(getOutboxDispatchBackoffMs(2), 2_000);
    assert.equal(getOutboxDispatchBackoffMs(4), 8_000);
    assert.equal(getOutboxDispatchBackoffMs(20), 60_000);
  });
});
