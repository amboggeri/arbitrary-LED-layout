/** Short random ids. Uses crypto.getRandomValues when available (browser + Node 19+). */
const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

export function newId(prefix = "", size = 10): string {
  const bytes = new Uint8Array(size);
  globalThis.crypto.getRandomValues(bytes);
  let id = "";
  for (const b of bytes) id += ALPHABET[b % ALPHABET.length];
  return prefix ? `${prefix}_${id}` : id;
}
