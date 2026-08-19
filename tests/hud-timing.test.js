// The HUD's two timed behaviours, both of which used to be measured in frames
// rather than in time. That made them run at half speed on every phone and in
// every power-saver session — and because isHudSettled() gates the loop's
// park, the frame-rate saving bought itself twice as long on the scheduler.
import { test } from "node:test";
import assert from "node:assert";
import {
  tweenHud, resetHudState, isHudSettled, quickRestartWakeMs, hudDisplayScore, hudBestFlash,
} from "../js/renderer/hud.js";
import { advanceClock, resetClock } from "../js/clock.js";
import { QUICK_RESTART_ARM_SEC } from "../js/game.js";

const FRAME_60 = 1000 / 60;
const settings = { reducedMotion: false };

test("at 60fps the count-up is bit-identical to the old per-frame expression", () => {
  // The expression this replaced, run forward independently:
  //   const raw = diff * 0.12
  //   displayScore += Math.abs(raw) < 1 ? Math.sign(diff) : raw
  const target = 5000;
  const expected = [];
  let v = 0;
  for (let i = 0; i < 200; i++) {
    const diff = target - v;
    const raw = diff * 0.12;
    v += Math.abs(raw) < 1 ? Math.sign(diff) : raw;
    if ((diff > 0 && v > target) || (diff < 0 && v < target)) v = target;
    expected.push(v);
  }

  resetHudState();
  const game = { score: target, quickRestartArmed: false };
  for (let i = 0; i < expected.length; i++) {
    tweenHud(game, settings, FRAME_60);
    assert.strictEqual(hudDisplayScore(), expected[i],
      `frame ${i}: 60fps must be bit-identical, not merely close`);
  }
});

test("at 60fps the best-flash decay is bit-identical too", () => {
  resetHudState();
  const game = { score: 0, quickRestartArmed: false };
  // The frame that raises the flash also decays it — as it always did.
  tweenHud(game, { ...settings, bestScore: 100 }, FRAME_60);
  for (let i = 1; i <= 10; i++) {
    assert.ok(Math.abs(hudBestFlash() - (1 - 0.012 * i)) < 1e-12,
      `frame ${i}: expected ${1 - 0.012 * i}, got ${hudBestFlash()}`);
    tweenHud(game, settings, FRAME_60);
  }
});

// Feed frames of `dtMs` until the counter converges; report the wall time it
// took. This is the number that used to double when the frame rate halved.
function msToConverge(target, dtMs) {
  resetHudState();
  const game = { score: target, quickRestartArmed: false };
  let elapsed = 0;
  for (let i = 0; i < 100000; i++) {
    tweenHud(game, settings, dtMs);
    elapsed += dtMs;
    if (isHudSettled(game)) return elapsed;
  }
  throw new Error("the counter never converged");
}

test("the count-up takes the same wall time at 30fps as at 60fps", () => {
  const at60 = msToConverge(5000, FRAME_60);
  const at30 = msToConverge(5000, FRAME_60 * 2);
  // Within one 30fps frame — the quantization floor, not drift.
  assert.ok(Math.abs(at30 - at60) <= FRAME_60 * 2,
    `60fps took ${at60.toFixed(1)}ms, 30fps took ${at30.toFixed(1)}ms`);
});

test("the best-flash decays over the same wall time at any cadence", () => {
  function msToFade(dtMs) {
    resetHudState();
    const game = { score: 0, quickRestartArmed: false };
    tweenHud(game, { ...settings, bestScore: 100 }, dtMs);
    let elapsed = 0;
    for (let i = 0; i < 100000 && hudBestFlash() > 0; i++) {
      tweenHud(game, settings, dtMs);
      elapsed += dtMs;
    }
    return elapsed;
  }
  assert.ok(Math.abs(msToFade(FRAME_60 * 2) - msToFade(FRAME_60)) <= FRAME_60 * 2);
});

test("a frame that admits no time moves nothing", () => {
  // The first frame back from a park reports dtMs 0. It must not be a no-op
  // that silently costs the counter a step, nor a step of unknown size.
  resetHudState();
  const game = { score: 5000, quickRestartArmed: false };
  tweenHud(game, settings, 0);
  assert.strictEqual(hudDisplayScore(), 0);
});

test("reduced motion still snaps the counter, at any cadence", () => {
  resetHudState();
  const game = { score: 5000, quickRestartArmed: false };
  tweenHud(game, { reducedMotion: true }, 0);
  assert.strictEqual(hudDisplayScore(), 5000);
});

// ─── the armed quick-restart button ─────────────────────────────────────────

test("an armed button holds the loop awake only while its pulse is moving", () => {
  resetHudState();
  const game = { score: 0, quickRestartArmed: true, quickRestartArmedTime: 0 };

  // Ambience running: the pulse is live, so drawing it is real work.
  resetClock();
  advanceClock(0, false);
  advanceClock(100, false);
  assert.strictEqual(isHudSettled(game), false);

  // Stillness: the pulse is frozen on one frame, so three seconds of frames
  // would be three seconds of identical output. Park instead.
  resetClock();
  advanceClock(0, true);
  advanceClock(100, true);
  assert.strictEqual(isHudSettled(game), true);
});

test("the park books a wake for the arm's expiry", () => {
  resetClock();
  advanceClock(0, true);
  const game = { score: 0, quickRestartArmed: true, quickRestartArmedTime: 0 };

  assert.strictEqual(quickRestartWakeMs(game), QUICK_RESTART_ARM_SEC * 1000,
    "freshly armed: the whole window is still to come");

  advanceClock(200, true);
  assert.ok(Math.abs(quickRestartWakeMs(game) - (QUICK_RESTART_ARM_SEC * 1000 - 200)) < 1e-9);

  // Past the window, the wake is due immediately rather than negative.
  resetClock();
  advanceClock(0, true);
  for (let t = 200; t <= (QUICK_RESTART_ARM_SEC + 1) * 1000; t += 200) advanceClock(t, true);
  assert.strictEqual(quickRestartWakeMs(game), 0);
});

test("nothing pending means no wake is booked", () => {
  assert.strictEqual(quickRestartWakeMs({ quickRestartArmed: false }), Infinity);
  assert.strictEqual(quickRestartWakeMs(null), Infinity);
});
