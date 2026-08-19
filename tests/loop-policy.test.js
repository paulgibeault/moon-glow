// When the screen is allowed to rest. Every condition here is worth a battery
// bill or a stranded animation: one that wrongly permits a park freezes motion
// the player is watching, and one that wrongly refuses spins the display at
// 60fps over a still image.
import { test } from "node:test";
import assert from "node:assert";
import { isQuiescent } from "../js/loop-policy.js";

// A board that has genuinely settled: aiming, nothing in flight, nothing
// animating, no menu, and the player's finger long since lifted.
const settled = Object.freeze({
  hasGame: true,
  loading: false,
  introCard: false,
  puzzleAwaitingEnd: false,
  menuOpen: false,
  menuSettled: true,
  speedAiming: false,
  shotsInFlight: false,
  withinInteractionTail: false,
  aiming: true,
  effectsActive: false,
  hudSettled: true,
});

test("a settled board lets the screen rest", () => {
  assert.strictEqual(isQuiescent(settled), true);
});

// Each of these, on its own, is a reason to keep drawing.
const blockers = {
  "no game yet":                { hasGame: false },
  "assets still loading":       { loading: true },
  "the mode intro card is up":  { introCard: true },
  "a puzzle waiting to resolve": { puzzleAwaitingEnd: true },
  "speed mode is counting down": { speedAiming: true },
  "a lantern is in flight":     { shotsInFlight: true },
  "the player just touched the screen": { withinInteractionTail: true },
  "the phase is not aiming":    { aiming: false },
  "bursts or ripples are live": { effectsActive: true },
  "the score counter is climbing": { hudSettled: false },
  "the menu is still fading":   { menuSettled: false },
};

for (const [why, override] of Object.entries(blockers)) {
  test(`the loop stays awake: ${why}`, () => {
    assert.strictEqual(isQuiescent({ ...settled, ...override }), false);
  });
}

test("an open menu parks once its fade lands, whatever the board is doing", () => {
  // The board behind an open panel is not being played, so the panel's own
  // fade is the only thing that can still need frames. This branch returns
  // rather than falling through — deliberately, so a menu opened over a
  // mid-flight shot still parks.
  const open = { ...settled, menuOpen: true, shotsInFlight: true, effectsActive: true, aiming: false };
  assert.strictEqual(isQuiescent({ ...open, menuSettled: true }), true);
  assert.strictEqual(isQuiescent({ ...open, menuSettled: false }), false);
});

test("an open menu never parks while the game itself is unready", () => {
  // The checks above the menu branch still have to win — a menu opened over a
  // loading screen must not park the loop the loader needs.
  assert.strictEqual(
    isQuiescent({ ...settled, menuOpen: true, menuSettled: true, loading: true }), false);
  assert.strictEqual(
    isQuiescent({ ...settled, menuOpen: true, menuSettled: true, introCard: true }), false);
  assert.strictEqual(
    isQuiescent({ ...settled, menuOpen: true, menuSettled: true, puzzleAwaitingEnd: true }), false);
});

test("every blocker is independent — no two of them cancel out", () => {
  // Guards against a future rewrite that collapses these into one expression
  // and loses a term: any pair still refuses.
  const keys = Object.values(blockers);
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      assert.strictEqual(isQuiescent({ ...settled, ...keys[i], ...keys[j] }), false);
    }
  }
});
