/**
 * Cross-browser fullscreen helpers.
 *
 * The Fullscreen API's standard names (document.documentElement
 * .requestFullscreen, document.exitFullscreen, document.fullscreenElement,
 * the "fullscreenchange" event) are what Chrome, Firefox, and modern Edge
 * use — but Safari (desktop and iOS) and some older/embedded browsers
 * still only expose the vendor-prefixed WebKit versions
 * (webkitRequestFullscreen / webkitExitFullscreen / webkitFullscreenElement
 * / "webkitfullscreenchange"). The exam pages only ever checked the
 * unprefixed names, so on any WebKit-prefixed browser
 * `requestFullscreen` was undefined and the student was blocked from
 * starting the exam at all ("Fullscreen is required to start the
 * examination on this device."), even though that browser actually does
 * support fullscreen — just under a different name.
 *
 * These helpers try the standard name first and fall back to every known
 * vendor prefix, so "any browser" (the actual requirement) is genuinely
 * supported instead of only Chromium-based ones.
 */

export function supportsFullscreen(element = document.documentElement) {
  return Boolean(
    element.requestFullscreen ||
    element.webkitRequestFullscreen ||
    element.webkitRequestFullScreen ||
    element.mozRequestFullScreen ||
    element.msRequestFullscreen
  );
}

export async function requestFullscreenCompat(element = document.documentElement) {
  const request =
    element.requestFullscreen ||
    element.webkitRequestFullscreen ||
    element.webkitRequestFullScreen ||
    element.mozRequestFullScreen ||
    element.msRequestFullscreen;
  if (!request) throw new Error("Fullscreen is not supported on this browser.");
  // Safari's webkitRequestFullscreen (and older prefixed variants) can
  // reject differently than the standard promise-based API, and some
  // implementations don't return a promise at all — normalize both into
  // a real promise so callers can always `await` this.
  return Promise.resolve(request.call(element));
}

export function exitFullscreenCompat() {
  const exit =
    document.exitFullscreen ||
    document.webkitExitFullscreen ||
    document.webkitCancelFullScreen ||
    document.mozCancelFullScreen ||
    document.msExitFullscreen;
  if (!exit) return Promise.resolve();
  return Promise.resolve(exit.call(document)).catch(() => undefined);
}

export function fullscreenElementCompat() {
  return (
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.mozFullScreenElement ||
    document.msFullscreenElement ||
    null
  );
}

// All the vendor-prefixed event names that fire when fullscreen state
// changes, so callers can attach one listener per name and reliably hear
// about it regardless of which engine the student is on.
export const FULLSCREEN_CHANGE_EVENTS = [
  "fullscreenchange",
  "webkitfullscreenchange",
  "mozfullscreenchange",
  "MSFullscreenChange",
];
