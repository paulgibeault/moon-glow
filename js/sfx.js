// Audio for moon-lit, via the launcher SDK's managed `Arcade.audio`.
// This is the game's single audio module.
//
// Two registration paths live here:
//
//   GRAPH PATH (SDK >= 3.6.0 with /arcade-audio.js loaded) — the real sound
//     design. js/soundpack.js holds the pack; every cue is a WebAudio node
//     graph built from physical-gesture elements (strike, rustle, creak,
//     pluck, droplet, inharmonic body, thump, stream), and every cue feeds one
//     shared convolution room so overlapping sounds fuse into a courtyard
//     instead of stacking into a pile. That pack was rendered to an audition
//     WAV and approved by ear — do not retune it from here.
//
//   FALLBACK PATH (older cached SDK, or standalone without /arcade-audio.js) —
//     the archived chiptune profile, copied verbatim from the launcher's
//     soundpacks/chiptune/moon-lit.mjs. Single-oscillator spec cues: the only
//     thing a pre-3.6.0 `Arcade.audio` can play. It exists because a player on
//     a stale service-worker cache should get the old sound rather than
//     silence; that is an expected state, not an error, so it is not logged.
//
// Both paths register the SAME cue names, so every call site in the game works
// unchanged either way.
//
// Conventions (fleet Arcade.audio conventions, launcher GAME_INTEGRATION.md §5):
//   A1 — cues are registered ONCE here at module load. Audio is purely local,
//        so no `await Arcade.ready` is needed; the SDK's classic <script> +
//        `Arcade.init(...)` in index.html have already run by the time this ES
//        module evaluates, so `window.Arcade.audio` and `window.MoonLitPack`
//        are both present.
//   A2 — every play-site in the game goes through the `sfx()` wrapper below,
//        which feature-detects `Arcade.audio`. moon-lit has NO in-game sound
//        setting, so the wrapper is a pure feature detect.
//   A3 — the launcher owns volume + the global mute button; this module adds
//        no volume slider and no mute of its own. `play()` is free + silent
//        when the user has muted.
//   A4 — cue names are lowercase-kebab and event-shaped.

const audio = () =>
  (typeof window !== 'undefined' && window.Arcade && window.Arcade.audio)
    ? window.Arcade.audio
    : null;

const pack = () =>
  (typeof window !== 'undefined' && window.MoonLitPack) ? window.MoonLitPack : null;

// ─── ambient bed ────────────────────────────────────────────────────────────
// docs/design-concept.md §8 has asked for a river-and-taiko bed since the
// beginning; nothing before SDK 3.6.0 could sustain a voice at all.
const BED_CUE = 'ambient';
// The river is the far side of the courtyard, so it sits deep in the room.
const BED_SEND = 0.60;
// The pack schedules the whole bed in one pass — three looped water streams
// plus every taiko strike — so this is how long a single start() lasts before
// it fades out on its own. Well past any moon-lit level; the bed is stopped
// at WIN/GAME_OVER long before it matters.
const BED_SECONDS = 420;

// True once the graph path has registered successfully. Everything that only
// the graph path can do (the bed, the built-in match transient) keys off this.
let graphMode = false;

// ─── the play wrappers ──────────────────────────────────────────────────────

// A2 — the single play-site wrapper. Silent no-op when Arcade.audio is absent,
// or when the launcher has muted (the SDK short-circuits before touching the
// AudioContext).
export function sfx(name, opts) {
  const a = audio();
  if (a) a.play(name, opts);
}

// Match / clear. The pitch of the chime rises with the size of the cluster that
// popped, per the design's chain-pitch ladder (3 = base note, 4 = +major third,
// 5 = +fifth, 6+ = +octave).
//
// The graph cue reads the cluster size directly and builds its own strike
// transient. The chiptune cue cannot: the SDK merges per-play overrides onto
// single-spec cues only and ignores them on array cues, so 'match' has to stay
// a single voice to keep its `freq` override — which is why the archived
// profile pairs it with a separate 'match-tick' contact click.
export function playMatch(count) {
  const a = audio();
  if (!a) return;
  if (graphMode) {
    a.play('match', { count });
    return;
  }
  a.play('match-tick');
  a.play('match', { freq: chiptuneMatchFreq(count) });
}

let bedHandle = null;

