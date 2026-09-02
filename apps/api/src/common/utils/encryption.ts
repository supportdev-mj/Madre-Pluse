import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { InternalServerErrorException } from '@nestjs/common';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

/** TOKEN_ENCRYPTION_KEY must be 32 random bytes, base64-encoded (`openssl rand -base64 32`). */
function loadKey(rawKey: string): Buffer {
  if (!rawKey) {
    throw new InternalServerErrorException('TOKEN_ENCRYPTION_KEY is not configured on this server');
  }
  const key = Buffer.from(rawKey, 'base64');
  if (key.length !== 32) {
    throw new InternalServerErrorException('TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes');
  }
  return key;
}

/** Encrypts a secret (e.g. a Google OAuth refresh token) for storage. Output: base64(iv):base64(authTag):base64(ciphertext). */
export function encryptSecret(plaintext: string, rawKey: string): string {
  const key = loadKey(rawKey);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, ciphertext].map((buf) => buf.toString('base64')).join(':');
}

export function decryptSecret(encoded: string, rawKey: string): string {
  const key = loadKey(rawKey);
  const [ivB64, authTagB64, ciphertextB64] = encoded.split(':');
  if (!ivB64 || !authTagB64 || !ciphertextB64) {
    throw new InternalServerErrorException('Malformed encrypted secret');
  }
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(authTagB64, 'base64'));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextB64, 'base64')), decipher.final()]);
  return plaintext.toString('utf8');
}
