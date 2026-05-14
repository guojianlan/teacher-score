import { randomBytes } from 'node:crypto';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Crockford-base32 random id, prefixed for human inspection. */
export function randomId(prefix: string): string {
  const bytes = randomBytes(16);
  let bits = 0n;
  for (const b of bytes) bits = (bits << 8n) | BigInt(b);
  let out = '';
  for (let i = 0; i < 26; i++) {
    out = ALPHABET[Number(bits & 31n)]! + out;
    bits >>= 5n;
  }
  return `${prefix}_${out}`;
}
