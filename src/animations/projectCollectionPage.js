import { setEcosystemGraphState } from "./ecosystemGraph";
import { animateScrambleText } from "../utils/animationHelpers";
import { debounce, parseWebflowDate } from "../utils/helpers";

// ─────────────────────────────────────────────────────────────────────────────
// Transition-aware load-in
//
// The project hero animates differently depending on how the user arrived:
//
//   • Via a project-card click → the flip-transition (see index.js) grows
//     the clicked thumbnail into the hero image and animates the rest of
//     the page in via [data-project-transition-reveal]. The independent
//     load-in stays out of the way.
//
//   • From anywhere else (direct URL, default transition) → the hero plays
//     its independent load-in: heading + description slide up out of masks,
//     image clip-path reveals, reveal-content fades in.
//
// `useIndependentLoadIn` is the toggle. It is decided in prep based on the
// from/to namespaces of the Barba transition.
//
// FLIP_FROM lists the namespaces from which a project-card click should
// trigger the flip-transition. It mirrors the `from.namespace` array on
// the "project-to-detail" transition in index.js — both lists must match
// for the flip to fire correctly from every entry-point page.
// ─────────────────────────────────────────────────────────────────────────────

const FLIP_FROM = ["projects", "home"];
const PROJECT_DETAILS_NS = "project-details";

let useIndependentLoadIn = true;

export function prepProjectInDepth(current, next) {
  const fromNS = current?.dataset?.barbaNamespace;
  const toNS = next?.dataset?.barbaNamespace;
  const isFlipTransition =
    FLIP_FROM.includes(fromNS) && toNS === PROJECT_DETAILS_NS;
  useIndependentLoadIn = !isFlipTransition;

  // Independent load-in starting states — splittext masks + clipped image.
  // Skipped on flip-transition (which has its own reveal).
  if (useIndependentLoadIn) {
    const hero = next.querySelector("[data-project-hero]");
    const heading = hero.querySelector("[data-project-heading]");
    const description = hero.querySelector("[data-project-description]");
    const imageWrap = hero.querySelector("[data-project-image-overlay]");
    const vimeoThumbnail = hero.querySelector("[data-vimeo-player-thumbnail]");

    const headingSplit = SplitText.create(heading, {
      type: "lines",
      mask: "lines",
      autoSplit: true,
      linesClass: "__padded-mask",
    });
    const descriptionSplit = SplitText.create(description, {
      type: "lines",
      mask: "lines",
      autoSplit: true,
    });

    gsap.set([headingSplit.lines, descriptionSplit.lines], { yPercent: 101 });
    gsap.set(imageWrap, { clipPath: "inset(100% 0 0 0)" });
    if (vimeoThumbnail) {
      gsap.set(vimeoThumbnail, {
        scale: 0.9,
        autoAlpha: 0,
      });
    }
  }

  // Reveal-content starting state — applies in both paths. The flip
  // enter animation fades these in; the independent path does it in
  // initPojectInDepth.
  const revealContent = next.querySelectorAll(
    "[data-project-transition-reveal]",
  );
  gsap.set(revealContent, { autoAlpha: 0 });

  // Project Roles — always prepped so the first paint is "only architect
  // visible", regardless of transition path. Each [data-project-role-value]
  // is its own overflow:hidden mask stacked in the same cell; the active
  // role's [data-project-role-heading] sits at yPercent 0 (visible) and all
  // others at 101 (parked below their mask). Explicit on ALL three — not
  // just the non-architect ones — so there's zero ambiguity about which
  // heading shows on first paint and nothing can end up clipped over
  // another. The scroll-driven trigger relies on this clean start state.
  const roles = next.querySelector("[data-project-roles]");
  if (roles) {
    roles.querySelectorAll("[data-project-role-value]").forEach((mask) => {
      const heading = mask.querySelector("[data-project-role-heading]");
      if (!heading) return;
      gsap.set(heading, {
        yPercent: mask.dataset.projectRoleValue === ROLES[0] ? 0 : 101,
      });
    });
  }
}

