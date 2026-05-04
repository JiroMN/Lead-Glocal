import { setEcosystemGraphState } from "./ecosystemGraph";

export function initPrepServices(next) {
  // Top Roles
  const subTexts = next.querySelectorAll("[data-services-role-top-subtext]");
  gsap.set(subTexts, {
    yPercent: 101,
  });

  // Headings
  const absoluteHeadings = next.querySelectorAll(
    "[data-services-heading-absolute]",
  );
  gsap.set(absoluteHeadings, {
    yPercent: 101,
  });
  // Descriptions
  const absoluteDescriptions = next.querySelectorAll(
    "[data-services-description-absolute]",
  );
  gsap.set(absoluteDescriptions, {
    yPercent: 101,
  });
}

export function initServices() {
  const AUTOPLAY_DURATION = 5000;

  const section = document.querySelector("[data-services]");
  if (!section) return;

  const loopOrder = ["architect", "builder", "manager"];
  let currentRole = null;
  // The active tab's progress tween IS the autoplay timer — when it
  // completes it advances to the next role. A manual tab click pauses it,
  // so the cycle freezes on the user's choice until they click elsewhere.
  let activeProgressTween = null;
  let isPaused = false;

  function changeRole(role) {
    if (role === currentRole) return;
    currentRole = role;
    animateTabs(role);
    animateHeading(role);
    animateDescription(role);
    setEcosystemGraphState(role);
  }

  function advanceRole() {
    const idx = loopOrder.indexOf(currentRole);
    changeRole(loopOrder[(idx + 1) % loopOrder.length]);
  }

  function animateTabs(role) {
    section.querySelectorAll("[data-services-role-top]").forEach((tab) => {
      const isActive = tab.dataset.servicesRoleTop === role;
      const title = tab.querySelector("[data-services-role-top-heading]");
      const subtext = tab.querySelector("[data-services-role-top-subtext]");
      const progress = tab.querySelector("[data-services-role-top-progress]");

      if (isPaused && isActive) {
        // User explicitly picked this tab — show the bar fully filled so the
        // "selected" signal is unambiguous. No live tween while paused.
        gsap.set(progress, {
          scaleX: 1,
          transformOrigin: "left",
          overwrite: true,
        });
        activeProgressTween = null;
      } else {
        const progTween = gsap.fromTo(
          progress,
          { scaleX: 0 },
          {
            scaleX: isActive ? 1 : 0,
            transformOrigin: "left",
            ease: "none",
            duration: AUTOPLAY_DURATION / 1000,
            overwrite: "auto", // kill the previous progress tween cleanly
            onComplete: isActive ? advanceRole : undefined,
          },
        );
        if (isActive) activeProgressTween = progTween;
      }

      let tl = gsap.timeline();
      tl.to(title, {
        yPercent: isActive ? -101 : 0,
      }).to(
        subtext,
        {
          yPercent: isActive ? 0 : 101,
        },
        "<",
      );
    });
  }

  function animateHeading(role) {
    section.querySelectorAll("[data-services-heading]").forEach((heading) => {
      const isActive = heading.dataset.servicesHeading === role;

      gsap
        .timeline()
        .to(heading, { yPercent: isActive ? 0 : -101 })
        .set(heading, { yPercent: isActive ? 0 : 101 });
    });
  }
  function animateDescription(role) {
    section
      .querySelectorAll("[data-services-description]")
      .forEach((description) => {
        const isActive = description.dataset.servicesDescription === role;

        gsap
          .timeline()
          .to(description, { yPercent: isActive ? 0 : -150 })
          .set(description, { yPercent: isActive ? 0 : 150 });
      });
  }

  // Manual tab click = stop the cycle on the chosen role. Once paused, it
  // stays paused — there's no resume button anymore. animateTabs sees
  // isPaused=true and snaps the active progress bar to scaleX:1 to make the
  // selection unambiguous.
  section.querySelectorAll("[data-services-role-top]").forEach((tab) => {
    tab.addEventListener("click", () => {
      const role = tab.dataset.servicesRoleTop;
      if (!role) return;
      const wasAlreadyActive = role === currentRole;
      isPaused = true;
      activeProgressTween?.pause();

      if (wasAlreadyActive) {
        // changeRole would early-return — handle the snap-to-1 manually.
        const progress = tab.querySelector("[data-services-role-top-progress]");
        gsap.set(progress, {
          scaleX: 1,
          transformOrigin: "left",
          overwrite: true,
        });
        activeProgressTween = null;
      } else {
        changeRole(role);
      }
    });
  });

  // Kick off when the section scrolls into view — changeRole creates the
  // first activeProgressTween, which auto-plays. When it completes,
  // onComplete (advanceRole) cycles to the next role, ad infinitum until
  // the user clicks a tab.
  ScrollTrigger.create({
    trigger: section,
    start: "top bottom",
    once: true,
    onEnter: () => changeRole("architect"),
  });
}
