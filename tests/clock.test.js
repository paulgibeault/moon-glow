// js/clock.js — the rule that a parked loop's dead time is not animation.
//
// The game parks its rAF loop the moment the board settles (§6d), the launcher
// cancels it on suspend, and a locked phone stops it indefinitely. Everything
// that animates on elapsed time reads one of these clocks, so this is the one
// place that has to get "how much time did this frame actually earn" right.
import { test } from "node:test";
import assert from "node:assert";
import {
  advanceClock, suspendClock, renderClock, ambientClock,
  emberClock, emberTickIndex, resetClock, MAX_FRAME_MS, EMBER_HZ,
} from "../js/clock.js";

test("the first frame ever admits nothing", () => {
  resetClock();
  assert.strictEqual(advanceClock(1000, false), 0);
  assert.strictEqual(renderClock(), 0);
});

test("running frames accumulate their real deltas", () => {
  resetClock();
  advanceClock(1000, false);
  assert.strictEqual(advanceClock(1016, false), 16);
  assert.strictEqual(advanceClock(1032, false), 16);
  assert.strictEqual(renderClock(), 0.032);
});

test("a parked gap never reaches the clock", () => {
  resetClock();
  advanceClock(1000, false);
  advanceClock(1016, false);
  assert.strictEqual(renderClock(), 0.016);

  // The loop parks; eight seconds of pocket happen.
  suspendClock();
  assert.strictEqual(advanceClock(9016, false), 0,
    "the first frame back must contribute nothing");
  assert.strictEqual(renderClock(), 0.016, "the clock must not have moved");

  // ...and the frame after that is an ordinary frame again.
  assert.strictEqual(advanceClock(9032, false), 16);
});

test("an unannounced gap is capped rather than admitted whole", () => {
  // A backgrounded tab is throttled by the browser with none of our hooks
  // firing, so there is no suspendClock() to save us. The cap is the backstop.
  resetClock();
  advanceClock(1000, false);
  assert.strictEqual(advanceClock(31000, false), MAX_FRAME_MS);
});

test("a non-monotonic timestamp winds nothing backwards", () => {
  resetClock();
  advanceClock(1000, false);
  advanceClock(1016, false);
  assert.strictEqual(advanceClock(900, false), 0);
  assert.strictEqual(renderClock(), 0.016);
});

test("stillness freezes the decorative clocks and not the render clock", () => {
  resetClock();
  advanceClock(0, true);
  advanceClock(200, true);
  advanceClock(400, true);
  assert.strictEqual(renderClock(), 0.4, "gameplay keeps its own time under power saver");
  assert.strictEqual(ambientClock(), 0);
  assert.strictEqual(emberClock(), 0);
  assert.strictEqual(emberTickIndex(), 0);
});

test("the ember clock steps EMBER_HZ times a second and holds between steps", () => {
  resetClock();
  advanceClock(0, false);
  const stepMs = 1000 / EMBER_HZ;

  advanceClock(stepMs * 0.4, false);
  const first = emberTickIndex();
  advanceClock(stepMs * 0.9, false);
  assert.strictEqual(emberTickIndex(), first,
    "two frames inside one step must be the same cache key");
  assert.strictEqual(emberClock(), first / EMBER_HZ);

  advanceClock(stepMs * 1.1, false);
  assert.strictEqual(emberTickIndex(), first + 1);

  // A full second of frames is exactly EMBER_HZ steps — the flicker rate the
  // field cache trades sixty repaints a second for.
  resetClock();
  advanceClock(0, false);
  for (let t = 10; t <= 1000; t += 10) advanceClock(t, false);
  assert.strictEqual(emberTickIndex(), EMBER_HZ);
});

test("the ambient clock tracks the render clock while ambience runs", () => {
  resetClock();
  advanceClock(0, false);
  advanceClock(500, false);
  assert.strictEqual(ambientClock(), renderClock());
});
