// Scramble-text helper. Wraps GSAP's scrambleText plugin so any module can
// animate an element's text content into a new string with the same look as
// the rest of the site (uppercase chars, slight reveal delay, etc.).
//
// `overwrite: true` is important — if the user scrolls fast and triggers
// multiple scrambles back-to-back, only the latest tween survives, no queue.
export function animateScrambleText(el, newText, options = {}) {
  if (!el || newText == null) return null;

  const {
    duration = 1,
    chars = "upperCase",
    revealDelay = 0.4,
    speed = 0.6,
    ease = "none",
  } = options;

  return gsap.to(el, {
    duration,
    ease,
    overwrite: true,
    scrambleText: {
      text: newText,
      chars,
      revealDelay,
      speed,
    },
  });
}
