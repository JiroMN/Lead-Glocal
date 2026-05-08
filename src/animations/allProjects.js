import { parseWebflowDate } from "../utils/helpers";

// Resolve which grid items match a given filter target. An empty target
// or "all" means "show everything"; anything else matches against the
// inner card-wrap's data-filter-name.
function resolveFilteredItems(target, gridItems) {
  if (!target || target === "all") return gridItems;
  return gridItems.filter((item) => {
    const wrap = item.querySelector("[data-project-card-wrap]");
    return target === wrap?.dataset.filterName;
  });
}

// Runs in beforeEnter — merges archive into the main grid, sorts by tier
// + date, applies the initial filter (whichever button Webflow marks
// active by default), and writes the count. All synchronous so the layout
// is settled before the page enter animation runs.
export function prepAllProjectsPage(next) {
  const hero = next.querySelector("[data-projects-hero]");
  const resultsCount = hero?.querySelector("[data-total-projects-count]");
  const projectCollection = next.querySelector("[data-projects-grid]");
  const archiveCollection = next.querySelector("[data-archived-projects-grid]");
  const filterGroup = next.querySelector("[data-filter-group]");

  // Merge archive items into the projects grid, then sort by:
  //   Tier 1 — priority featured (Lead Glocal's top picks)
  //   Tier 2 — featured on homepage
  //   Tier 3 — everything else
  // Within each tier: creation date, newest first.
  if (projectCollection && archiveCollection) {
    const archiveItems = archiveCollection.querySelectorAll(
      "[data-projects-grid-item]",
    );
    archiveItems.forEach((item) => projectCollection.appendChild(item));

    function tier(el) {
      if (el.querySelector("[data-featured-priority]")) return 0;
      if (el.querySelector("[data-featured]")) return 1;
      return 2;
    }

    const sorted = [
      ...projectCollection.querySelectorAll("[data-projects-grid-item]"),
    ].sort((a, b) => {
      const ta = tier(a);
      const tb = tier(b);
      if (ta !== tb) return ta - tb;

      const da = parseWebflowDate(a.dataset.creationDate);
      const db = parseWebflowDate(b.dataset.creationDate);
      if (!da) return 1;
      if (!db) return -1;
      return db - da;
    });
    sorted.forEach((item) => projectCollection.appendChild(item));
  }

  if (!projectCollection) return;

  // Apply the initial filter instantly (no animation) so the user lands
  // on the correct subset from the very first paint.
  const activeBtn = filterGroup?.querySelector("[data-filter-status='active']");
  const initialTarget = activeBtn?.dataset.filterTarget || "all";
  const gridItems = [
    ...projectCollection.querySelectorAll("[data-projects-grid-item]"),
  ];
  const initiallyVisible = resolveFilteredItems(initialTarget, gridItems);

  gridItems.forEach((item) => {
    if (!initiallyVisible.includes(item)) item.style.display = "none";
  });

  // Live region + initial count. Format: "X van Y".
  if (resultsCount) {
    resultsCount.setAttribute("aria-live", "polite");
    resultsCount.textContent = `${initiallyVisible.length} van ${gridItems.length}`;
  }

  // Sync aria-pressed on the filter buttons with their data-filter-status.
  filterGroup?.querySelectorAll("[data-filter-target]").forEach((b) => {
    const isActive = b.dataset.filterStatus === "active";
    b.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
}

export function initAllProjectsPage() {
  initAllProjectsHero();
}

function initAllProjectsHero() {
  const hero = document.querySelector("[data-projects-hero]");
  const resultsCount = hero?.querySelector("[data-total-projects-count]");
  const filterGroup = document.querySelector("[data-filter-group]");
  const filterButtons = document.querySelectorAll("[data-filter-target]");

  function getCurrentFilter() {
    return filterGroup.querySelector("[data-filter-status='active']").dataset
      .filterTarget;
  }

  function animateTargetedItems(target) {
    const gridItems = [
      ...document.querySelectorAll("[data-projects-grid-item]"),
    ];
    const filteredItems = resolveFilteredItems(target, gridItems);

    // Update counter immediately so the click feels responsive (and the
    // aria-live announcement fires alongside the visual change).
    if (resultsCount) {
      resultsCount.textContent = `${filteredItems.length} van ${gridItems.length}`;
    }

    let tl = gsap.timeline();
    tl
      // OUT — top-to-bottom: top inset groeit, top verdwijnt eerst.
      .to(gridItems, {
        clipPath: "inset(100% 0 0 0)",
        stagger: 0.05,
      })
      // Hele grid-item uit de flow → grid reflowt, geen lege cellen.
      .set(gridItems, {
        display: "none",
      })
      // Alleen filtered items terug in de flow + initial-clipped state.
      .set(filteredItems, {
        display: "flex",
        clipPath: "inset(0 0 100% 0)",
      })
      // Page height changed — let Lenis (and ScrollTrigger) recalculate
      // before the IN animation runs.
      .call(() => {
        window.lenis?.resize?.();
        if (typeof ScrollTrigger !== "undefined") ScrollTrigger.refresh();
      })
      // IN — top-to-bottom: bottom inset schrinkt, top verschijnt eerst.
      .to(filteredItems, {
        clipPath: "inset(0% 0% 0% 0%)",
        stagger: 0.05,
      });
  }

  function setFilter(target = "all") {
    if (getCurrentFilter() === target) return;

    filterButtons.forEach((b) => {
      const isActive = b.dataset.filterTarget === target;
      b.dataset.filterStatus = isActive ? "active" : "not-active";
      b.setAttribute("aria-pressed", isActive ? "true" : "false");
    });

    animateTargetedItems(target);
  }

  filterButtons.forEach((b) => {
    const target = b.dataset.filterTarget;
    b.addEventListener("click", () => setFilter(target));
  });
}
