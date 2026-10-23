export function initHeadingMaskReveal() {
  const headings = document.querySelectorAll("[data-heading-reveal-mask]");

  headings.forEach((heading) => {
    const sectionTrigger = heading.getAttribute("data-heading-reveal-mask");

    let splitHeading = SplitText.create(heading, {
      type: "lines",
      mask: "lines",
    });

    let tl = gsap.timeline({
      scrollTrigger: {
        trigger: sectionTrigger
          ? document.querySelector(`[${sectionTrigger}]`)
          : heading,
        start: sectionTrigger ? "top 70%" : "top 50%",
      },
      delay: 0.2,
    });

    tl.from(splitHeading.lines, {
      yPercent: 101,
      stagger: 0.05,
    });
  });
}