export function initPojectInDepth() {
  let loadInTl = gsap.timeline({ delay: 0.7 });

  if (useIndependentLoadIn) {
    // Load in Hero
    const hero = document.querySelector("[data-project-hero]");
    const heading = hero.querySelector("[data-project-heading]");
    const description = hero.querySelector("[data-project-description]");
    const imageWrap = hero.querySelector("[data-project-image-overlay]");
    const vimeoThumbnail = hero.querySelector("[data-vimeo-player-thumbnail]");

    const headingLines = hero.querySelectorAll("[data-project-heading] *");
    const descriptionLines = hero.querySelectorAll(
      "[data-project-description] *",
    );

    loadInTl
      .to([...headingLines, ...descriptionLines], {
        yPercent: 0,
        stagger: 0.05,
      })
      .to(
        imageWrap,
        {
          clipPath: "inset(0% 0 0 0)",
          duration: 0.8,
        },
        "<50%",
      )
      .add(() => {
        if (vimeoThumbnail) {
          gsap.to(vimeoThumbnail, {
            scale: 1,
            autoAlpha: 1,
            transformOrigin: "right bottom",
          });
        }
      }, "<50%");
  }

  const revealContent = document.querySelectorAll(
    "[data-project-transition-reveal]",
  );
  loadInTl.to(revealContent, {
    autoAlpha: 1,
  });

  // Set "Meer over dit project" on target _blank
  document.querySelector("[data-project-challenge-action-wrap] > a").target =
    "_blank";
}

// ─────────────────────────────────────────────────────────────────────────────
// Project Roles — pinned scroll-driven section that walks through the three
// role states (architect → builder → manager). Mirrors services.js but with
// a scroll-pinned trigger instead of an autoplay tween.
// ─────────────────────────────────────────────────────────────────────────────

const ROLES = ["architect", "builder", "manager"];
const refs = {};

// Split a comma-separated data-attribute into a role→string map, indexed
// by the ROLES array order.
function attrToRoleMap(el, attrName) {
  const raw = el?.getAttribute(attrName) || "";
  const parts = raw.split(",").map((s) => s.trim());
  const map = {};
  ROLES.forEach((role, i) => {
    map[role] = parts[i] || "";
  });
  return map;
}

export function initProjectRoles() {
  const section = document.querySelector("[data-project-roles]");
  if (!section) return;

  refs.section = section;

  // Project roles: wrapper carries the attribute, child has the text. Walk
  // inward to find the scramble target.
  const roleTitleWrap = section.querySelector(
    "[data-project-roles-top-heading]",
  );
  refs.roleTitle = roleTitleWrap?.querySelector(
    "[data-project-roles-top-heading-text]",
  );
  refs.roleTitleCopy = attrToRoleMap(
    roleTitleWrap,
    "data-project-roles-top-heading",
  );

  // Ecosystem graph top heading: attribute and text live on the same
  // element — no wrapper to walk through.
  refs.graphHeading = section.querySelector(
    "[data-ecosystem-graph-top-heading]",
  );
  refs.graphHeadingCopy = attrToRoleMap(
    refs.graphHeading,
    "data-ecosystem-graph-top-heading",
  );

  refs.activeRole = ROLES[0];
  section.dataset.activeRole = refs.activeRole;

  // Belt + suspenders: explicitly position every role-value heading at
  // init time. Prep does this too, but if a Barba re-entry replaces the
  // DOM and prep timing gets disrupted, this ensures the first paint is
  // always "only architect visible".
  section.querySelectorAll("[data-project-role-value]").forEach((mask) => {
    const heading = mask.querySelector("[data-project-role-heading]");
    if (!heading) return;
    gsap.set(heading, {
      yPercent: mask.dataset.projectRoleValue === ROLES[0] ? 0 : 101,
    });
  });
}

export function setProjectRolesState(role) {
  if (!refs.section || refs.activeRole === role) return;
  const prevRole = refs.activeRole;
  refs.activeRole = role;
  refs.section.dataset.activeRole = role;

  setEcosystemGraphState(role);
  animateGraphTopHeading(role);
  animateRoleTitle(role);
  animateRoleValue(role, prevRole);
}

// ─────────────────────────────────────────────────────────────────────────────
// Scroll-driven step section.
//
// Native scroll only — no gesture interception, no preventDefault, no lock.
// The section is pinned over a long scroll distance; ScrollTrigger merely
// READS scroll progress and maps it to a discrete step (architect → builder →
// manager). When the step changes, setProjectRolesState plays its own timed
// tween — the animation itself is NOT scrubbed, only WHICH state is active is
// scroll-driven. This works identically on desktop and touch because nothing
// is intercepted: the browser's native momentum is free to do its thing, we
// just observe where it lands. `snap` settles the scroll onto a clean state
// (progress 0 / 0.5 / 1) when the user stops, so you never rest mid-transition.
//
// Relies on prep + initProjectRoles having stacked the role-value headings
// (architect at 0, others at 101) so the first paint — at progress 0 — is a
// clean "architect only" state with nothing clipped.
// ─────────────────────────────────────────────────────────────────────────────

let scrollTriggerInstance = null;
let currentIndex = 0; // active step (0=architect, 1=builder, 2=manager)

