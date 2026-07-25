// Managed WebAudio SFX for moon-lit, via the launcher SDK's `Arcade.audio`
// (SDK >= 3.5.0). This is the game's single audio module.
//
// SOUND IDENTITY — a lantern festival heard from the riverbank: struck bronze,
// plucked string, wet paper, wood and rope. Everything in moon-lit is a
// PHYSICAL OBJECT being touched, so every cue is built the way the real object
// makes its sound, not as a bare tone in the right register:
//
//   * Strike transients. A struck or plucked thing makes a broadband noise
//     click at the moment of contact, before any pitch exists. The bell, the
//     koto notes, the match chime, and the falling droplet each get a very
//     short low-gain `noise` voice at t=0, layered under (not before) the tone.
//     This transient is most of what makes an attack read as "struck".
//   * Inharmonic bell partials. A real temple bell is not a harmonic stack —
//     an exact 1x/2x/3x sine chord reads as an organ. The `win` bell uses a
//     cast-bell partial series (hum an octave under the prime, a minor-third
//     TIERCE, a quint, a nominal, plus one deliberately non-integer upper
//     partial), each partial slightly detuned and each with its own decay:
//     high partials die first, the hum rings longest. The tierce is the single
//     most bell-defining ingredient.
//   * Pluck-ticks. Koto strings are plucked with a plectrum, so `game-over`
//     gives each note a 15 ms noise tick and a ~2 ms attack — the string is at
//     full amplitude essentially instantly, then decays.
//   * Material grain. Rope and wood do not glide cleanly. `trellis` and
//     `dead-line-warning` put a soft noise bed under the descending triangle
//     so the creak has fibre in it.
//
// Loudness discipline: this is a calm game. Transients are quiet (gain ~0.05)
// and short (<= 45 ms) — they are felt as attack, not heard as noise. Tonal
// voices stay <= 0.25 s and <= 0.35 gain except the deliberate win/loss
// jingles. The frequently-fired cues (`lantern-launch`, `match`, `drop`) sit
// lowest in the mix.
//
// Structure:
//   * cues are registered ONCE, in `registerCues()` below. Audio is purely
//     local, so no `await Arcade.ready` is needed; the SDK's classic <script> +
//     `Arcade.init(...)` in index.html have already run by the time this ES
//     module evaluates, so `window.Arcade.audio` is present.
//   * every play-site in the game goes through the one `sfx()` wrapper (or
//     `playMatch()`, which is a thin two-cue wrapper over it). moon-lit has NO
//     in-game sound setting, so `sfx()` is a pure feature detect.
//   * the launcher owns volume + the global mute button; this module adds no
//     volume slider and no mute of its own. `play()` is free + silent when the
//     user has muted.
//
// Aesthetics still want a human ear pass (the implementing agent cannot
// listen). Cue list and intent come from docs/design-concept.md section 8.

const audio = () =>
  (typeof window !== 'undefined' && window.Arcade && window.Arcade.audio)
    ? window.Arcade.audio
    : null;

// The single play-site wrapper. Silent no-op when Arcade.audio is absent
// (e.g. standalone against a pre-3.5.0 cached SDK) or when the launcher has
// muted (the SDK short-circuits before touching the AudioContext).
export function sfx(name, opts) {
  const a = audio();
  if (a) a.play(name, opts);
}

// Match cue pitch rises with the size of the cluster that popped, per the
// design's chain-pitch ladder (3 = base note, 4 = +major third, 5 = +fifth,
// 6+ = +octave). Passed as a per-play `freq` override to the 'match' cue.
const MATCH_BASE_HZ = 523.25; // C5
export function matchFreq(count) {
  if (count >= 6) return MATCH_BASE_HZ * 2;     // +octave
  if (count === 5) return MATCH_BASE_HZ * 1.5;  // +perfect fifth
  if (count === 4) return MATCH_BASE_HZ * 1.25; // +major third
  return MATCH_BASE_HZ;                          // 3-match base note
}

// Match = strike transient + pitched chime. These are two cues rather than one
// two-voice cue on purpose: the SDK merges per-play overrides onto SINGLE-spec
// cues only, and array cues ignore overrides entirely — so 'match' has to stay
// single-voice to keep its `freq` pitch ladder. 'match-tick' is its companion
// strike, fired together here so the game keeps one play-site per event.
export function playMatch(count) {
  const a = audio();
  if (!a) return;
  a.play('match-tick');
  a.play('match', { freq: matchFreq(count) });
}

// Single registration site. Runs once at module load; skips silently if the
// SDK audio surface is unavailable.
(function registerCues() {
  const a = audio();
  if (!a) return;

  a
    // Lantern release — soft paper "shh". Noise, very low gain: this fires on
    // every shot, so it must sit low in the mix.
    .cue('lantern-launch', { type: 'noise', dur: 0.12, gain: 0.10, attack: 0.01, release: 0.10 })
    // Match / clear — the contact click of the strike. Companion voice to
    // 'match'; see playMatch() for why it is a separate cue.
    .cue('match-tick', { type: 'noise', dur: 0.02, gain: 0.05, attack: 0.001, release: 0.015 })
    // Match / clear — small struck chime. Near-instant attack (the tick owns
    // the transient) into a long-ish tail, so it rings rather than beeps. The
    // caller overrides `freq` per cluster size via matchFreq().
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
    // longest. The design asks for a ~3s hold; ~1.8s here to stay conservative.
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
})();
