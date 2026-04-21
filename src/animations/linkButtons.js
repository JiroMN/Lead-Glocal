export function initLinkButtons() {
  const buttons = document.querySelectorAll("[data-link-button]");

  buttons.forEach((button) => {
    const clip = button.querySelector(".link-button__clip");

    button.addEventListener("mouseenter", () => {
      let tl = gsap.timeline();

      tl.fromTo(
        clip,
        {
          clipPath: "inset(0% 100% 0% 0%)",
        },
        {
          clipPath: "inset(0% 0% 0% 0%)",
        },
      );
    });
    button.addEventListener("mouseleave", () => {
      let tl = gsap.timeline();

      tl.to(clip, {
        clipPath: "inset(0% 0% 0% 100%)",
      });
    });
  });
}
