// Deterministic randomness for the show.
//
// Both browser windows compute every frame independently from the wall clock.
// Math.random() would make them disagree, so all variation in the show comes
// from hashing an integer slot index instead. Same slot, same result, forever.

const UINT32 = 4294967296;
const GOLDEN = 0x9e3779b1;

/** Mix an integer into a well-distributed unsigned 32-bit value. */
export function hash32(n) {
  let h = n | 0;
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

/** A stable float in [0,1) for slot `n`. `salt` gives independent streams. */
export function rand01(n, salt = 0) {
  return hash32(Math.imul(n, GOLDEN) + salt) / UINT32;
}

/** A stable integer in [0, count) for slot `n`. */
export function randInt(n, count, salt = 0) {
  return Math.floor(rand01(n, salt) * count);
}

/** A stable element of `items` for slot `n`. */
export function pick(items, n, salt = 0) {
  return items[randInt(n, items.length, salt)];
}
