/**
 * clock.js — the game's time sources, and the one place that decides how much
 * time a frame is allowed to admit.
 *
 * The wall clock keeps running while frames do not. This game parks its rAF
 * loop the moment the board settles (main.js, GAME_INTEGRATION §6d), the
 * launcher cancels it outright on suspend, and a locked phone stops it for
 * however long the player's pocket lasts. Anything that reads
 * `performance.now()` for itself counts every one of those dead intervals as
 * elapsed animation — a recoil that was a third of the way through at park
 * time reads as finished on the first frame back.
 *
 * So time is accumulated here, from deltas between *rendered frames*, and
 * everything downstream reads one of the three views of it:
 *
 *   renderClock()  seconds of frames actually drawn. Gameplay stamps
 *                  (recoil, launch, queue rotation, the quick-restart arm)
 *                  measure against this, so a park costs them nothing.
 *   ambientClock() the decorative clock — star twinkle, water shimmer, the
 *                  moon's halo breath, the lantern embers. Held at 0 when the
 *                  player has asked for stillness (reduced motion or the
 *                  power-saver lever), which settles every decorative effect
 *                  on one resting frame at a stroke. renderer/style.js
 *                  documents which motion counts as decoration and why.
 *
 *                  It is also QUANTIZED, to AMBIENT_HZ. Decoration is the tier
 *                  §6d says an idle game should be willing to give up, and a
 *                  tier that changes ten times a second instead of sixty is
 *                  one the renderer can cache between ticks — which is exactly
 *                  what renderer/world.js does with the whole scene. The
 *                  quantization is what makes the cache possible; without it
 *                  no two frames are ever alike and there is nothing to reuse.
 *
 *                  Gameplay motion never touches this clock, so a shot in
 *                  flight, the descent and the launcher's recoil stay smooth
 *                  at whatever cadence the device is running.
 *
 * Deliberately free of DOM and Arcade references: game.js and the renderer
 * both import it, and both have to stay node-importable for the unit suite.
 */

// Backstop for gaps nobody announced. suspendClock() covers every park this
// game performs on purpose; a browser that throttles a backgrounded tab fires
// none of our hooks, so an un-suspended gap is capped here instead. Longer
// than any frame a running game produces, short enough that the cap costs a
// blink rather than a whole animation.
export const MAX_FRAME_MS = 250;

// Cadence of the decorative tier. Ten steps a second is fast enough that an
// ember reads as a flame and the water reads as moving, and slow enough that
// the scene is a cacheable still image between steps.
export const AMBIENT_HZ = 10;
const AMBIENT_STEP_MS = 1000 / AMBIENT_HZ;

let renderMs = 0;
// -1 means "the next frame is a fresh start, however far off it is" — the
// state every deliberate park leaves behind.
let lastFrameMs = -1;
let ambientSec = 0;
let ambientTick = 0;

/**
 * The loop is stopping. Call from every deliberate park/suspend so the gap
 * that follows never reaches the clocks.
 */
export function suspendClock() {
  lastFrameMs = -1;
}

/**
 * Wind the clocks for one frame. Call exactly once per rendered frame, before
 * anything reads them.
 *
 * @param {number} nowMs   a monotonic timestamp (the rAF one).
 * @param {boolean} still  true when the player has asked for stillness, which
 *                         freezes the ambient and ember views but never the
 *                         render clock — gameplay keeps its own time.
 * @returns {number} milliseconds admitted this frame: 0 on the first frame
 *                   after a park, capped at MAX_FRAME_MS otherwise. This is
 *                   the dt every frame-rate-independent tween should use.
 */
export function advanceClock(nowMs, still) {
  let dtMs = 0;
  if (lastFrameMs >= 0) {
    const delta = nowMs - lastFrameMs;
    // A non-monotonic timestamp contributes nothing rather than winding the
    // clock backwards.
    if (delta > 0) dtMs = delta < MAX_FRAME_MS ? delta : MAX_FRAME_MS;
  }
  lastFrameMs = nowMs;
  renderMs += dtMs;
  if (still) {
    ambientSec = 0;
    ambientTick = 0;
  } else {
    ambientTick = Math.floor(renderMs / AMBIENT_STEP_MS);
    ambientSec = (ambientTick * AMBIENT_STEP_MS) / 1000;
  }
  return dtMs;
}

/** Seconds of rendered frames. Gameplay stamps measure against this. */
export function renderClock() {
  return renderMs / 1000;
}

/**
 * The decorative clock: the render clock quantized to AMBIENT_HZ, or 0 when
 * the player has asked for stillness.
 */
export function ambientClock() {
  return ambientSec;
}

/**
 * Integer index of the current decorative step. Changes AMBIENT_HZ times a
 * second while ambience runs, and never while it is still — which makes it
 * exactly the cache key for anything whose only motion is decoration.
 */
export function ambientTickIndex() {
  return ambientTick;
}

/** Test seam: forget every accumulated tick. Not used by the game. */
export function resetClock() {
  renderMs = 0;
  lastFrameMs = -1;
  ambientSec = 0;
  ambientTick = 0;
}
