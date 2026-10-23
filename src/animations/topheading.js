import { registerCleanup } from "../utils/lifecycle";

// Phase 1: pre-paint the from-state before the page becomes visible.
export function prepTopHeading(page = document) {
  page.querySelectorAll("[data-top-heading]").forEach((heading) => {
    const text = heading.querySelector("[data-top-heading-text]");
    heading._originalText = text.textContent;
    gsap.set(heading, { width: 0 });
    gsap.set(text, { autoAlpha: 0 });
  });
}

// Phase 2: create the scroll-triggered animation once the page is in natural flow.
export function initTopHeading(page = document) {
  page.querySelectorAll("[data-top-heading]").forEach((heading) => {
    const originalText = heading._originalText;
    if (!originalText) return;
    const text = heading.querySelector("[data-top-heading-text]");
    const repeat = heading.dataset.topHeading === "repeat";

    // Clear the inline width so GSAP can re-measure the natural width below.
    gsap.set(heading, { clearProps: "width" });

    const tl = gsap.timeline({
      scrollTrigger: { trigger: heading, start: "top 80%" },
      onComplete: repeat
        ? () => startRescramble(heading, text, originalText)
        : null,
    });

    tl.from(heading, {
      width: 0,
      transformOrigin: "center center",
      clearProps: "width",
    })
      .to(text, { autoAlpha: 1, duration: 0.2 }, "<50%")
      .to(
        text,
        {
          scrambleText: {
            text: originalText,
            chars: "upperCase",
            revealDelay: 0.4,
            speed: 0.6,
          },
          duration: 1,
        },
        "<",
      );
  });
}

// data-top-heading="repeat": after the intro, re-scramble the same text every
// few seconds. The pill keeps its width; only the letters move.
function startRescramble(heading, text, originalText) {
  // Lock the current width so scrambled characters can't make the pill wobble.
  gsap.set(heading, { width: heading.offsetWidth });
  gsap.set(text, { whiteSpace: "nowrap" });

  const loop = gsap
    .timeline({ repeat: -1, repeatDelay: 2, delay: 2 })
    .to(text, {
      scrambleText: {
        text: originalText,
        chars: "upperCase",
        revealDelay: 0.2,
        speed: 0.8,
      },
      duration: 0.8,
      ease: "none",
    });

  registerCleanup(() => loop.kill());
}