// Start the ambient bed. Idempotent — safe to call every frame. A silent no-op
// on the fallback path (the chiptune profile has no bed) and whenever audio is
// unavailable; it must never throw, because the game loop calls it.
export function startBed() {
  if (bedHandle) return;
  const a = audio();
  if (!a || !graphMode || typeof a.start !== 'function') return;
  bedHandle = a.start(BED_CUE, { dur: BED_SECONDS });
}

// Stop the bed, fading over `fade` seconds. Also idempotent.
export function stopBed(fade) {
  if (!bedHandle) return;
  const h = bedHandle;
  bedHandle = null;
  try { h.stop(typeof fade === 'number' && fade > 0 ? fade : 1.2); } catch (e) { /* never throw at a play-site */ }
}

// ─── registration ───────────────────────────────────────────────────────────

function registerPack(a, p) {
  // One room for the whole game: the stone courtyard the pack is set in.
  a.room(p.ROOM);
  Object.keys(p.CUES).forEach((name) => {
    a.graph(name, p.CUES[name], { send: p.SENDS[name] });
  });
  a.graph(BED_CUE, bedGraph(p), { sustained: true, send: BED_SEND });
}

// The pack's `ambient(ctx, out, t, dur, r)` predates the SDK's sustained-cue
// signature `fn(ctx, out, when, params, rnd)`, so adapt it here rather than
// touching the approved pack.
//
// It builds its sources and returns, keeping no handles, so we collect them as
// they are created and hand the SDK a teardown that stops them. Without this,
// stopping the bed only disconnects its output — the sources stay scheduled
// (and alive) for the rest of BED_SECONDS, once per level played.
function bedGraph(p) {
  return function bed(ctx, out, when, params, rnd) {
    const dur = (params && typeof params.dur === 'number') ? params.dur : BED_SECONDS;
    const sources = [];
    const makeOsc = ctx.createOscillator;
    const makeBuf = ctx.createBufferSource;
    ctx.createOscillator = function () { const n = makeOsc.call(ctx); sources.push(n); return n; };
    ctx.createBufferSource = function () { const n = makeBuf.call(ctx); sources.push(n); return n; };
    try {
      p.ambient(ctx, out, when, dur, rnd);
    } finally {
      ctx.createOscillator = makeOsc;
      ctx.createBufferSource = makeBuf;
    }
    return function teardown(at) {
      for (const n of sources) { try { n.stop(at); } catch (e) { /* already ended */ } }
    };
  };
}

// ─── fallback: the archived chiptune profile ────────────────────────────────
// Copied verbatim from the launcher's soundpacks/chiptune/moon-lit.mjs, which
// froze this game's pre-3.6.0 sound (branch audio-retune @ ee7e62b). Keep it in
// sync with that archive rather than editing it here.

const MATCH_BASE_HZ = 523.25; // C5

function chiptuneMatchFreq(count) {
  if (count >= 6) return MATCH_BASE_HZ * 2;     // +octave
  if (count === 5) return MATCH_BASE_HZ * 1.5;  // +perfect fifth
  if (count === 4) return MATCH_BASE_HZ * 1.25; // +major third
  return MATCH_BASE_HZ;                          // 3-match base note
}

