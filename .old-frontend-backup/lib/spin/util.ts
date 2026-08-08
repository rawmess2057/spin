export function seedBytes(s: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(s);
}

export function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

// Port of base-x decode (big-endian base256 with leading-'1' handling).
export function base58ToBytes(source: string): Uint8Array<ArrayBuffer> {
  if (source.length === 0) return new Uint8Array(0);

  const BASE_MAP = new Int32Array(256).fill(-1);
  for (let i = 0; i < BASE58_ALPHABET.length; i++) {
    BASE_MAP[BASE58_ALPHABET.charCodeAt(i)] = i;
  }
  const LEADER = BASE58_ALPHABET[0];
  const FACTOR = Math.log(BASE58_ALPHABET.length) / Math.log(256);

  let psz = 0;
  let zeroes = 0;
  while (source[psz] === LEADER) {
    zeroes++;
    psz++;
  }
  const size = ((source.length - psz) * FACTOR + 1) >>> 0;
  const b256 = new Uint8Array(size);
  let length = 0;

  while (psz < source.length) {
    const charCode = source.charCodeAt(psz);
    if (charCode > 255) throw new Error(`bad base58: ${source}`);
    let carry = BASE_MAP[charCode];
    if (carry === -1) throw new Error(`bad base58: ${source}`);
    let i = 0;
    for (
      let it3 = size - 1;
      (carry !== 0 || i < length) && it3 !== -1;
      it3--, i++
    ) {
      carry += (58 * b256[it3]) >>> 0;
      b256[it3] = (carry % 256) >>> 0;
      carry = (carry / 256) >>> 0;
    }
    if (carry !== 0) throw new Error("non-zero carry");
    length = i;
    psz++;
  }

  let it4 = size - length;
  while (it4 !== size && b256[it4] === 0) {
    it4++;
  }
  const result = new Uint8Array(zeroes + (size - it4));
  result.fill(0, 0, zeroes);
  let j = zeroes;
  while (it4 !== size) {
    result[j++] = b256[it4++];
  }
  return result;
}

// Port of base-x encode (big-endian base256 with leading-'1' handling).
export function bytesToBase58(source: Uint8Array): string {
  let zeroes = 0;
  let pbegin = 0;
  while (pbegin !== source.length && source[pbegin] === 0) {
    pbegin++;
    zeroes++;
  }
  if (pbegin === source.length) return "1".repeat(zeroes);
  const iFACTOR = Math.log(256) / Math.log(BASE58_ALPHABET.length);
  const size = ((source.length - pbegin) * iFACTOR + 1) >>> 0;
  const b58 = new Uint8Array(size);
  let length = 0;
  while (pbegin !== source.length) {
    let carry = source[pbegin];
    let i = 0;
    for (
      let it = size - 1;
      (carry !== 0 || i < length) && it !== -1;
      it--, i++
    ) {
      carry += (256 * b58[it]) >>> 0;
      b58[it] = (carry % 58) >>> 0;
      carry = (carry / 58) >>> 0;
    }
    if (carry !== 0) throw new Error("non-zero carry");
    length = i;
    pbegin++;
  }
  let it2 = size - length;
  while (it2 !== size && b58[it2] === 0) {
    it2++;
  }
  let out = "1".repeat(zeroes);
  while (it2 !== size) {
    out += BASE58_ALPHABET[b58[it2++]];
  }
  return out;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Anchor instruction discriminator: first 8 bytes of sha256("global:<name>"). */
export async function ixDiscriminator(name: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    seedBytes(`global:${name}`)
  );
  return new Uint8Array(digest.slice(0, 8));
}

export function concatBytes(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const total = parts.reduce((acc, p) => acc + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

export function u8(v: number): Uint8Array {
  return new Uint8Array([v & 0xff]);
}

export function u64Le(v: bigint | number): Uint8Array {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, BigInt(v), true);
  return out;
}
