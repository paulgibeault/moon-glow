// Audio for moon-lit, via the launcher SDK's managed `Arcade.audio`.
// This is the game's single audio module.
//
// The pack IS the sound. js/soundpack.js holds it; every cue is a WebAudio
// node graph built from physical-gesture elements (strike, rustle, creak,
// pluck, droplet, inharmonic body, thump, flare, blast, chirp, stream), and
// every cue feeds one shared convolution room so overlapping sounds fuse into
// one place — a quiet pond at night — instead of stacking into a pile. That
// pack was rendered to an audition WAV and approved by ear — do not retune it
// from here.
//
// NO SYNTHESIS LIVES IN THIS GAME. Every gesture the pack is built from is
// an element in the launcher's shared library, and the crossfade that makes
// the bed adaptive is `handle.retune()` in the SDK. What belongs to
// moon-lit is the design — which gestures, how loud, how far away, how
// often — and that is all js/soundpack.js contains. A gesture this game
// needs and the library lacks goes into the library.
//
// There is NO fallback profile. When the graph path is unavailable (stale
// cached SDK/companion, or standalone without /arcade-audio.js) this module
// registers nothing and the game plays silent — deliberately. Fleet decision
// 2026-07-28: chiptune is an aesthetic a game adopts as its identity, not a
// degraded mode a stale cache drops you into; moon-lit's identity is the
// pond, and the pond half-loaded is silence. That is an expected state, not
// an error, so it is not logged. See NEEDED_ELEMENTS below for the gate.
// (The retired profile is preserved, inert, in audio/chiptune-archive.mjs.)
//
// Conventions (fleet Arcade.audio conventions, launcher GAME_INTEGRATION.md §5):
//   A1 — cues are registered ONCE here at module load. Audio is purely local,
//        so no `await Arcade.ready` is needed; the SDK's classic <script> +
//        `Arcade.init(...)` in index.html have already run by the time this ES
//        module evaluates, so `window.Arcade.audio` and `window.ArcadeSoundPack`
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
  (typeof window !== 'undefined' && window.ArcadeSoundPack) ? window.ArcadeSoundPack : null;

// ─── ambient bed ────────────────────────────────────────────────────────────
// docs/design-concept.md §8 has asked for an ambient bed since the beginning;
// nothing before SDK 3.6.0 could sustain a voice at all. It ships as two
// sustained cues: the pond, which never changes, and the insects, whose density
// tracks how close the field is to the waterline.
const BED_CUE = 'ambient';
const INSECT_CUE = 'insects';
// The water is all around you; the insects are out across the pond.
const BED_SEND = 0.45;
const INSECT_SEND = 0.55;
// Each cue schedules its whole timeline in one pass — the looped water streams
// and every ruffle, or every chirp — so this is how long a single start() lasts
// before it fades out on its own. Well past any moon-lit level; the bed is
// stopped at WIN/GAME_OVER long before it matters.
const BED_SECONDS = 420;

// Pressure, quantised. The insect layer can only change density by being
// re-scheduled, so this has to be a handful of steps rather than a continuous
// value — and the steps need hysteresis, because the field's clearance crosses
// back and forth over a threshold every time a cluster pops. Rising uses UP[i],
// falling uses the lower DOWN[i], so a level held near a boundary stays put.
const HEAT_STEPS = [0, 0.35, 0.7, 1.0];
const HEAT_UP = [0.30, 0.58, 0.84];
const HEAT_DOWN = [0.20, 0.48, 0.74];

// True once the graph path has registered successfully. Everything that only
// the graph path can do (the bed, the built-in match transient) keys off this.
let graphMode = false;

// ─── the play wrappers ──────────────────────────────────────────────────────

// A2 — the single play-site wrapper. Silent no-op when Arcade.audio is absent,
// when nothing is registered (the SDK's play() resolves an unknown cue name to
// null and returns), or when the launcher has muted (the SDK short-circuits
// before touching the AudioContext).
export function sfx(name, opts) {
  const a = audio();
  if (a) a.play(name, opts);
}

// Match / clear — the lanterns catching fire. The graph cue fires one soft burn
// whop per lamp in the cluster, each bigger than the last, so the sound grows
// with the clear instead of merely getting louder. (The retired chiptune
// profile approximated this with a chain-pitch ladder; that lives on only in
// audio/chiptune-archive.mjs.)
export function playMatch(count) {
  const a = audio();
  if (!a || !graphMode) return;
  a.play('match', { count });
}

let bedHandle = null;
let insectHandle = null;
let heatStep = 0;

