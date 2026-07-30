// Thin adapter over the fleet's shared deterministic-rng companion — the
// algorithm lives in ./arcade-rng.js (vendored byte-identical copy of the
// launcher's /arcade-rng.js; see its header for the canonical-file rule).
// Kept as an adapter so the game's call idiom (free-function pick(rng, list))
// survives the migration. Streams are bit-identical to the old inline
// mulberry32, so existing world seeds and saved rng states reproduce exactly
// — tests/prng.test.js pins that with known-answer vectors.
// The single source of randomness for gameplay; never use Math.random.
import { makeRng } from './arcade-rng.js';

// The `>>> 0` preserves this module's historical numeric-seed contract
// (makeRng would hash a non-number seed via FNV-1a instead).
export function mulberry32(seed) {
  return makeRng(seed >>> 0);
}

// Resume a stream from a previously captured state (see rng.getState()).
// Used by the save/restore path so the exact same lantern colors keep coming.
export function mulberry32FromState(state) {
  return makeRng(state >>> 0);
}

export function pickIndex(rng, n) {
  return Math.floor(rng() * n);
}

export function pick(rng, list) {
  return list[pickIndex(rng, list.length)];
}
