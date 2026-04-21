export function initSocietyChallenge() {
  const section = document.querySelector("[data-society-challenge]");
  const heading = section.querySelector("[data-society-challenge-heading]");
  const text = section.querySelector("[data-society-challenge-subtext]");

  let splitHeading = SplitText.create(heading, {
    type: "lines",
    mask: "lines",
  });
  let splitSubtext = SplitText.create(text, {
    type: "lines",
    mask: "lines",
  });

  let tl = gsap.timeline({
    scrollTrigger: {
      trigger: section,
      start: "top 70%",
    },
    delay: 0.2,
  });

  tl.from(splitHeading.lines, {
    yPercent: 101,
    stagger: 0.05,
  }).from(
    splitSubtext.lines,
    {
      yPercent: 101,
      stagger: 0.05,
    },
    "<0.1",
  );
}