// Start the ambient bed. Idempotent — safe to call every frame. A silent no-op
// whenever the graph path did not register (nothing to start) or audio is
// unavailable; it must never throw, because the game loop calls it.
export function startBed() {
  if (bedHandle) return;
  const a = audio();
  if (!a || !graphMode || typeof a.start !== 'function') return;
  bedHandle = a.start(BED_CUE, { dur: BED_SECONDS });
  heatStep = 0;
  insectHandle = a.start(INSECT_CUE, { dur: BED_SECONDS, heat: HEAT_STEPS[0] });
}

// Stop the bed, fading over `fade` seconds. Also idempotent.
export function stopBed(fade) {
  const f = typeof fade === 'number' && fade > 0 ? fade : 1.2;
  const handles = [bedHandle, insectHandle];
  bedHandle = null;
  insectHandle = null;
  heatStep = 0;
  for (const h of handles) {
    if (!h) continue;
    try { h.stop(f); } catch (e) { /* never throw at a play-site */ }
  }
}

// How pressed the player is, 0..1 — main.js derives it from how close the field
// has sunk to the waterline. The insects get busier as it rises: the night
// itself leans in rather than a warning sound being added on top.
//
// A sustained cue schedules its whole timeline up front, so changing density
// means running a second insect layer and fading the first out under it. The
// SDK owns that (`handle.retune`, 3.7.0+) — the game says what should change
// and how fast, not how to crossfade it. Only the insects are retuned; the
// water underneath is untouched, so there is no seam.
//
// Safe to call every frame: quantisation and hysteresis above mean an actual
// retune happens a handful of times per level at most.
export function setBedPressure(heat) {
  // No retune on a pre-3.7.0 SDK: the bed simply stays at the density it
  // started with. That is a quieter loss than any workaround, and this runs in
  // the game loop, so it must not throw.
  if (!insectHandle || typeof insectHandle.retune !== 'function') return;
  const h = typeof heat === 'number' && isFinite(heat) ? heat : 0;

  let step = heatStep;
  while (step < HEAT_STEPS.length - 1 && h >= HEAT_UP[step]) step++;
  while (step > 0 && h < HEAT_DOWN[step - 1]) step--;
  if (step === heatStep) return;
  heatStep = step;

  insectHandle.retune({ dur: BED_SECONDS, heat: HEAT_STEPS[step] }, 3.0);
}

// ─── registration ───────────────────────────────────────────────────────────

function registerPack(a, p) {
  // One room for the whole game: the pond the pack is set beside.
  a.room(p.ROOM);
  Object.keys(p.CUES).forEach((name) => {
    a.graph(name, p.CUES[name], { send: p.SENDS[name] });
  });
  // The beds are written in the SDK's own sustained-cue shape —
  // fn(ctx, out, when, params, rnd) returning a teardown — so they register
  // directly. There is no adapter here on purpose: an argument-order shim in
  // the game is a small thing that quietly becomes the place bed behaviour
  // accumulates.
  a.graph(BED_CUE, p.ambient, { sustained: true, send: BED_SEND });
  a.graph(INSECT_CUE, p.insects, { sustained: true, send: INSECT_SEND });
}

// ─── A1 — the single registration site ──────────────────────────────────────
// Last in the file so every cue table above it is initialised. Runs once at
// module load, before main.js evaluates.

// The gestures and APIs the pack is built out of. A cached older SDK or
// element library has `graph()` and `el()` but not these, and a missing element
// would throw inside a cue at play time — a cue that half-plays is worse than
// silence, so the whole graph path is gated on the pack's actual dependencies
// rather than on a version number.
const NEEDED_ELEMENTS = [
  'strike', 'rustle', 'creak', 'droplet', 'body', 'thump', 'pluck', 'stream',
  'flare', 'blast', 'chirp', 'teardown',
];

(function registerCues() {
  const a = audio();
  if (!a) return;

  const p = pack();
  const el = (a && typeof a.el === 'function') ? a.el() : null;
  const graphable =
    !!p &&
    typeof a.graph === 'function' &&
    typeof a.room === 'function' &&
    typeof a.start === 'function' &&
    el !== null &&
    NEEDED_ELEMENTS.every((name) => typeof el[name] === 'function');

  if (graphable) {
    registerPack(a, p);
    graphMode = true;
  }
  // Not graphable — stale cached SDK, or standalone without /arcade-audio.js.
  // Register nothing: the game plays silent, by design (see the header).
  // Expected, not a bug — no console noise. Every wrapper above no-ops, and
  // the SDK's play() treats an unregistered cue name as a silent no-op.
})();
