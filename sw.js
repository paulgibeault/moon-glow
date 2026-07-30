/* Moon-Lit Service Worker — offline-first cache.
 *
 * CANONICAL FLEET SHAPE (tools/templates/game-sw.js in the launcher repo).
 * The structure here — version line, owned-prefix cleanup, scope-guarded
 * fetch, skip-waiting message — is meant to be identical across every arcade
 * app; only APP_VERSION, CACHE_PREFIX and the precache list differ. Fix a
 * bug here and it has to be carried everywhere.
 */

// Written by fleet CI on every deploy (fleet-ci.yml, "Bump patch version").
// DO NOT EDIT BY HAND, and keep the line exactly as written — single quotes,
// no leading whitespace — or the deploy-time rewrite silently stops firing
// and every fix ships to nobody who has already visited.
const APP_VERSION = '0.1.1';

// Every cache this game will ever own starts with this prefix. Cleanup is
// filtered to it; see activate for why that is not optional.
const CACHE_PREFIX = 'moon-lit-';
const CACHE_NAME = `${CACHE_PREFIX}v${APP_VERSION}`;

// WARNING: This list is manually maintained. When adding new static assets
// (JS files, CSS files, images, sounds, etc.), update this list too or
// offline mode will silently break for those assets.
// tools/verify-artifact.mjs cross-checks every entry against the deploy.
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './icon.png',
  './js/arcade-rng.js',
  './js/admin-panel.js',
  './js/assets.js',
  './js/board.js',
  './js/constants.js',
  './js/difficulty.js',
  './js/effects.js',
  './js/game.js',
  './js/geometry.js',
  './js/input.js',
  './js/lantern-svg.js',
  './js/layout.js',
  './js/main.js',
  './js/match.js',
  './js/physics.js',
  './js/prng.js',
  './js/projectile.js',
  './js/puzzles.js',
  './js/renderer.js',
  './js/renderer/effects.js',
  './js/renderer/hud.js',
  './js/renderer/menu.js',
  './js/renderer/style.js',
  './js/renderer/world.js',
  './js/scoring.js',
  './js/seed-explore.js',
  './js/seed-pattern.js',
  './js/serialization.js',
  './js/sfx.js',
  './js/soundpack.js',
  './js/stencil-packs.js',
  './js/telemetry.js',
  './img/bamboo-base-a.png',
  './img/bamboo-base-b.png',
  './img/bamboo-cane-short.png',
  './img/bamboo-cane-tall.png',
  './img/bamboo-cluster-dense.png',
  './img/bamboo-cluster-fan.png',
  './img/bamboo-cluster-multi.png',
  './img/bamboo-cluster-wide.png',
  './img/bamboo-leaf-single.png',
  './img/bamboo-stalk-a.png',
  './img/bamboo-stalk-b.png',
  './img/bamboo-tall-a.png',
  './img/bamboo-tall-b.png',
  './img/bamboo-tall-c.png',
  './img/bamboo-tip-a.png',
  './img/bamboo-tip-b.png',
  './img/bamboo-tip-c.png',
  './img/cradle-wheel.png',
  './img/favicon-32.png',
  './img/flame-sprite.png',
  './img/icon-192.png',
  './img/icon-512.png',
  './img/lantern-burst.png',
  './img/logo.png',
  './img/moon.png',
  './img/stencils/bugs/ant.png',
  './img/stencils/bugs/beetle.png',
  './img/stencils/bugs/butterfly.png',
  './img/stencils/bugs/dragonfly.png',
  './img/stencils/bugs/mantis.png',
  './img/stencils/bugs/moth.png',
  './img/stencils/dragons/dragon_head.png',
  './img/stencils/dragons/dragon_pearl.png',
  './img/stencils/dragons/fire_dragon.png',
  './img/stencils/dragons/flying_dragon.png',
  './img/stencils/dragons/jade_dragon.png',
  './img/stencils/dragons/water_dragon.png',
  './img/stencils/flowers/bamboo.png',
  './img/stencils/flowers/chrysanthemum.png',
  './img/stencils/flowers/lotus.png',
  './img/stencils/flowers/marigold.png',
  './img/stencils/flowers/orchid.png',
  './img/stencils/flowers/plum_blossom.png',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  // Deliberately NOT skipWaiting(). The new worker installs and waits; the
  // launcher spots it and offers the player an explicit "update ready" reload,
  // then sends the message below once they accept. Activating unannounced
  // would swap the cache under a running game, so anything fetched lazily
  // after the swap would come from a different build than the code asking.
});

self.addEventListener('message', event => {
  // Sent by the launcher's update control (menu → "Check for Updates", or the
  // automatic prompt) once the player accepts the reload.
  if (event.data && event.data.type === 'arcade:sw.skipWaiting') self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          // ONLY our own caches. caches.keys() is ORIGIN-scoped and the whole
          // fleet shares paulgibeault.github.io, so a bare `k !== CACHE_NAME`
          // filter would delete the launcher's cache and every sibling
          // game's on each activation.
          .filter(k => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME)
          .map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  // Only requests within this game's own scope. Without this guard the
  // handler below caches EVERY request the page makes under our cache —
  // including launcher assets like /arcade-sdk.js, which then get served
  // stale from here indefinitely, and cross-origin responses we have no
  // business storing.
  if (!event.request.url.startsWith(self.registration.scope)) return;

  if (event.request.mode === 'navigate') {
    // Network-first for the HTML shell to prevent stale content
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }
  // Cache-first for static assets; cache successful fetches too, so assets
  // missing from ASSETS (or added later) still work offline next time.
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        }
        return response;
      });
    })
  );
});