export function initProjectRolesScrollTrigger() {
  if (!refs.section || typeof ScrollTrigger === "undefined") return;

  if (scrollTriggerInstance) {
    scrollTriggerInstance.kill();
  }
  currentIndex = 0;

  const lastStep = ROLES.length - 1; // 2 for three roles

  scrollTriggerInstance = ScrollTrigger.create({
    trigger: refs.section,
    start: "top top",
    end: "+=300%", // scroll distance across the three steps; tune freely
    pin: true,
    // The parent <main> is `display: flex`. GSAP's default pinSpacing uses
    // `padding-bottom` on the pin-spacer to hold the layout open during the
    // pin — but in a flex container, padding on a flex item doesn't push
    // siblings the way it does in normal flow, so GSAP effectively skips
    // the spacing and the next section overlaps the still-pinned trigger.
    // `pinSpacing: "margin"` forces GSAP to use margin-bottom instead,
    // which flex layouts DO respect.
    pinSpacing: "margin",
    anticipatePin: 1,
    // Settle onto the nearest step (progress 0, 0.5, 1) when scrolling stops.
    // `directional` only snaps the way the user was already heading, so it
    // feels like a natural assist rather than fighting the scroll.
    snap: {
      snapTo: 1 / lastStep,
      duration: { min: 0.15, max: 0.4 },
      ease: "power1.inOut",
      directional: true,
    },
    onUpdate(self) {
      // Map continuous progress → nearest discrete step. setProjectRolesState
      // guards same-role calls, so firing this every frame is free — it only
      // animates when the step genuinely changes. A fast flick that skips a
      // step (architect → manager) is handled by animateRoleValue's fromTo +
      // overwrite, so headings never end up clipped over one another.
      const step = Math.round(self.progress * lastStep);
      if (step !== currentIndex) {
        currentIndex = step;
        setProjectRolesState(ROLES[step]);
      }
    },
  });
}

function animateRoleTitle(role) {
  animateScrambleText(refs.roleTitle, refs.roleTitleCopy[role]);
}

function animateGraphTopHeading(role) {
  animateScrambleText(refs.graphHeading, refs.graphHeadingCopy[role]);
}

function animateRoleValue(role, prevRole) {
  // Two labels:
  //   "out" — previous heading slides UP out of view (0 → -101)
  //   "in"  — new heading slides UP into view, FROM 101 (below) → 0
  //
  // `fromTo` on the new heading forces yPercent:101 as the start state,
  // regardless of where it was last left. So scrolling backward always
  // looks identical to scrolling forward — the active role always rises
  // from below.
  const DURATION = 0.9;
  const tl = gsap
    .timeline()
    .addLabel("out", 0)
    .addLabel("in", `out+=${DURATION * 0.5}`);

  function getHeading(r) {
    const mask = refs.section.querySelector(`[data-project-role-value="${r}"]`);
    return mask?.querySelector("[data-project-role-heading]");
  }

  if (prevRole) {
    const prevHeading = getHeading(prevRole);
    if (prevHeading) {
      tl.to(
        prevHeading,
        { yPercent: -101, duration: DURATION, overwrite: "auto" },
        "out",
      );
    }
  }

  const activeHeading = getHeading(role);
  if (activeHeading) {
    tl.fromTo(
      activeHeading,
      { yPercent: 101 },
      { yPercent: 0, duration: DURATION, overwrite: "auto" },
      "in",
    );
  }
}

