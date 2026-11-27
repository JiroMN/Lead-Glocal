// The theme list in [data-ecosystems]. Each [data-ecosystem-theme="slug"]
// holds a [data-ecosystem-theme-bg] and a [data-ecosystem-theme-icon].
//
// Nothing selected: every background is fully shown at the opacity it has in
// Webflow (e.g. 50%). One selected: every background wipes away, and the one
// of the selected theme wipes in from left to right at full opacity. A click
// on the selected theme goes back to nothing selected.
//
// The selection lives on the section as [data-ecosystem-selected-theme],
// which the map listens to.
const OPEN = "inset(0% 0% 0% 0%)";
const CLOSED = "inset(0% 100% 0% 0%)";

export function initEcosystemThemes(next = document) {
  const section = next.querySelector("[data-ecosystems]");
  if (!section) return;
  const selectors = [...section.querySelectorAll("[data-ecosystem-theme]")];
  if (!selectors.length) return;

  const backgrounds = section.querySelectorAll("[data-ecosystem-theme-bg]");
  const icons = section.querySelectorAll("[data-ecosystem-theme-icon]");
  const partOf = (selector, name) =>
    selector?.querySelector(`[data-ecosystem-theme-${name}]`) || null;

  // The opacity from Webflow is the one for "nothing selected".
  const restOpacity = backgrounds.length
    ? parseFloat(getComputedStyle(backgrounds[0]).opacity)
    : 1;
  gsap.set(backgrounds, { clipPath: OPEN });

  let timeline = null;

  function selectTheme(theme) {
    const current = section.getAttribute("data-ecosystem-selected-theme") || "";
    if (current === theme) theme = ""; // a second click deselects
    section.setAttribute("data-ecosystem-selected-theme", theme);

    const selected = selectors.find(
      (selector) => selector.getAttribute("data-ecosystem-theme") === theme,
    );
    selectors.forEach((selector) =>
      selector.setAttribute("aria-pressed", String(selector === selected)),
    );

    timeline?.kill();
    timeline = gsap.timeline({
      defaults: { duration: 0.4, ease: "power2.inOut", overwrite: "auto" },
    });

    if (!selected) {
      // Back to everything: all backgrounds in again, at the Webflow opacity.
      timeline
        .to(backgrounds, { clipPath: OPEN, opacity: restOpacity }, 0)
        .to(icons, { autoAlpha: 1 }, 0);
      return;
    }

    const background = partOf(selected, "bg");
    const icon = partOf(selected, "icon");
    const others = [...backgrounds].filter((item) => item !== background);
    const otherIcons = [...icons].filter((item) => item !== icon);

    timeline
      .to(others, { clipPath: CLOSED }, 0)
      .to(otherIcons, { autoAlpha: 0 }, 0);
    if (background)
      timeline.fromTo(
        background,
        { clipPath: CLOSED, opacity: 1 },
        { clipPath: OPEN, opacity: 1 },
        0,
      );
    if (icon) timeline.to(icon, { autoAlpha: 1 }, 0);
  }

  selectors.forEach((selector) =>
    selector.addEventListener("click", () =>
      selectTheme(selector.getAttribute("data-ecosystem-theme")),
    ),
  );
}
