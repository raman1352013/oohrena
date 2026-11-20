/**
 * Perceptual Image Hashing for duplicate listing detection.
 * Samples spatial blocks across the image buffer to produce a 64-bit perceptual fingerprint.
 */
export function computePerceptualHash(buffer: Buffer): string | null {
  if (buffer.length < 512) return null;
  const blockSize = Math.floor(buffer.length / 64);
  const values: number[] = new Array(64);
  let total = 0;
  for (let i = 0; i < 64; i++) {
    let sum = 0;
    const start = i * blockSize;
    const end = Math.min(start + blockSize, buffer.length);
    for (let j = start; j < end; j++) {
      sum += buffer[j]!;
    }
    const avg = sum / (end - start);
    values[i] = avg;
    total += avg;
  }
  const mean = total / 64;
  let hashHex = "";
  for (let i = 0; i < 64; i += 4) {
    let nibble = 0;
    for (let bit = 0; bit < 4; bit++) {
      if (values[i + bit]! >= mean) {
        nibble |= 1 << (3 - bit);
      }
    }
    hashHex += nibble.toString(16);
  }
  return hashHex;
}

export function hammingDistance(hashA: string, hashB: string): number {
  if (!hashA || !hashB || hashA.length !== hashB.length) return 64;
  let dist = 0;
  for (let i = 0; i < hashA.length; i++) {
    const valA = parseInt(hashA[i]!, 16);
    const valB = parseInt(hashB[i]!, 16);
    let xor = valA ^ valB;
    while (xor > 0) {
      dist += xor & 1;
      xor >>= 1;
    }
  }
  return dist;
}

export function arePhotosSimilar(hashA: string, hashB: string, threshold = 8): boolean {
  return hammingDistance(hashA, hashB) <= threshold;
}
