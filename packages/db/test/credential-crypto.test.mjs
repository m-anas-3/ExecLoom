import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  decryptCredentialSecret,
  encryptCredentialSecret
} from "../dist/index.js";

const key = Buffer.from("0123456789abcdef0123456789abcdef").toString("base64");

describe("credential encryption", () => {
  it("encrypts and decrypts a secret with authenticated context", () => {
    const encrypted = encryptCredentialSecret("super-secret", "owner:credential", key);

    assert.notEqual(encrypted.ciphertext, "super-secret");
    assert.equal(
      decryptCredentialSecret(encrypted, "owner:credential", key),
      "super-secret"
    );
  });

  it("uses a unique IV for every encryption", () => {
    const first = encryptCredentialSecret("same-secret", "owner:credential", key);
    const second = encryptCredentialSecret("same-secret", "owner:credential", key);

    assert.notEqual(first.iv, second.iv);
    assert.notEqual(first.ciphertext, second.ciphertext);
  });

  it("rejects modified ciphertext or context", () => {
    const encrypted = encryptCredentialSecret("super-secret", "owner:credential", key);
    const tampered = {
      ...encrypted,
      ciphertext: Buffer.from("modified").toString("base64")
    };

    assert.throws(() => decryptCredentialSecret(tampered, "owner:credential", key));
    assert.throws(() => decryptCredentialSecret(encrypted, "another:credential", key));
  });
});
