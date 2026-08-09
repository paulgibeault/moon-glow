// The power-saver contract, GAME_INTEGRATION §5 ("Canvas-rendered games") and
// §6d ("Let the screen rest") — the half of it that is this game's own policy:
// which motion is ambience (droppable) and which is the game talking to the
// player (kept), expressed by renderer/style.js.
//
// The other half used to live here too: source scans asserting that the
// setting is read defensively and that no stylesheet reintroduces an infinite
// animation behind the canvas's back. Those moved to the launcher's
// tools/contract-gates.mjs, which fleet-ci runs against every caller. Both
// rules still hold here — they are enforced from the one place the fleet
// CI/CD standard says drift gates live, instead of from a copy that only this
// repo benefits from.
//
// This copy was the best of the three in the fleet, and it left its mark on
// what replaced it: the whole-file form of the animation scan and the trick of
// excluding the scanning file from its own scan were both carried into the
// fleet gate. The generalized version of that second lesson is that the gate
// reads a comment-stripped mask of each file, so no file — this one included —
// can trip a gate by quoting the pattern it describes.
//
// Two things the fleet version deliberately relaxes, because this copy was
// right for this repo and wrong for the others: it matches `.powerSaver(` on
// any receiver rather than the literal `Arcade.settings.powerSaver` (one repo
// guards through an alias, where that literal never appears at the call site),
// and it drops the `calls.length > 0` assertion (several fleet apps never read
// the setting at all, and a non-empty assertion makes the gate unrunnable
// fleet-wide).
import { test } from "node:test";
import assert from "node:assert";
import { ambientStill } from "../js/renderer/style.js";

test("ambience stops under power saver, and under reduced motion", () => {
  assert.strictEqual(ambientStill({ powerSaver: true }), true);
  assert.strictEqual(ambientStill({ reducedMotion: true }), true);
  assert.strictEqual(ambientStill({ reducedMotion: true, powerSaver: true }), true);
});

test("ambience runs by default, and on an SDK that has no powerSaver", () => {
  assert.strictEqual(ambientStill({ reducedMotion: false, powerSaver: false }), false);
  // An older SDK leaves powerSaver off the snapshot entirely — that must read
  // as "not saving", never as undefined leaking into a comparison.
  assert.strictEqual(ambientStill({ reducedMotion: false }), false);
  assert.strictEqual(ambientStill({}), false);
  assert.strictEqual(ambientStill(null), false);
  assert.strictEqual(ambientStill(undefined), false);
});
