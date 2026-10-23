export function initLinkButtons() {
  const buttons = document.querySelectorAll("[data-link-button]");

  buttons.forEach((button) => {
    const clip = button.querySelector("[data-link-button-clip]");

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

export function initUnderlineButton() {
  const buttons = document.querySelectorAll("[data-underline-button]");

  buttons.forEach((button) => {
    const underline = button.querySelector("[data-underline-button-line]");

    button.addEventListener("mouseenter", () => {
      let tl = gsap.timeline();

      tl.to(underline, {
        scaleX: 0,
        transformOrigin: "right",
        duration: 0.4,
      }).to(underline, {
        scaleX: 1,
        transformOrigin: "left",
      });
    });
  });
}
