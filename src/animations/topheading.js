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

    // Clear the inline width so GSAP can re-measure the natural width below.
    gsap.set(heading, { clearProps: "width" });

    gsap
      .timeline({
        scrollTrigger: { trigger: heading, start: "top 80%" },
      })
      .from(heading, {
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
