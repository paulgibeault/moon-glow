// moon-lit sound pack — the game's own sound design.
//
// Loaded as a plain script after /sdk/v3/arcade-audio.js. js/sfx.js registers
// everything here with Arcade.audio; the launcher's tools/soundpack renderer
// loads this same file to produce audition WAVs, so what gets approved by ear
// is what plays.
//
// The place: a quiet tropical pond on a warm summer night. Still water, reeds,
// paper, rope, wood, bronze, silk strings — and a great deal of silence, which
// is the loudest thing here. Nothing is close except the lantern in your hands.
// Everything is heard in that one space, which is why every cue feeds one
// shared room (see ROOM below).
//
// Register plan, so simultaneous cues occupy different bands instead of masking
// each other:
//   blast/flame body 30–200 · bell 60–1200 · wood/rope 120–800 · water 190–820
//   paper 125–600 · flame front 620–3.2k · ruffle 700–2.2k · insects 3–4.5k
//
// Every cue takes an `r` (seeded random stream) and varies pitch, timing and
// layer balance per play. No two plays are identical — that is deliberate and
// it is most of the difference between "a sound" and "a sound effect".

(function (global) {
  'use strict';
  const S = global.ArcadeAudioElements;

  // Outdoors over water: the reflections come from the far bank and the tree
  // line, so they arrive late, arrive dark (foliage absorbs the top end long
  // before stone does) and die quickly. A long bright tail would put the pond
  // indoors.
  const ROOM = {
    dur: 1.9,
    decay: 0.38,
    preDelay: 0.026,
    wet: 0.6,
    shelfHz: 3600,
    shelfDb: -7,
    seed: 1729,
  };

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

  // How much of the pond each cue sits in. This is a design decision, not a
  // default: the water carries a long way, a lantern is at arm's length, and a
  // UI click is effectively inside your head and stays nearly dry.
  const SENDS = {
    'lantern-launch': 0.28,
    'carousel': 0.22,    // the wheel is right in front of you
    'match': 0.32,
    'moonburst': 0.52,   // big, and out in the field rather than in your hands
    'drop': 0.55,
    'trellis': 0.30,
    'dead-line-warning': 0.34,
    'menu-click': 0.20,
    'win': 0.55,
    'game-over': 0.42,
  };

  // Two gestures fire on literally every shot — the lamp climbing away and the
  // wheel turning under it — and one fires on every clear. Anything at that
  // rate has to be quieter than instinct says: loud enough to register as
  // texture, quiet enough that you would not be able to say afterwards that you
  // heard it. These are the levels the whole mix is balanced around, which is
  // why they live here as named constants rather than buried in each cue.
  const CONSTANT = 0.022;   // per-shot gestures
  const FREQUENT = 0.048;   // per-clear gestures

  const CUES = {
    // A lantern climbing away. Paced against the thing on screen: a lamp takes
    // the better part of a second to clear the trellis, so a third of a second
    // of paper friction reads as a flick, not a release. Two things carry the
    // length — the gesture runs ~0.85s, and the envelope peaks LATE (attack is
    // most of its duration), so the sound is still opening while the lamp is
    // still rising.
    //
    // One gesture, not two. An earlier version put a brighter paper-friction
    // layer at the front for the hand letting go; against a lamp that simply
    // drifts upward it read as a separate event before the launch — a double
    // sound. What is left is the climb alone, at CONSTANT: barely there, and
    // dark. The `lp` matters as much as the gain here — a bandpass leaks enough
    // top end that a quiet low gesture turns into audible hiss, which is the
    // one thing that would make this obtrusive at this level.
    'lantern-launch': function (ctx, o, t, p, r) {
      const dur = S.between(r, 0.80, 0.95);
      // the band falls as the lamp recedes from you
      S.rustle(ctx, o, t + 0.02, {
        f0: S.between(r, 500, 600), f1: S.between(r, 270, 330),
        Q: 1.1, lp: 900, dur, gain: CONSTANT, attack: dur * 0.62, seed: (r() * 1e6) | 0,
      });
      // warm air under the shell — the same gesture, an octave and a half down,
      // so it thickens the climb instead of following it
      S.rustle(ctx, o, t + 0.03, {
        f0: 190, f1: 125, Q: 0.7, lp: 400, dur: dur * 0.92, gain: CONSTANT * 0.45,
        attack: dur * 0.58, seed: (r() * 1e6) | 0,
      });
      return dur + 0.2;
    },

    // The launcher wheel turning a quarter revolution to bring the next lantern
    // up. On screen that is a quintic ease-out over ~2.2s — it accelerates the
    // instant the shot leaves and settles heavily into the docked position — so
    // the creak has to slow down with it (`rate1` below the starting `rate`)
    // and finish on the wooden knock of the fork seating.
    //
    // This fires on every single shot, so it lives at CONSTANT with the rest of
    // the per-shot texture. Repetition is the real risk: bamboo, two forks and
    // a hub is one small mechanism, and a mechanism that makes the same noise
    // every turn stops being furniture and starts being a beep. So each turn
    // pulls its own grain (band, Q, stick-slip rate and decay), sometimes
    // catches once mid-turn, and seats with a knock that is sometimes barely
    // there — the wheel is the same wheel, but no two turns of it agree.
    'carousel': function (ctx, o, t, p, r) {
      const dur = S.between(r, 0.85, 1.15);
      const f0 = S.between(r, 190, 320);          // where this turn's grain sits
      const rate = S.between(r, 1.5, 2.4);        // fast while it accelerates…
      S.creak(ctx, o, t, {
        f0, f1: f0 * S.between(r, 0.62, 0.80),
        Q: S.between(r, 5.5, 9.0), lp: S.between(r, 700, 1100),
        // The two lowpass stages that keep bamboo from reading as hiss also
        // take real level with them, hence the multiplier: this lands the wheel
        // just under the lamp climbing away from it.
        dur, gain: CONSTANT * 1.5 * S.between(r, 0.85, 1.25),
        rate, rate1: rate * S.between(r, 0.18, 0.35),  // …slowing as it settles
        attack: dur * S.between(r, 0.12, 0.25),
        seed: (r() * 1e6) | 0,
      });
      // A grain catching partway round. Not every turn, and never at the same
      // point in the rotation.
      if (r() < 0.55) {
        const at = t + dur * S.between(r, 0.25, 0.6);
        S.creak(ctx, o, at, {
          f0: f0 * S.between(r, 1.15, 1.6), Q: S.between(r, 8, 13), lp: 1300,
          dur: S.between(r, 0.06, 0.14), gain: CONSTANT * S.between(r, 0.5, 0.9),
          rate: S.between(r, 2.0, 3.4), attack: 0.01, seed: (r() * 1e6) | 0,
        });
      }
      // The fork seating. Wood on wood, and quiet — the wheel is heavy and the
      // stop is cushioned by the rope binding at the hub.
      if (r() < 0.85) {
        const at = t + dur * S.between(r, 0.88, 0.98);
        const knock = CONSTANT * S.between(r, 0.6, 1.1);
        S.strike(ctx, o, at, { dur: 0.006, hp: S.between(r, 700, 1100), gain: knock * 0.7, seed: (r() * 1e6) | 0 });
        S.body(ctx, o, at, {
          f0: S.between(r, 150, 210), gain: knock,
          partials: [
            { ratio: 1.0, gain: 1.0, decay: S.between(r, 0.06, 0.13), detune: 4 },
            { ratio: 2.4, gain: 0.28, decay: S.between(r, 0.03, 0.07), detune: 7 },
          ],
        });
      }
      return dur + 0.2;
    },

    // Lanterns catching fire — the library's `flare`, one per lamp in the
    // cluster. The first takes, and the flame jumps to its neighbours a few
    // tens of milliseconds apart, each one bigger and a shade brighter than the
    // last, so a large clear is heard as one swelling bloom that goes up rather
    // than as a louder single hit.
    //
    // Level is the whole design here. Paper catching alight is a soft sound;
    // this one is a reward that repeats several times a minute for an entire
    // level, and anything with presence becomes a nag by the third clear. It
    // sits at FREQUENT, dark (`lp`), with `weight` low enough that the low
    // pressure pulse is felt and not heard.
    'match': function (ctx, o, t, p, r) {
      const count = Math.max(3, (p && p.count) | 0 || 3);
      const lamps = Math.min(count, 8);
      // Each lamp adds to the fire without adding its own full loudness — the
      // aggregate has to grow, and it also has to stay off the ceiling.
      const norm = 1 / (1 + 0.28 * (lamps - 1));
      let at = t;
      for (let i = 0; i < lamps; i++) {
        S.flare(ctx, o, at, {
          f0: S.between(r, 1250, 1600), f1: S.between(r, 600, 760),
          bright: 1 + 0.05 * i, lp: 2600,
          dur: S.between(r, 0.28, 0.38) * (0.9 + 0.25 * norm),
          gain: FREQUENT * norm * (0.95 + 0.26 * i),
          weight: 0.22, wf0: S.between(r, 130, 170),
          seed: (r() * 1e6) | 0,
        });
        at += S.between(r, 0.045, 0.085);
      }
      // A big cluster leaves a low bloom of hot air behind it. Felt, not heard.
      if (lamps >= 5) {
        S.thump(ctx, o, t + 0.09, {
          f0: S.between(r, 96, 116), f1: 40, dur: 0.55, gain: FREQUENT * 0.4,
          seed: (r() * 1e6) | 0,
        });
      }
      return at - t + 0.7;
    },

    // Moonburst — the banked charge detonating inside the field. This is the
    // one moment in the game that is an explosion rather than a lamp catching
    // light, and the one cue deliberately allowed to be loud: it happens a
    // couple of times a level at most, and it is the payoff for banking a
    // combo. The library's `blast` is the whole event; everything after it is
    // aftermath.
    'moonburst': function (ctx, o, t, p, r) {
      S.blast(ctx, o, t, {
        size: S.between(r, 0.95, 1.1), gain: 0.24,
        f0: S.between(r, 2400, 3000), f1: S.between(r, 190, 240),
        wf0: S.between(r, 120, 145), bf0: S.between(r, 58, 70),
        seed: (r() * 1e6) | 0,
      });
      // lamps going up in the blast's wake, scattered rather than in sequence
      let at = t + 0.06;
      for (let i = 0; i < 4; i++) {
        S.flare(ctx, o, at, {
          f0: S.between(r, 1250, 1600), f1: S.between(r, 600, 760),
          bright: 1 + 0.08 * i, lp: 2600, dur: S.between(r, 0.26, 0.36),
          gain: FREQUENT * S.between(r, 0.5, 0.8), weight: 0.3,
          seed: (r() * 1e6) | 0,
        });
        at += S.between(r, 0.05, 0.12);
      }
      // and what it threw into the water
      let wet = t + S.between(r, 0.28, 0.40);
      for (let i = 0; i < 3; i++) {
        const f0 = S.between(r, 260, 360);
        S.droplet(ctx, o, wet, { f0, f1: f0 * S.between(r, 4.0, 5.2), dur: 0.04, gain: 0.09, seed: (r() * 1e6) | 0 });
        wet += S.between(r, 0.06, 0.15);
      }
      return 1.6;
    },

    // A lantern cut loose, falling to the water. Two droplets, the second
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

  // ── the beds ──────────────────────────────────────────────────────────────
  // Sustained cues, in the SDK's own shape: fn(ctx, out, when, params, rnd)
  // returning a teardown. Two of them rather than one, because they change on
  // different clocks — the pond never varies, and the insects answer the
  // pressure of the endgame. Keeping them separate means the insect layer can
  // be retuned (SDK 3.7.0+) without restarting the water, which would put an
  // audible seam under the level's tensest moment.
  //
  // `S.teardown(collect)` is the library's standard teardown: a bed outlives
  // the moment it was triggered, so stopping it has to actually stop its
  // sources — merely disconnecting the output leaves them scheduled and alive
  // for the rest of the bed's duration, once per level played.

  // Something small shifting in the reeds — a wing, a leaf, a frog resettling.
  // Brief and unhurried: it is over before you have decided what it was.
  function ruffle(ctx, o, t, r, collect) {
    const dur = S.between(r, 0.10, 0.20);
    S.rustle(ctx, o, t, {
      f0: S.between(r, 1500, 2200), f1: S.between(r, 700, 1000),
      Q: 1.3, dur, gain: S.between(r, 0.018, 0.030), attack: dur * 0.3,
      seed: (r() * 1e6) | 0, collect,
    });
    // Most movements are a single shift; some are two, a beat apart.
    if (r() < 0.45) {
      const d2 = dur * S.between(r, 0.5, 0.8);
      S.rustle(ctx, o, t + dur + S.between(r, 0.05, 0.14), {
        f0: S.between(r, 1300, 1800), f1: S.between(r, 650, 900),
        Q: 1.3, dur: d2, gain: S.between(r, 0.010, 0.020), attack: d2 * 0.3,
        seed: (r() * 1e6) | 0, collect,
      });
    }
  }

  // The other voice out there: a dry tick, two or three of them, no pitch.
  function ticks(ctx, o, t, r, heat, collect) {
    const n = 2 + ((r() * 2) | 0);
    let at = t;
    for (let i = 0; i < n; i++) {
      S.strike(ctx, o, at, {
        dur: 0.004, hp: S.between(r, 4200, 5200),
        gain: S.between(r, 0.030, 0.048) * (1 + 0.2 * heat),
        seed: (r() * 1e6) | 0, collect,
      });
      at += S.between(r, 0.06, 0.11) / (1 + 0.3 * heat);
    }
  }

  // The pond. Almost nothing: a low breath of warm air and the surface barely
  // moving. Still water, so no river hiss — and no third layer up in the reeds
  // either: filtered noise in the low kilohertz with a wide slow LFO on its
  // band is *wind*, however quiet you make it, and a summer night at a pond is
  // still. What is left is two dark layers with barely any drift, low enough
  // that the silences between insects are real silences.
  function ambient(ctx, o, t, params, r) {
    const dur = (params && params.dur) || 420;
    const collect = [];
    S.stream(ctx, o, t, dur, { f: 190, Q: 0.5, lp: 420, rate: 0.015, sweep: 32, gain: 0.026, fade: 3.0, seed: 101, collect });
    S.stream(ctx, o, t, dur, { f: 470, Q: 0.9, lp: 820, rate: 0.038, sweep: 70, gain: 0.008, fade: 2.6, seed: 202, collect });
    let at = t + S.between(r, 5.0, 13.0);
    while (at < t + dur - 1.0) {
      ruffle(ctx, o, at, r, collect);
      at += S.between(r, 13.0, 32.0);
    }
    return S.teardown(collect);
  }

  // The insects, as a layer of their own. `params.heat` 0..1 is the game's
  // pressure: at 0 this is a rare chirp every ten or twenty seconds and the
  // night reads as empty; near 1 they answer each other every couple of
  // seconds, faster and a little sharper — real crickets stridulate faster when
  // it is warm, which is why the same insect can carry the tension without any
  // other part of the mix changing. Nothing here announces itself, which is
  // what keeps it felt rather than noticed.
  function insects(ctx, o, t, params, r) {
    const dur = (params && params.dur) || 420;
    const heat = params && typeof params.heat === 'number' ? params.heat : 0;
    const collect = [];
    const h = Math.max(0, Math.min(1, heat));
    const spacing = 1 / (1 + 3.2 * h);
    let at = t + S.between(r, 1.5, 7.0) * spacing;
    while (at < t + dur - 0.5) {
      if (r() < 0.72) {
        S.chirp(ctx, o, at, {
          f: S.between(r, 3150, 4050) * (1 + 0.06 * h) * S.cents(r, 12),
          pulses: 2 + ((r() * 4) | 0),
          step: S.between(r, 0.034, 0.050) / (1 + 0.35 * h),
          gain: S.between(r, 0.040, 0.062) * (1 + 0.25 * h),
          collect,
        });
      } else {
        ticks(ctx, o, at, r, h, collect);
      }
      at += S.between(r, 7.0, 21.0) * spacing;
    }
    return S.teardown(collect);
  }

  global.MoonLitPack = { name: 'moon-lit', ROOM, SENDS, CUES, BONSHO, ambient, insects, ruffle };
})(typeof window !== 'undefined' ? window : globalThis);
