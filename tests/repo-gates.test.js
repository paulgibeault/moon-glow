// Source-level gates: everything tracked has to parse.
//
// Deliberately about the SOURCE, not the deploy — what the published artifact
// must contain is deploy-artifact.test.js's job, and it checks the staged
// output rather than the checkout, which is the only way to catch a staging
// rule that drops a file the game needs.
import { test } from "node:test";
import assert from "node:assert";
import { execSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../tools/stage.mjs";

const tracked = execSync("git ls-files -z", { cwd: ROOT, encoding: "utf8" })
  .split("\0").filter(Boolean);

test("every tracked JS file parses", () => {
  for (const f of tracked.filter((f) => /\.(js|mjs)$/.test(f))) {
    const r = spawnSync(process.execPath, ["--check", f], { cwd: ROOT });
    assert.strictEqual(r.status, 0, `node --check ${f} failed:\n${r.stderr}`);
  }
});

test("every tracked JSON file parses", () => {
  for (const f of tracked.filter((f) => f.endsWith(".json"))) {
    assert.doesNotThrow(
      () => JSON.parse(fs.readFileSync(path.join(ROOT, f), "utf8")),
      `${f} is not valid JSON`);
  }
});

// The modules that decide timing and battery policy are pure by contract: no
// document, no window, no Arcade. That is what lets them be imported in node
// and asserted directly, instead of being stranded in main.js — whose top
// level is a script with `await Arcade.ready` and a getElementById, and which
// is therefore untestable by construction.
//
// The line is worth a gate because it is easy to lose by accident: one
// `performance.now()` reached for inside loop-policy.js and the predicate
// stops being something a test can state a situation to.
const PURE_MODULES = ["js/clock.js", "js/loop-policy.js"];

test("the timing and policy modules stay free of the DOM and the SDK", () => {
  for (const f of PURE_MODULES) {
    const src = fs.readFileSync(path.join(ROOT, f), "utf8")
      // Comments describe these things constantly; the gate is about code.
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^[ \t]*\/\/.*$/gm, "");
    for (const forbidden of ["document", "window", "Arcade", "localStorage"]) {
      assert.ok(!new RegExp(`\\b${forbidden}\\b`).test(src),
        `${f} references \`${forbidden}\`. These modules must stay node-importable — ` +
        "reach the value through a parameter instead.");
    }
  }
});

test("every module the pure ones import is itself pure", () => {
  // A clean file that imports a DOM-touching one is not clean; the import
  // graph is what node actually evaluates.
  for (const f of PURE_MODULES) {
    const src = fs.readFileSync(path.join(ROOT, f), "utf8");
    const imports = [...src.matchAll(/^\s*(?:import|export)\s[^;]*?from\s+["'](\.[^"']+)["']/gm)];
    assert.deepStrictEqual(imports.map((m) => m[1]), [],
      `${f} imports ${imports.map((m) => m[1]).join(", ")} — keep these modules leaf-level.`);
  }
});
