export function initCTA() {
  document.querySelectorAll("[data-call-to-action]").forEach((cta) => {
    const avatar = cta.querySelector("[data-avatar]");
    const heading = cta.querySelector("[data-cta-heading]");
    const icon = cta.querySelector("[data-cta-icon]");

    // Animate the icon on hover
    heading.addEventListener("mouseenter", () =>
      gsap.to(icon, { x: "0.5em", duration: 0.6 }),
    );
    heading.addEventListener("mouseleave", () =>
      gsap.to(icon, { x: 0, duration: 0.6 }),
    );

    // Avatar parallax — drifts gently in the same direction as the cursor
    // (not inverted). quickTo eases toward the target each frame, so it
    // feels soft even when the mouse moves fast. Skip if no avatar.
    if (avatar) {
      const STRENGTH = 12; // max px travel from center per axis
      const avX = gsap.quickTo(avatar, "x", { duration: 0.6 });
      const avY = gsap.quickTo(avatar, "y", { duration: 0.6 });

      cta.addEventListener("mousemove", (e) => {
        const rect = cta.getBoundingClientRect();
        // Normalize cursor pos to -1..1, center = 0.
        const xNorm = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
        const yNorm = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
        avX(xNorm * STRENGTH);
        avY(yNorm * STRENGTH);
      });

      cta.addEventListener("mouseleave", () => {
        avX(0);
        avY(0);
      });
    }
  });
}
