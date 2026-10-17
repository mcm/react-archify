// node:crypto subset: synchronous SHA-256/SHA-1 digests and random bytes.
import { sha1 } from '@noble/hashes/legacy.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { Buffer } from 'buffer';

const ALGORITHMS = { sha256, sha1 };

export function createHash(algorithm) {
  const hash = ALGORITHMS[String(algorithm).toLowerCase()];
  if (!hash) throw new Error(`crypto shim: unsupported hash ${algorithm}`);
  const chunks = [];
  const api = {
    update(data, encoding) {
      chunks.push(typeof data === 'string' ? Buffer.from(data, encoding || 'utf8') : Buffer.from(data));
      return api;
    },
    digest(encoding) {
      const digest = Buffer.from(hash(Buffer.concat(chunks)));
      return encoding ? digest.toString(encoding) : digest;
    },
  };
  return api;
}

export function randomBytes(size) {
  const bytes = new Uint8Array(size);
  globalThis.crypto.getRandomValues(bytes);
  return Buffer.from(bytes);
}

export function randomUUID() {
  return globalThis.crypto.randomUUID();
}

export default { createHash, randomBytes, randomUUID };
