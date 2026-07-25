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

  // How much of the courtyard each cue sits in. This is a design decision, not
  // a default: the river is far away and very wet, a lantern is at arm's length,
  // and a UI click is effectively inside your head and stays nearly dry.
  const SENDS = {
    'lantern-launch': 0.28,
    'match': 0.32,
    'moonburst': 0.52,   // big, and out in the field rather than in your hands
    'drop': 0.55,
    'trellis': 0.30,
    'dead-line-warning': 0.34,
    'menu-click': 0.20,
    'win': 0.55,
    'game-over': 0.42,
  };

  // One lamp taking flame. Ignition is not a strike — there is no contact, so
  // there is no click: what you hear is air catching light.
  //
  // A flare, not a whop. The difference is almost entirely the envelope and the
  // register: the noise band is bright and airy and swells over ~60 ms rather
  // than punching in, and the low pressure pulse underneath is present only for
  // weight — pushed forward it turns the cue into a thrown-object thud, which
  // is what a paper lamp catching alight is not. The band still sweeps DOWNWARD
  // as the ball of light grows, because a bigger cavity resonates lower.
  //
  // `size` scales loudness and length, `bright` lifts the band so successive
  // lamps in a cluster don't stack into one tone.
  function flare(ctx, o, t, r, size, bright) {
    const dur = S.between(r, 0.28, 0.38) * (0.9 + 0.25 * size);
    // the flame front
    S.rustle(ctx, o, t, {
      f0: S.between(r, 1300, 1650) * bright,
      f1: S.between(r, 620, 780),
      Q: 0.9, dur, gain: 0.13 * size, attack: 0.055, seed: (r() * 1e6) | 0,
    });
    // the top of the flare — thinner, faster, and quieter than the front
    S.rustle(ctx, o, t + 0.01, {
      f0: S.between(r, 2600, 3200) * bright,
      f1: S.between(r, 1300, 1700),
      Q: 1.2, dur: dur * 0.6, gain: 0.045 * size, attack: 0.035, seed: (r() * 1e6) | 0,
    });
    // weight only — you should feel this rather than hear it as a hit
    S.thump(ctx, o, t + 0.01, {
      f0: S.between(r, 130, 170), f1: S.between(r, 52, 64),
      dur: dur * 0.9, gain: 0.038 * size, seed: (r() * 1e6) | 0,
    });
    // the paper shell speaking briefly as it takes
    S.body(ctx, o, t + 0.015, {
      f0: S.between(r, 300, 370) * bright, gain: 0.028 * size,
      partials: [
        { ratio: 1.0, gain: 1.0, decay: 0.09, detune: 7, attack: 0.02 },
        { ratio: 2.31, gain: 0.24, decay: 0.04, detune: 10, attack: 0.014 },
      ],
    });
  }

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
    // sound. What is left is the climb alone, soft enough to sit under the
    // scene rather than announce each shot.
    'lantern-launch': function (ctx, o, t, p, r) {
      const dur = S.between(r, 0.80, 0.95);
      // the band falls as the lamp recedes from you
      S.rustle(ctx, o, t + 0.02, {
        f0: S.between(r, 500, 600), f1: S.between(r, 270, 330),
        Q: 1.1, dur, gain: 0.055, attack: dur * 0.62, seed: (r() * 1e6) | 0,
      });
      // warm air under the shell — the same gesture, an octave and a half down,
      // so it thickens the climb instead of following it
      S.rustle(ctx, o, t + 0.03, {
        f0: 190, f1: 125, Q: 0.7, dur: dur * 0.92, gain: 0.026,
        attack: dur * 0.58, seed: (r() * 1e6) | 0,
      });
      return dur + 0.2;
    },

    // Lanterns catching fire. One soft flare per lamp in the cluster: the first
    // takes, and the flame jumps to its neighbours a few tens of milliseconds
    // apart, each one bigger and a shade brighter than the last, so a large
    // clear is heard as one swelling bloom that goes up rather than as a louder
    // single hit.
    'match': function (ctx, o, t, p, r) {
      const count = Math.max(3, (p && p.count) | 0 || 3);
      const lamps = Math.min(count, 8);
      // Each lamp adds to the fire without adding its own full loudness — the
      // aggregate has to grow, and it also has to stay off the ceiling.
      const norm = 1 / (1 + 0.28 * (lamps - 1));
      let at = t;
      for (let i = 0; i < lamps; i++) {
        flare(ctx, o, at, r, norm * (0.95 + 0.26 * i), 1 + 0.05 * i);
        at += S.between(r, 0.045, 0.085);
      }
      // A big cluster leaves a low bloom of hot air behind it.
      if (lamps >= 5) {
        S.thump(ctx, o, t + 0.09, {
          f0: S.between(r, 96, 116), f1: 40, dur: 0.55, gain: 0.055,
          seed: (r() * 1e6) | 0,
        });
      }
      return at - t + 0.7;
    },

    // Moonburst — the banked charge detonating inside the field. This is the
    // one moment in the game that is an explosion rather than a lamp catching
    // light, so it is built the other way round from 'match': the blast front
    // arrives first and hard, the low end carries it, and the flames are the
    // aftermath rather than the event.
    'moonburst': function (ctx, o, t, p, r) {
      // the crack — the only part of the pack with a genuinely hard onset
      S.strike(ctx, o, t, { dur: 0.035, hp: 260, gain: 0.26, seed: (r() * 1e6) | 0 });
      S.strike(ctx, o, t + 0.004, { dur: 0.012, hp: 2200, gain: 0.11, seed: (r() * 1e6) | 0 });
      // the blast front, sweeping the whole band downward as it expands
      S.rustle(ctx, o, t, {
        f0: S.between(r, 2400, 3000), f1: S.between(r, 180, 240),
        Q: 0.65, dur: S.between(r, 0.50, 0.62), gain: 0.20, attack: 0.008,
        seed: (r() * 1e6) | 0,
      });
      // the boom under it
      S.thump(ctx, o, t, {
        f0: S.between(r, 120, 145), f1: 30, dur: S.between(r, 0.85, 1.05),
        gain: 0.24, seed: (r() * 1e6) | 0,
      });
      // the shell of hot air left behind, sagging as it cools
      S.body(ctx, o, t + 0.02, {
        f0: S.between(r, 58, 70), gain: 0.10,
        partials: [
          { ratio: 1.0, gain: 1.0, decay: 1.30, detune: 11, attack: 0.03 },
          { ratio: 2.47, gain: 0.30, decay: 0.55, detune: 15, attack: 0.02 },
          { ratio: 4.13, gain: 0.12, decay: 0.28, detune: 19, attack: 0.015 },
        ],
      });
      // lamps going up in the blast's wake, scattered rather than in sequence
      let at = t + 0.06;
      for (let i = 0; i < 4; i++) {
        flare(ctx, o, at, r, S.between(r, 0.35, 0.55), 1 + 0.08 * i);
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

  // ── the bed ───────────────────────────────────────────────────────────────
  // Two sustained cues rather than one, because they change on different
  // clocks: the pond never varies, and the insects answer the pressure of the
  // endgame. Keeping them separate means pressure can be re-scheduled without
  // restarting the water, which would put an audible seam under the level's
  // tensest moment.
  //
  // Both return a teardown that stops every source they started. A bed outlives
  // the moment it was triggered, so stopping it has to actually stop it —
  // merely disconnecting the output leaves the sources scheduled and alive for
  // the rest of the bed's duration, once per level played.

  const stopAll = (collect) => function teardown(when) {
    for (const n of collect) { try { n.stop(when); } catch (e) { /* already ended */ } }
  };

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

  // A cricket's chirp is a train of short pure-ish pulses, not a tone: 2–5 of
  // them a few tens of milliseconds apart. Real crickets pulse faster when it
  // is warmer, which is the lever `heat` pulls — the same insect, more urgent.
  function chirp(ctx, o, t, r, heat, collect) {
    const f = S.between(r, 3150, 4050) * (1 + 0.06 * heat);
    const pulses = 2 + ((r() * 4) | 0);
    const step = S.between(r, 0.034, 0.050) / (1 + 0.35 * heat);
    const gain = S.between(r, 0.040, 0.062) * (1 + 0.25 * heat);
    for (let i = 0; i < pulses; i++) {
      S.body(ctx, o, t + i * step, {
        f0: f * S.cents(r, 12), gain,
        partials: [
          { ratio: 1.0, gain: 1.0, decay: 0.016, detune: 9, attack: 0.004 },
          { ratio: 2.02, gain: 0.16, decay: 0.009, detune: 14, attack: 0.003 },
        ],
        collect,
      });
    }
    return pulses * step;
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
  function ambient(ctx, o, t, dur, r) {
    const collect = [];
    S.stream(ctx, o, t, dur, { f: 190, Q: 0.5, lp: 420, rate: 0.015, sweep: 32, gain: 0.026, fade: 3.0, seed: 101, collect });
    S.stream(ctx, o, t, dur, { f: 470, Q: 0.9, lp: 820, rate: 0.038, sweep: 70, gain: 0.008, fade: 2.6, seed: 202, collect });
    let at = t + S.between(r, 5.0, 13.0);
    while (at < t + dur - 1.0) {
      ruffle(ctx, o, at, r, collect);
      at += S.between(r, 13.0, 32.0);
    }
    return stopAll(collect);
  }

  // The insects, as a layer of their own. `heat` 0..1 is the game's pressure:
  // at 0 this is a rare chirp every ten or twenty seconds and the night reads
  // as empty; near 1 they answer each other every couple of seconds, faster and
  // a little sharper. Nothing else about the mix changes, which is what keeps
  // it felt rather than noticed.
  function insects(ctx, o, t, dur, r, heat) {
    const collect = [];
    const h = Math.max(0, Math.min(1, heat == null ? 0 : heat));
    const spacing = 1 / (1 + 3.2 * h);
    let at = t + S.between(r, 1.5, 7.0) * spacing;
    while (at < t + dur - 0.5) {
      if (r() < 0.72) chirp(ctx, o, at, r, h, collect);
      else ticks(ctx, o, at, r, h, collect);
      at += S.between(r, 7.0, 21.0) * spacing;
    }
    return stopAll(collect);
  }

  global.MoonLitPack = { name: 'moon-lit', ROOM, SENDS, CUES, BONSHO, ambient, insects, ruffle, chirp, flare };
})(typeof window !== 'undefined' ? window : globalThis);
