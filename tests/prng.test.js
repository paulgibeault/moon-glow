import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32, pickIndex, pick } from '../js/prng.js';

// Known-answer vectors pin the ALGORITHM, not just its shape: prng.js now
// delegates to the vendored fleet companion (js/arcade-rng.js), and these
// exact values are what the pre-migration inline mulberry32 produced. If
// either file drifts — a local edit, a bad re-vendor — existing world seeds
// and saved rng states silently stop reproducing; this fails instead.
test('mulberry32 matches the pinned known-answer vectors', () => {
  const rng = mulberry32(42);
  assert.deepEqual(
    [rng(), rng(), rng()],
    [0.6011037519201636, 0.44829055899754167, 0.8524657934904099]);
  assert.equal(rng.getState(), 1199730185);
});

test('mulberry32 produces values in [0, 1)', () => {
  const rng = mulberry32(0xDEADBEEF);
  for (let i = 0; i < 1000; i++) {
    const v = rng();
    assert.ok(v >= 0 && v < 1, `out of range: ${v}`);
  }
});

test('mulberry32 is deterministic for the same seed', () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  for (let i = 0; i < 50; i++) {
    assert.equal(a(), b());
  }
});

test('mulberry32 diverges for different seeds', () => {
  const a = mulberry32(1);
  const b = mulberry32(2);
  let same = 0;
  for (let i = 0; i < 50; i++) {
    if (a() === b()) same++;
  }
  assert.ok(same < 5, `streams should diverge, got ${same} matches`);
});

test('pickIndex stays within [0, n)', () => {
  const rng = mulberry32(7);
  for (let i = 0; i < 200; i++) {
    const idx = pickIndex(rng, 6);
    assert.ok(Number.isInteger(idx) && idx >= 0 && idx < 6);
  }
});

test('pick returns one of the list elements', () => {
  const rng = mulberry32(99);
  const list = ['a', 'b', 'c'];
  for (let i = 0; i < 30; i++) {
    assert.ok(list.includes(pick(rng, list)));
  }
});
