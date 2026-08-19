/**
 * loop-policy.js — when the screen is allowed to rest.
 *
 * GAME_INTEGRATION §6d: a visible-but-idle game must let the display pipeline
 * reach 0 fps. Dirty-checking inside a loop that still runs every frame does
 * not achieve that, because the rAF callback itself is the wake-up. So the
 * loop parks — stop(), off the scheduler entirely — the moment nothing is
 * left to draw, and this is the predicate that decides "nothing".
 *
 * It lived in main.js, whose top level is a script with `await Arcade.ready`
 * and a document lookup, so it could not be imported in node and had no tests
 * — while every pure module around it was well covered. That is the wrong way
 * round for the one function that decides how much battery the game spends:
 * a condition wrongly returning true strands an animation mid-flight, and one
 * wrongly returning false spins the display at 60fps over a still image.
 *
 * Deliberately free of DOM, Arcade and module-level state: every input is
 * passed in, so a test can state the situation directly instead of building a
 * game to imply it.
 */

/**
 * @param {object} s
 * @param {boolean} s.hasGame              a game and a layout both exist
 * @param {boolean} s.loading              assets still arriving
 * @param {boolean} s.introCard            the mode intro card is up
 * @param {boolean} s.puzzleAwaitingEnd    puzzle mode, queue spent, not yet resolved
 * @param {boolean} s.menuOpen             a menu panel is open
 * @param {boolean} s.menuSettled          the menu's fade tween has finished
 * @param {boolean} s.speedAiming          speed mode, aiming — the clock is running
 * @param {boolean} s.shotsInFlight        at least one lantern is travelling
 * @param {boolean} s.withinInteractionTail  the player touched the screen recently
 * @param {boolean} s.aiming               phase is AIMING
 * @param {boolean} s.effectsActive        bursts, floats, ripples, the moonrise
 * @param {boolean} s.hudSettled           the score counter has converged
 * @returns {boolean} true when the loop may park
 */
export function isQuiescent(s) {
  if (!s.hasGame) return false;
  if (s.loading) return false;
  if (s.introCard) return false;
  // A puzzle that has spent its queue is waiting on a resolution that arrives
  // from a timer inside step(), so the loop has to stay awake to reach it.
  if (s.puzzleAwaitingEnd) return false;
  // An open menu panel is its own world: the board behind it is not being
  // played, so the only thing that can still need frames is the panel's own
  // fade. Deliberately returns rather than falling through — a menu open over
  // a mid-flight shot should still park once the fade lands.
  if (s.menuOpen) return s.menuSettled;
  // Speed mode's descent runs on a clock rather than on shots, so an idle
  // board is still counting down.
  if (s.speedAiming) return false;
  if (s.shotsInFlight) return false;
  // The interaction tail keeps ambience alive under the player's fingers. It
  // is the only condition here that is about the player rather than the game.
  if (s.withinInteractionTail) return false;
  if (!s.aiming) return false;
  if (s.effectsActive) return false;
  if (!s.hudSettled) return false;
  // The menu's fade is view-only state that lives outside the game model, so
  // it needs its own check even when no panel is open — a panel closing is a
  // fade running to zero with menuOpen already false.
  if (!s.menuSettled) return false;
  return true;
}