function registerChiptune(a) {
  a
    // Lantern release — soft paper "shh". Noise, very low gain: this fires on
    // every shot, so it must sit low in the mix.
    .cue('lantern-launch', { type: 'noise', dur: 0.12, gain: 0.10, attack: 0.01, release: 0.10 })

    // Match / clear — the contact click of the strike. Companion voice to
    // 'match'; see playMatch() above for why it is a separate cue.
    .cue('match-tick', { type: 'noise', dur: 0.02, gain: 0.05, attack: 0.001, release: 0.015 })

    // Match / clear — small struck chime. Near-instant attack (the tick owns
    // the transient) into a long-ish tail, so it rings rather than beeps. The
    // caller overrides `freq` per cluster size via chiptuneMatchFreq().
    .cue('match', { type: 'triangle', freq: MATCH_BASE_HZ, dur: 0.22, gain: 0.20, attack: 0.002, release: 0.20 })

    // Chain-drop — a water droplet: the surface breaks (noise plip) and only
    // then does the falling pitch appear. Chord: both voices start at t=0.
    .cue('drop', [
      { type: 'noise', dur: 0.02, gain: 0.05, attack: 0.001, release: 0.015 },
      { type: 'sine', freq: 880, toFreq: 440, dur: 0.10, gain: 0.13, release: 0.08, delay: 0 },
    ])

    // Trellis advance — rope creak as the trellis descends a row. Noise bed
    // under the falling triangle gives the rope its fibre.
    .cue('trellis', [
      { type: 'noise', dur: 0.16, gain: 0.05, attack: 0.02, release: 0.13 },
      { type: 'triangle', freq: 130, toFreq: 98, dur: 0.18, gain: 0.14, attack: 0.02, release: 0.14, delay: 0 },
    ])

    // Dead-line warning — the same creak, tenser and higher, when a descent is
    // imminent (the design's "trellis creaks at N-2" cue). Slightly more grain
    // than 'trellis' so the rope sounds strained.
    .cue('dead-line-warning', [
      { type: 'noise', dur: 0.18, gain: 0.06, attack: 0.015, release: 0.15 },
      { type: 'triangle', freq: 165, toFreq: 120, dur: 0.20, gain: 0.16, attack: 0.01, release: 0.16, delay: 0 },
    ])

    // Menu / UI click — soft woody "tak".
    .cue('menu-click', { type: 'triangle', freq: 360, dur: 0.05, gain: 0.12, release: 0.04 })

    // Win — a single low temple bell. Chord (every voice starts at t=0): a
    // noise strike, then a cast-bell partial series over a G3 prime —
    // hum (~0.5x), prime, tierce (~1.19x, the minor third that makes bronze
    // sound like bronze), quint (~1.5x), nominal (~2x) and one non-integer
    // upper partial (~3.6x) for the clang. Partials are a hair off their exact
    // ratios so they beat gently instead of phase-locking into an organ chord,
    // and decay times are staggered: upper partials die first, the hum rings
    // longest.
    .cue('win', [
      { type: 'noise', dur: 0.035, gain: 0.055, attack: 0.001, release: 0.03 },
      { type: 'sine', freq: 98,  dur: 1.8,  gain: 0.08,  attack: 0.006, release: 1.65, delay: 0 }, // hum
      { type: 'sine', freq: 196, dur: 1.5,  gain: 0.20,  attack: 0.004, release: 1.35, delay: 0 }, // prime
      { type: 'sine', freq: 233, dur: 1.1,  gain: 0.085, attack: 0.004, release: 1.00, delay: 0 }, // tierce
      { type: 'sine', freq: 295, dur: 0.85, gain: 0.05,  attack: 0.003, release: 0.78, delay: 0 }, // quint
      { type: 'sine', freq: 391, dur: 0.70, gain: 0.055, attack: 0.003, release: 0.65, delay: 0 }, // nominal
      { type: 'sine', freq: 700, dur: 0.40, gain: 0.03,  attack: 0.002, release: 0.37, delay: 0 }, // upper
    ])

    // Loss — "koto detuning slowly downward": three plucked notes, each a
    // plectrum tick plus a triangle that sags in pitch as it decays. Pairs land
    // at 0s / 0.20s / 0.40s — each tick's `delay` is measured from the previous
    // voice's START, and each note carries `delay: 0` so it sounds with its own
    // tick rather than after it.
    .cue('game-over', [
      { type: 'noise', dur: 0.015, gain: 0.05, attack: 0.001, release: 0.012 },
      { type: 'triangle', freq: 392, toFreq: 370, dur: 0.20, gain: 0.16, attack: 0.002, release: 0.17, delay: 0 },
      { type: 'noise', dur: 0.015, gain: 0.05, attack: 0.001, release: 0.012, delay: 0.20 },
      { type: 'triangle', freq: 330, toFreq: 300, dur: 0.20, gain: 0.16, attack: 0.002, release: 0.17, delay: 0 },
      { type: 'noise', dur: 0.015, gain: 0.05, attack: 0.001, release: 0.012, delay: 0.20 },
      { type: 'triangle', freq: 262, toFreq: 210, dur: 0.40, gain: 0.18, attack: 0.002, release: 0.34, delay: 0 },
    ]);
}

// ─── A1 — the single registration site ──────────────────────────────────────
// Last in the file so every cue table above it is initialised. Runs once at
// module load, before main.js evaluates.

(function registerCues() {
  const a = audio();
  if (!a) return;

  const p = pack();
  const graphable =
    !!p &&
    typeof a.graph === 'function' &&
    typeof a.room === 'function' &&
    typeof a.el === 'function' &&
    a.el() !== null;

  if (graphable) {
    registerPack(a, p);
    graphMode = true;
  } else {
    // Stale cached SDK, or standalone without /arcade-audio.js. Expected, not
    // a bug — no console noise.
    registerChiptune(a);
  }
})();
