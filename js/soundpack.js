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
// There is NO sustained layer anywhere in this pack. Between events the game is
// silent, and that is the ambience: continuous filtered noise, at any level and
// any filter setting, is heard as hiss or wind, never as a still pond.
//
// Register plan, so simultaneous cues occupy different bands instead of masking
// each other:
//   blast sub 22–130 · flame 56–660 · bell 60–1200 · wood/rope 120–800
//   paper 125–600 · ruffle 700–2.2k · insects 3–4.5k
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
    'drop': 0.42,   // drifting away from you, but a cascade must stay defined
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

  // One lantern going up in flame. Every fire in the game is this gesture at a
  // different size — a lamp in a cluster, a lamp cut loose and drifting away, a
  // lamp caught in the Moonburst — so the character is decided once, here.
  //
  // The character is: low, and slow to arrive. The band sits under 700 Hz and
  // is lowpassed hard, the flash runs half a second or more, the onset is a
  // quarter of that, and the weight underneath swells in with the flame rather
  // than landing ahead of it. Everything the ear reads as a "pop" — a fast
  // onset, energy above ~1 kHz, a short body — is deliberately absent, because
  // this cue fires many times a minute and a pop repeated is a beep.
  //
  // `scale` stretches size and depth together, `bright` lifts the band a shade
  // so several flashes in a row don't stack into one tone.
  function flash(ctx, o, t, r, opts) {
    const scale = opts.scale == null ? 1 : opts.scale;
    const dur = S.between(r, 0.50, 0.66) * scale;
    S.flare(ctx, o, t, {
      f0: S.between(r, 520, 660), f1: S.between(r, 170, 220),
      bright: opts.bright == null ? 1 : opts.bright,
      lp: opts.lp || 850, Q: 0.8, dur,
      attack: dur * S.between(r, 0.22, 0.30),
      gain: opts.gain,
      weight: opts.weight == null ? 0.7 : opts.weight,
      wf0: S.between(r, 56, 74) / scale,
      wAttack: dur * 0.32,
      seed: (r() * 1e6) | 0,
    });
    return dur;
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
    // A flash of fire, low and soft — not a pop. Three things were making it
    // pop: the flare sat up around 1.3 kHz where the ear hears onsets sharply,
    // it was short enough (~0.3s) to be over before it had bloomed, and the
    // weight underneath punched in ahead of it. So the band is now most of an
    // octave lower and lowpassed harder, each flash runs ~0.55s, the onset is
    // slow enough to be a swell, and the low end arrives *with* the flame
    // (`wAttack`) instead of in front of it.
    //
    // Level is the other half of the design. Paper catching alight is a soft
    // sound, and this one repeats several times a minute for an entire level:
    // anything with presence becomes a nag by the third clear.
    'match': function (ctx, o, t, p, r) {
      const count = Math.max(3, (p && p.count) | 0 || 3);
      const lamps = Math.min(count, 8);
      // Each lamp adds to the fire without adding its own full loudness — the
      // aggregate has to grow, and it also has to stay off the ceiling.
      const norm = 1 / (1 + 0.28 * (lamps - 1));
      let at = t;
      for (let i = 0; i < lamps; i++) {
        flash(ctx, o, at, r, {
          gain: FREQUENT * norm * (0.95 + 0.26 * i),
          bright: 1 + 0.05 * i,
        });
        at += S.between(r, 0.055, 0.095);
      }
      // A big cluster leaves a low bloom of hot air behind it. Felt, not heard.
      if (lamps >= 5) {
        S.thump(ctx, o, t + 0.09, {
          f0: S.between(r, 62, 76), f1: 28, dur: 0.85, gain: FREQUENT * 0.6,
          attack: 0.11, seed: (r() * 1e6) | 0,
        });
      }
      return at - t + 1.0;
    },

    // Moonburst — the banked charge going up inside the field. A fireball, not
    // a detonation, and the distinction is the entire cue: fuel igniting has no
    // snap at the front, so `crack` is 0 and the front swells in over ~55 ms.
    // With a crack on it this read as a firecracker however much bass sat
    // underneath. What arrives instead is a whump — a wall of low air — with
    // the ball of flame on top of it and a rumble rolling away across the pond.
    //
    // No `tone`, either: the ringing shell the element can add is heard over
    // water as a struck bell rather than as an explosion.
    'moonburst': function (ctx, o, t, p, r) {
      S.blast(ctx, o, t, {
        size: S.between(r, 1.2, 1.35), gain: 0.235,
        crack: 0, attack: S.between(r, 0.045, 0.070), rumble: 1.25,
        f0: S.between(r, 1300, 1700), f1: S.between(r, 110, 150), lp: 1500,
        wf0: S.between(r, 92, 112),
        seed: (r() * 1e6) | 0,
      });
      // The ball of fire itself: two big overlapping flashes, the second a beat
      // later and lower, so the fire keeps growing after the air has hit.
      flash(ctx, o, t + 0.01, r, { gain: FREQUENT * 1.7, scale: 1.6, weight: 0.9, lp: 1000 });
      flash(ctx, o, t + S.between(r, 0.09, 0.15), r, { gain: FREQUENT * 1.3, scale: 2.0, weight: 1.0, lp: 900 });
      // lamps going up in its wake, scattered rather than in sequence, trailing
      // off into the rumble
      let at = t + 0.18;
      for (let i = 0; i < 5; i++) {
        flash(ctx, o, at, r, {
          gain: FREQUENT * S.between(r, 0.5, 0.9), bright: 1 + 0.08 * i,
          scale: S.between(r, 0.8, 1.2),
        });
        at += S.between(r, 0.07, 0.18);
      }
      return 3.0;   // the rumble is most of this
    },

    // A lantern cut loose. This was a water droplet — the lantern hitting the
    // river — and a droplet is a contact click plus a fast upward sweep, which
    // is a *plip*: the sharpest, most out-of-place sound in the game, fired
    // several at a time on the biggest scoring moments. It burns instead. Same
    // gesture as a matched lamp, smaller and a touch brighter, because this one
    // is already alight and drifting away from you as it goes up.
    'drop': function (ctx, o, t, p, r) {
      flash(ctx, o, t, r, {
        gain: FREQUENT * S.between(r, 0.75, 1.05), scale: S.between(r, 0.7, 0.9),
        bright: S.between(r, 1.05, 1.18), weight: 0.5,
      });
      // Sometimes the flame gutters once more as it falls away.
      if (r() < 0.55) {
        flash(ctx, o, t + S.between(r, 0.10, 0.22), r, {
          gain: FREQUENT * S.between(r, 0.3, 0.5), scale: S.between(r, 0.5, 0.7),
          bright: S.between(r, 1.1, 1.3), weight: 0.35,
        });
      }
      return 0.9;
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

  // The pond — and it is silent. No sustained layer at all.
  //
  // This started as three drifting noise streams (a river), then two very quiet
  // dark ones (a pond), and both were the same mistake in different amounts:
  // continuous filtered noise is *always* heard, and what it is heard as is
  // hiss or wind, never as still water. Still water makes no sound. What is
  // actually out there on a summer night is discrete events with nothing
  // between them — so that is all this is: a ruffle in the reeds every 15–30
  // seconds, and the insect layer beside it. The silence between them is the
  // ambience, and it costs nothing to render.
  function ambient(ctx, o, t, params, r) {
    const dur = (params && params.dur) || 420;
    const collect = [];
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

  // Published under the framework's well-known handle (arcade-audio.js
  // registerPack) so the game's audio module and the launcher's soundpack
  // toolchain both reach it without either side knowing this game's name.
  S.registerPack({ name: 'moon-lit', ROOM, SENDS, CUES, BONSHO, ambient, insects, ruffle });
})(typeof window !== 'undefined' ? window : globalThis);
