// moon-lit sound pack — the game's own sound design.
//
// Loaded as a plain script after /sdk/v3/arcade-audio.js. js/sfx.js registers
// everything here with Arcade.audio; the launcher's tools/soundpack renderer
// loads this same file to produce audition WAVs, so what gets approved by ear
// is what plays.
//
// The place: a stone temple courtyard at night, open onto a river. Paper, rope,
// wood, water, bronze, silk strings. Everything is heard in that one space,
// which is why every cue feeds one shared room (see ROOM below).
//
// Register plan, so simultaneous cues occupy different bands instead of masking
// each other:
//   taiko 40–120 · bell 60–1200 · wood/rope 120–800 · water 800–4k
//   chimes 1–3k · paper 2–6k
//
// Every cue takes an `r` (seeded random stream) and varies pitch, timing and
// layer balance per play. No two plays are identical — that is deliberate and
// it is most of the difference between "a sound" and "a sound effect".

(function (global) {
  'use strict';
  const S = global.ArcadeAudioElements;

  const ROOM = {
    dur: 2.4,
    decay: 0.62,      // stone, but open to the sky — not a cathedral
    preDelay: 0.014,
    wet: 0.85,
    shelfHz: 6200,
    shelfDb: -4,
    seed: 1729,
  };

  // Chain-size pitch ladder: 3-match is the base note, rising to an octave at 6+.
  function matchFreq(count) {
    if (count >= 6) return 1046.5;
    if (count === 5) return 784.0;
    if (count === 4) return 659.25;
    return 523.25;
  }

  // A struck bar/tube's partials are inharmonic — these ratios are the free-free
  // bar series. Using integer harmonics here is exactly what makes a "chime"
  // sound like an organ instead.
  const FURIN = [
    { ratio: 1.000, gain: 1.00, decay: 0.85, detune: 2 },
    { ratio: 2.756, gain: 0.45, decay: 0.42, detune: 4 },
    { ratio: 5.404, gain: 0.22, decay: 0.20, detune: 5 },
    { ratio: 8.933, gain: 0.09, decay: 0.11, detune: 6 },
  ];

  // Bonshō (Japanese temple bell). The hum tone rings longest and sits an
  // octave BELOW the prime; the tierce is what gives a bell its characteristic
  // minor colour. Upper partials die first, which is why a bell "settles".
  const BONSHO = [
    { ratio: 0.50, gain: 0.55, decay: 7.0, detune: 2, attack: 0.02 },
    { ratio: 1.00, gain: 1.00, decay: 5.2, detune: 3 },
    { ratio: 1.19, gain: 0.50, decay: 3.4, detune: 4, delay: 0.05 }, // tierce blooms just after the strike
    { ratio: 1.51, gain: 0.30, decay: 2.5, detune: 5 },
    { ratio: 2.01, gain: 0.34, decay: 1.9, detune: 4 },
    { ratio: 2.53, gain: 0.16, decay: 1.1, detune: 6 },
    { ratio: 3.02, gain: 0.11, decay: 0.75, detune: 7 },
    { ratio: 4.17, gain: 0.06, decay: 0.45, detune: 9 },
  ];

  // How much of the courtyard each cue sits in. This is a design decision, not
  // a default: the river is far away and very wet, a lantern is at arm's length,
  // and a UI click is effectively inside your head and stays nearly dry.
  const SENDS = {
    'lantern-launch': 0.30,
    'match': 0.34,
    'drop': 0.55,
    'trellis': 0.30,
    'dead-line-warning': 0.34,
    'menu-click': 0.20,
    'win': 0.55,
    'game-over': 0.42,
  };

  const CUES = {
    // Paper leaving the hand: friction, then air as it lifts away.
    'lantern-launch': function (ctx, o, t, p, r) {
      const dur = S.between(r, 0.30, 0.38);
      S.rustle(ctx, o, t, {
        f0: S.between(r, 850, 1050), f1: S.between(r, 2300, 2800),
        Q: 1.7, dur, gain: 0.20, attack: dur * 0.4, seed: (r() * 1e6) | 0,
      });
      S.rustle(ctx, o, t + 0.02, {
        f0: 300, f1: 520, Q: 0.8, dur: dur * 0.9, gain: 0.07,
        attack: dur * 0.5, seed: (r() * 1e6) | 0,
      });
      return dur + 0.1;
    },

    // A glass wind-chime struck. Chain size sets the pitch; strike position
    // varies per play, which rebalances the partials so repeats don't fatigue.
    'match': function (ctx, o, t, p, r) {
      const f = matchFreq((p && p.count) || 3) * S.cents(r, 18);
      S.strike(ctx, o, t, { dur: 0.005, hp: 4200, gain: 0.16, seed: (r() * 1e6) | 0 });
      const bright = S.between(r, 0.8, 1.25); // where it was hit
      const partials = FURIN.map((q, i) => ({
        ...q,
        gain: q.gain * (i === 0 ? 1 : Math.pow(bright, i)),
        decay: q.decay * S.between(r, 0.9, 1.12),
      }));
      S.body(ctx, o, t, { f0: f, gain: 0.26, partials });
      return 1.0;
    },

    // A lantern cut loose, falling to the river. Two droplets, the second
    // offset randomly, so a cascade never sounds like a metronome.
    'drop': function (ctx, o, t, p, r) {
      const f0 = S.between(r, 280, 380);
      S.droplet(ctx, o, t, { f0, f1: f0 * S.between(r, 4.2, 5.4), dur: 0.045, gain: 0.20, seed: (r() * 1e6) | 0 });
      if (r() < 0.75) {
        const off = S.between(r, 0.05, 0.13);
        S.droplet(ctx, o, t + off, {
          f0: f0 * 0.85, f1: f0 * 3.8, dur: 0.038, gain: 0.10, seed: (r() * 1e6) | 0,
        });
      }
      return 0.25;
    },

    // Rope and wood taking the load as the trellis descends, ending in a
    // wooden knock as it seats.
    'trellis': function (ctx, o, t, p, r) {
      const dur = S.between(r, 0.42, 0.55);
      S.creak(ctx, o, t, {
        f0: S.between(r, 220, 280), f1: S.between(r, 150, 190),
        Q: 7.5, dur, gain: 0.24, rate: 1, seed: (r() * 1e6) | 0,
      });
      S.strike(ctx, o, t + dur * 0.92, { dur: 0.008, hp: 900, gain: 0.14, seed: (r() * 1e6) | 0 });
      S.body(ctx, o, t + dur * 0.92, {
        f0: S.between(r, 165, 195), gain: 0.16,
        partials: [
          { ratio: 1.0, gain: 1.0, decay: 0.14, detune: 3 },
          { ratio: 2.4, gain: 0.3, decay: 0.07, detune: 5 },
        ],
      });
      return dur + 0.25;
    },

    // The same rope, tighter and higher, with two low tones beating against
    // each other underneath. Beating is a dread signal — it's unsettling before
    // you can say why.
    'dead-line-warning': function (ctx, o, t, p, r) {
      const dur = S.between(r, 0.45, 0.55);
      S.creak(ctx, o, t, {
        f0: S.between(r, 340, 400), f1: S.between(r, 260, 300),
        Q: 9, dur, gain: 0.22, rate: 1.5, seed: (r() * 1e6) | 0,
      });
      S.body(ctx, o, t, {
        f0: 98, gain: 0.16,
        partials: [
          { ratio: 1.0, gain: 1.0, decay: dur * 1.6, detune: 26, attack: 0.05 }, // ~3 Hz beat
        ],
      });
      S.thump(ctx, o, t + dur * 0.5, { f0: 90, f1: 42, dur: 0.30, gain: 0.13, seed: (r() * 1e6) | 0 });
      return dur + 0.4;
    },

    // Hyoshigi — the hardwood clapper used to mark time in a theatre.
    'menu-click': function (ctx, o, t, p, r) {
      S.strike(ctx, o, t, { dur: 0.003, hp: 1800, gain: 0.20, seed: (r() * 1e6) | 0 });
      S.body(ctx, o, t, {
        f0: S.between(r, 1150, 1300), gain: 0.14,
        partials: [
          { ratio: 1.0, gain: 1.0, decay: 0.045, detune: 4 },
          { ratio: 2.9, gain: 0.35, decay: 0.022, detune: 6 },
        ],
      });
      return 0.12;
    },

    // The temple bell. The strike is bright and brief; what you actually hear
    // for the next six seconds is eight inharmonic partials decaying at eight
    // different rates, each a detuned pair beating slowly against itself.
    'win': function (ctx, o, t, p, r) {
      S.strike(ctx, o, t, { dur: 0.02, hp: 1400, gain: 0.22, seed: (r() * 1e6) | 0 });
      S.strike(ctx, o, t, { dur: 0.06, hp: 400, gain: 0.10, seed: (r() * 1e6) | 0 });
      S.body(ctx, o, t, { f0: 175 * S.cents(r, 8), gain: 0.30, partials: BONSHO });
      return 7.5;
    },

    // Koto — three plucked strings descending, tension easing off each one, the
    // tails overlapping into the room.
    'game-over': function (ctx, o, t, p, r) {
      const notes = [392.0, 329.6, 261.6];
      let at = t;
      notes.forEach((f, i) => {
        const last = i === notes.length - 1;
        S.strike(ctx, o, at, { dur: 0.004, hp: 3000, gain: 0.08, seed: (r() * 1e6) | 0 });
        S.pluck(ctx, o, at, {
          freq: f * S.cents(r, 10),
          dur: last ? 2.6 : 1.5,
          gain: 0.28,
          damping: last ? 0.9975 : 0.996,
          tone: 3000 - i * 350,
          bend: last ? 0.955 : 0.985,
          seed: (r() * 1e6) | 0,
        });
        at += last ? 0 : S.between(r, 0.26, 0.34);
      });
      return 3.2;
    },
  };

  // The ambient bed docs/design-concept.md §8 has always asked for: river water
  // and irregular taiko. Impossible on the old engine, which had no sustained
  // voice at all.
  function ambient(ctx, o, t, dur, r) {
    S.stream(ctx, o, t, dur, { f: 780, Q: 0.75, rate: 0.06, sweep: 260, gain: 0.055, fade: 1.6, seed: 101 });
    S.stream(ctx, o, t, dur, { f: 1900, Q: 1.1, rate: 0.041, sweep: 500, gain: 0.028, fade: 2.0, seed: 202 });
    S.stream(ctx, o, t, dur, { f: 220, Q: 0.6, rate: 0.023, sweep: 70, gain: 0.030, fade: 2.4, seed: 303 });
    let at = t + S.between(r, 2.0, 4.0);
    while (at < t + dur - 1.0) {
      S.thump(ctx, o, at, { f0: S.between(r, 76, 96), f1: 38, dur: 0.5, gain: S.between(r, 0.05, 0.09), seed: (r() * 1e6) | 0 });
      at += S.between(r, 3.5, 7.0);
    }
    return dur;
  }

  global.MoonLitPack = { name: 'moon-lit', ROOM, SENDS, CUES, FURIN, BONSHO, ambient, matchFreq };
})(typeof window !== 'undefined' ? window : globalThis);
