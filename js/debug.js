/**
 * debug.js — developer handles and counters, opt-in behind ?debug / #debug.
 *
 * window.game and window.menuState used to be attached unconditionally, which
 * put a live handle on the board and on the menu's private state on every
 * player's page. They are diagnostics; they belong behind a flag.
 *
 * The counters exist to answer the question this branch is about — how often
 * the renderer actually repaints, versus how often it presents — with a
 * measurement rather than an argument. They are inert when the flag is off:
 * `if (!DEBUG) return` is the whole cost on a player's device.
 */

export const DEBUG = (() => {
  if (typeof location === 'undefined') return false;
  return /(^|[?&])debug(=|&|$)/.test(location.search || '')
      || (location.hash || '') === '#debug';
})();

const counters = Object.create(null);

/**
 * Live switches for A/B measurement, reachable at window.__moonlit.flags.
 * `noSceneCache` forces renderer/world.js down its uncached path, which is the
 * only way to time the same frame both ways on the same device.
 */
export const debugFlags = { noSceneCache: false };

/** Bump a named counter. No-op unless ?debug. */
export function countDebug(name) {
  if (!DEBUG) return;
  counters[name] = (counters[name] || 0) + 1;
}

/** Attach a diagnostic handle to window.__moonlit. No-op unless ?debug. */
export function exposeDebug(name, value) {
  if (!DEBUG || typeof window === 'undefined') return;
  if (!window.__moonlit) {
    window.__moonlit = {
      counters,
      flags: debugFlags,
      /**
       * Sample the counters over `ms` and report per-second rates. The one
       * that matters is sceneRepaint vs frame: on a settled board the first
       * should sit at the ambient clock's cadence (or zero under stillness)
       * while the second runs at the display's.
       */
      probe(ms = 1000) {
        const before = { ...counters };
        return new Promise(resolve => setTimeout(() => {
          const out = {};
          for (const k of new Set([...Object.keys(before), ...Object.keys(counters)])) {
            out[k] = Math.round(((counters[k] || 0) - (before[k] || 0)) * 1000 / ms * 10) / 10;
          }
          resolve(out);
        }, ms));
      },
      /**
       * Drive `n` frames synchronously, 16ms apart, and report the mean cost.
       * rAF is throttled to nothing in a background tab, so this is the only
       * way to time the draw where an automated check runs.
       */
      bench(n = 120) {
        const f = window.__moonlit.frame;
        if (!f) return null;
        let t = performance.now();
        f(16, t);                       // warm: the first frame admits no time
        const before = { ...counters };
        const start = performance.now();
        for (let i = 1; i <= n; i++) f(16, t + i * 16);
        const ms = performance.now() - start;
        const delta = {};
        for (const k of Object.keys(counters)) delta[k] = (counters[k] || 0) - (before[k] || 0);
        return { frames: n, meanMs: Math.round((ms / n) * 1000) / 1000, counters: delta };
      },
    };
  }
  window.__moonlit[name] = value;
}