export function initImagesOnPathScroll() {
  const wrap = document.querySelector('[data-motionpath="wrap"]');
  if (!wrap) return;
  const path = wrap.querySelector('[data-motionpath="path"]');
  const items = wrap.querySelectorAll('[data-motionpath="item"]');
  const itemDetails = wrap.querySelectorAll('[data-motionpath="item-details"]');

  // Set z-index on items, to make sure the 1st item is on top
  gsap.set(items, {
    zIndex: (i, target, all) => all.length - i,
  });

  // if there’s an old timeline, grab its progress, reset it, then kill it
  const oldTl = initImagesOnPathScroll.tl;
  let progress = 0;

  if (oldTl) {
    progress = oldTl.progress();
    // Kill the associated ScrollTrigger too — timeline.kill() leaves it
    // alive. Without this, every resize stacks another pinned ScrollTrigger
    // on the same wrap (doubling pin-spacing and corrupting scroll
    // positions), which is exactly what makes resize misbehave.
    oldTl.scrollTrigger?.kill();
    oldTl.progress(0).kill();
  }

  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: wrap,
      start: "top top",
      end: `+=${items.length * 125}%`,
      scrub: true,
      pin: true,
      anticipatePin: 1,
    },
    defaults: {
      ease: "none",
      stagger: 0.3, // Define the space between each item
    },
  });

  tl.to(items, {
    duration: 1,
    motionPath: { path, align: path, curviness: 2, alignOrigin: [0.5, 0.5] },
  })
    .fromTo(items, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.1 }, 0)
    .fromTo(
      items,
      { filter: "blur(1.5em)" },
      { filter: "blur(0em)", duration: 0.5 },
      0,
    )
    .fromTo(
      itemDetails,
      { autoAlpha: 0, yPercent: 25 },
      { autoAlpha: 1, yPercent: 0, duration: 0.1 },
      0.4,
    )
    .fromTo(items, { scale: 0.4 }, { scale: 1, duration: 0.65 }, 0)
    .to(items, { autoAlpha: 0, filter: "blur(1em)", duration: 0.15 }, 0.85)
    .to(itemDetails, { autoAlpha: 0, duration: 0.05 }, 0.9);

  // jump back to previous spot and refresh
  tl.progress(progress);
  ScrollTrigger.refresh();

  // store it on the function so we can grab it next time
  initImagesOnPathScroll.tl = tl;

  // on first run bind a single debounced resize listener
  if (!initImagesOnPathScroll.resizeHandler) {
    initImagesOnPathScroll.resizeHandler = debounce(() => {
      initImagesOnPathScroll();
    }, 200);
    window.addEventListener("resize", initImagesOnPathScroll.resizeHandler);
  }

  return tl;
}

// Effective sort date for a project = its manual start date if set,
// otherwise Webflow's "Created on". The start date is the editorial
// "when did this project run" value and is the primary key; created-on
// is only a fallback so ordering never collapses when many items share
// the same import timestamp (which is exactly what breaks when several
// projects are created in one batch).
function effectiveDate(startStr, createdStr) {
  return parseWebflowDate(startStr) || parseWebflowDate(createdStr);
}

export function initNextProject() {
  const section = document.querySelector("[data-next-project]");
  if (!section) return;
  const nextProjectLink = section.querySelector("[data-next-project-link]");
  const nextProjectTitle = section.querySelector("[data-next-project-title]");
  const nextProjectImage = section.querySelector("[data-next-project-image]");

  const currentDate = effectiveDate(
    section.dataset.currentProjectStartDate,
    section.dataset.currentProjectCreationDate,
  );

  // Hover Animation
  gsap.set(nextProjectImage, {
    yPercent: 30,
  });

  nextProjectLink.addEventListener("mouseenter", () => {
    gsap.to(nextProjectImage, {
      yPercent: 15,
    });
  });
  nextProjectLink.addEventListener("mouseleave", () => {
    gsap.to(nextProjectImage, {
      yPercent: 30,
    });
  });

  // Collect candidates. The current project is already excluded from this
  // hidden collection list in Webflow, so everything here is a valid "next".
  const projects = [];
  document.querySelectorAll("[data-project-item]").forEach((project) => {
    const date = effectiveDate(
      project.dataset.projectStartDate,
      project.dataset.projectCreationDate,
    );
    if (!date) return;

    const imageEl = project.querySelector("[data-project-image]");
    projects.push({
      title: project.dataset.projectTitle,
      slug: project.dataset.projectSlug,
      date,
      imageSrc: imageEl?.src,
      imageSrcset: imageEl?.srcset,
    });
  });
  if (!projects.length) return;

  // Newest → oldest, with slug as a deterministic tiebreaker so equal dates
  // never flip-flop between page loads.
  projects.sort((a, b) => b.date - a.date || a.slug.localeCompare(b.slug));

  // "Next project" = the next-older one relative to the current project.
  // After the descending sort, the first project strictly older than the
  // current date IS the immediately-older one. If none exists (current is
  // the oldest, or its date is unknown), cycle back to the newest.
  const next =
    (currentDate && projects.find((p) => p.date < currentDate)) || projects[0];
  if (!next) return;

  nextProjectLink.setAttribute("href", next.slug);
  if (nextProjectTitle) nextProjectTitle.textContent = next.title;
  if (nextProjectImage && next.imageSrc) {
    // Always assign srcset — even when empty. A responsive <img> prefers
    // srcset over src, so leaving a stale srcset in place keeps the PREVIOUS
    // project's image on screen even though src was updated. Clearing it
    // (set to "") forces the browser to fall back to the freshly-set src.
    nextProjectImage.srcset = next.imageSrcset || "";
    nextProjectImage.src = next.imageSrc;
  }
}
