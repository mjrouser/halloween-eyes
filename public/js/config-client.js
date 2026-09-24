// Polls the server for style changes and applies them at a scheduled instant.
//
// The config does not say "switch to ember". It says "ember, effective at T".
// Both windows read the same T from the same clock and switch on the same frame,
// so a live toggle exists without the two windows ever talking to each other.
//
// THE SHOW MUST NEVER DEPEND ON THIS. A failed poll is a no-op, never an error.
// Losing the network disables the toggle and nothing else.

import { SHAPES, PALETTES } from './themes.js';

const POLL_MS = 2000;

// Values the page can actually render. Anything else is dropped here, before it
// reaches buildEyes() — an unknown palette there would blank the screen, which
// breaks "the show must never depend on this". The server validates too; this
// is the last line of defense, not the only one.
const ALLOWED = {
  shape: Object.keys(SHAPES),
  palette: Object.keys(PALETTES),
  energyDrift: [true, false],
  crowdStyle: ['shrink', 'squash']
};
const KEYS = Object.keys(ALLOWED);

export function startConfigClient(onApply, { url = 'config.json', pollMs = POLL_MS } = {}) {
  let current = null;
  let pendingTimer = null;
  let stopped = false;

  function schedule(next, effectiveAt) {
    clearTimeout(pendingTimer);
    const delay = Math.max(0, effectiveAt - Date.now());
    pendingTimer = setTimeout(() => {
      current = { ...current, ...next };
      onApply(next);
    }, delay);
  }

  async function poll() {
    if (stopped) return;
    try {
      const response = await fetch(`${url}?t=${Date.now()}`, { cache: 'no-store' });
      if (response.ok) {
        const data = await response.json();
        const next = {};
        for (const key of KEYS) {
          if (ALLOWED[key].includes(data[key])) next[key] = data[key];
        }

        // Only keys that survived validation count. Comparing a dropped key
        // (undefined) against the current value would read as "changed" on
        // every poll and rebuild the eyes every two seconds.
        const changed = !current || KEYS.some((k) => k in next && next[k] !== current[k]);
        if (changed) {
          const effectiveAt = Number(data.effectiveAt) || 0;
          // A window that booted after the change was scheduled applies it at once:
          // the config is the truth, not the transition.
          schedule(next, effectiveAt);
        }
      }
    } catch {
      // Network down, server dead, malformed JSON — keep the current style and
      // try again on the next tick. Never throw, never blank the screen.
    }
    if (!stopped) setTimeout(poll, pollMs);
  }

  poll();

  return {
    stop() {
      stopped = true;
      clearTimeout(pendingTimer);
    }
  };
}
