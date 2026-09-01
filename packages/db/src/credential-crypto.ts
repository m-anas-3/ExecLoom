import {
  createCipheriv,
  createDecipheriv,
  randomBytes
} from "node:crypto";

import { loadConfig } from "@execloom/config";

const algorithm = "aes-256-gcm";
const ivLength = 12;
const authTagLength = 16;

export type EncryptedCredentialSecret = {
  ciphertext: string;
  iv: string;
  authTag: string;
};

export function encryptCredentialSecret(
  secret: string,
  context: string,
  encodedKey = loadConfig().CREDENTIAL_ENCRYPTION_KEY
): EncryptedCredentialSecret {
  const key = decodeEncryptionKey(encodedKey);
  const iv = randomBytes(ivLength);
  const cipher = createCipheriv(algorithm, key, iv, { authTagLength });
  cipher.setAAD(Buffer.from(context, "utf8"));

  const ciphertext = Buffer.concat([
    cipher.update(secret, "utf8"),
    cipher.final()
  ]);

  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64")
  };
}

export function decryptCredentialSecret(
  encrypted: EncryptedCredentialSecret,
  context: string,
  encodedKey = loadConfig().CREDENTIAL_ENCRYPTION_KEY
): string {
  const key = decodeEncryptionKey(encodedKey);
  const iv = Buffer.from(encrypted.iv, "base64");
  const authTag = Buffer.from(encrypted.authTag, "base64");

  if (iv.length !== ivLength || authTag.length !== authTagLength) {
    throw new Error("Credential encryption metadata is invalid");
  }

  const decipher = createDecipheriv(algorithm, key, iv, { authTagLength });
  decipher.setAAD(Buffer.from(context, "utf8"));
  decipher.setAuthTag(authTag);

  return Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
    decipher.final()
  ]).toString("utf8");
}

function decodeEncryptionKey(encodedKey: string): Buffer {
  const key = Buffer.from(encodedKey, "base64");

  if (key.length !== 32 || key.toString("base64") !== encodedKey) {
    throw new Error("Credential encryption key must be a base64-encoded 32-byte key");
  }

  return key;
}
