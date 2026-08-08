// The power-saver contract, GAME_INTEGRATION §5 ("Canvas-rendered games") and
// §6d ("Let the screen rest"). Two halves worth pinning:
//
//   1. the policy — which motion is ambience (droppable) and which is the game
//      talking to the player (kept), expressed by renderer/style.js;
//   2. the shape of the adoption — the setting is read defensively, and no
//      stylesheet reintroduces an infinite animation behind the canvas's back.
//
// The second half is a source gate rather than a behavioural test because both
// failures are silent: an unguarded read throws only on a launcher still
// serving a pre-3.13.0 SDK, and an infinite CSS animation just quietly keeps
// the compositor awake forever.
import { test } from "node:test";
import assert from "node:assert";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ROOT } from "../tools/stage.mjs";
import { ambientStill } from "../js/renderer/style.js";

// This file quotes the very patterns it forbids, so it has to exclude itself
// from its own source scan.
const SELF = path.relative(ROOT, fileURLToPath(import.meta.url));

const tracked = execSync("git ls-files -z", { cwd: ROOT, encoding: "utf8" })
  .split("\0").filter(Boolean).filter((f) => f !== SELF);

const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

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

test("every Arcade.settings.powerSaver read is guarded", () => {
  const calls = [];
  for (const f of tracked.filter((f) => /\.(js|mjs)$/.test(f))) {
    const src = read(f);
    for (const m of src.matchAll(/Arcade\.settings\.powerSaver\s*\(/g)) {
      calls.push({ f, before: src.slice(Math.max(0, m.index - 240), m.index) });
    }
  }
  assert.ok(calls.length > 0, "nothing reads Arcade.settings.powerSaver()");
  for (const c of calls) {
    assert.match(
      c.before,
      /typeof Arcade\.settings\.powerSaver === 'function'/,
      `${c.f}: unguarded Arcade.settings.powerSaver() — the method does not ` +
      `exist before SDK 3.13.0 and calling it throws, which inside an ` +
      `onSettingsChange handler is a throw on every settings write`);
  }
});

test("no infinite CSS animation (GAME_INTEGRATION §6d)", () => {
  for (const f of tracked.filter((f) => /\.(css|html)$/.test(f))) {
    const src = read(f);
    assert.doesNotMatch(
      src, /animation(-iteration-count)?\s*:[^;}]*\binfinite\b/,
      `${f}: an infinite animation never lets the display pipeline reach 0 fps`);
    // Any finite emphasis pulse consumes the SDK's token, whose var() fallback
    // of 3 keeps it correct on a launcher that hasn't shipped 3.13.0 yet.
    for (const m of src.matchAll(/animation-iteration-count\s*:\s*([^;}]+)/g)) {
      assert.match(
        m[1], /var\(--arcade-pulse-count, 3\)/,
        `${f}: emphasis pulses declare var(--arcade-pulse-count, 3), not ${m[1].trim()}`);
    }
  }
});
