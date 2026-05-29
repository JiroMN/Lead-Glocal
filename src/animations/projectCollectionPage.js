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
      linesClass: "__padded-mask",
    });
    const descriptionSplit = SplitText.create(description, {
      type: "lines",
      mask: "lines",
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
  // visible", regardless of transition path. The [data-project-role-value]
  // is the mask (overflow:hidden) and [data-project-role-heading] is the
  // text inside it that we slide.
  const roles = next.querySelector("[data-project-roles]");
  if (roles) {
    roles.querySelectorAll("[data-project-role-value]").forEach((mask) => {
      const heading = mask.querySelector("[data-project-role-heading]");
      if (!heading) return;
      if (mask.dataset.projectRoleValue !== "architect") {
        gsap.set(heading, { yPercent: 101 });
      }
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
// Gesture-driven pinned section.
//
// Strategy:
//   • Pin with a 1-viewport buffer so fast scrolls can't blow past in a
//     single frame.
//   • Capture-phase wheel listener intercepts events BEFORE Lenis can act
//     on them, then preventDefault + stopPropagation to fully neutralize.
//   • Touch + keyboard handled the same way.
//   • Each gesture advances/retreats the state by ONE step, then locks for
//     the duration of the role-value animation. No overlap, no skipping.
//   • At the first/last state, an outward gesture programmatically scrolls
//     past the pin so the user falls through to the next section cleanly.
// ─────────────────────────────────────────────────────────────────────────────

const ANIMATION_LOCK_MS = 1100;
const BURST_END_MS = 250; // wheel quiet (for "real" events) → fresh gesture
const MIN_DELTA_Y = 5; // ignore wheel events smaller than this (inertia tail + resting-finger micro-motion)
const TOUCH_THRESHOLD_PX = 40;

let scrollTriggerInstance = null;
let currentIndex = 0;
let isAnimLocked = false;
let isPinActive = false;
let listenersAttached = false;
let lastWheelTime = 0;
let touchStartY = 0;
let touchConsumed = false; // one step per touch gesture (reset on lift)

function tryStep(direction) {
  if (isAnimLocked || !isPinActive) return;

  const steps = ROLES.length - 1;
  const nextIndex = currentIndex + direction;

  if (nextIndex < 0 || nextIndex > steps) {
    releasePin(direction);
    return;
  }

  currentIndex = nextIndex;
  isAnimLocked = true;
  setProjectRolesState(ROLES[currentIndex]);
  gsap.delayedCall(ANIMATION_LOCK_MS / 1000, () => {
    isAnimLocked = false;
  });
}

function releasePin(direction) {
  const st = scrollTriggerInstance;
  if (!st) return;

  isPinActive = false;
  detachListeners();

  const lenis = window.lenis;
  const targetY = direction > 0 ? st.end + 1 : st.start - 1;

  requestAnimationFrame(() => {
    if (lenis?.scrollTo) {
      // Resume Lenis first — activate() stopped it. Without start() the
      // scrollTo can't run and the page would stay frozen after the pin.
      lenis.start();
      lenis.scrollTo(targetY, { duration: 0.3 });
    } else {
      window.scrollTo({ top: targetY, behavior: "smooth" });
    }
  });
}

function activate() {
  if (isPinActive) return;
  isPinActive = true;

  // Treat the gesture that brought the user INTO the pin as already
  // consumed — they have to start a fresh gesture to advance. Setting
  // lastWheelTime to "now" means subsequent events from the in-progress
  // scroll fall inside the BURST_END_MS window and get ignored.
  lastWheelTime = Date.now();
  touchStartY = -1;
  touchConsumed = false;

  // Hard-freeze the scroll while the pin is active. On desktop the wheel
  // preventDefault already blocks scrolling, but on touch the native (or
  // Lenis) fling needs an explicit stop — otherwise a fast flick carries
  // momentum straight through the pin. Paired with syncTouch:true on Lenis,
  // this freezes the scrollbar fully on mobile too.
  window.lenis?.stop();

  attachListeners();
}

function deactivate() {
  if (!isPinActive) return;
  isPinActive = false;
  detachListeners();
  // Safety net: never leave the scroll frozen if we leave the pin via a
  // path other than releasePin (e.g. a ScrollTrigger refresh/onLeaveBack).
  window.lenis?.start();
}

function onWheel(e) {
  if (!isPinActive) return;
  e.preventDefault();
  e.stopPropagation();

  // Ignore micro-events FIRST, without updating lastWheelTime. These
  // come from two sources we don't want to count:
  //   • Trackpad resting fingers — continuous tiny deltaY noise.
  //   • Inertia tail decaying to ~0 at the end of a hard swipe.
  // Skipping them entirely means they neither trigger a step nor
  // extend the burst window.
  if (Math.abs(e.deltaY) < MIN_DELTA_Y) return;

  // Animation lock blocks during the role transition. Bail BEFORE
  // touching lastWheelTime so the inertia tail of the gesture that
  // triggered the animation can't extend the burst window past the
  // lock release — otherwise the user has to "wiggle" the trackpad
  // to register a fresh gesture.
  if (isAnimLocked) return;

  const now = Date.now();
  const gap = now - lastWheelTime;
  lastWheelTime = now;

  // Burst-end detection: only the first "real" event after a quiet
  // period counts as a fresh gesture. Mid-swipe events get filtered out.
  if (gap < BURST_END_MS) return;

  tryStep(e.deltaY > 0 ? 1 : -1);
}

function onTouchStart(e) {
  if (!isPinActive) return;
  touchStartY = e.touches[0].clientY;
  touchConsumed = false; // fresh gesture → may trigger one step
}

function onTouchMove(e) {
  if (!isPinActive) return;
  e.preventDefault();

  // Mirror the wheel handler: respond DURING the gesture, not on lift.
  // Bail if this is the entering gesture (touchStartY reset to -1 on
  // activate), if we already stepped this gesture, or mid-animation.
  if (touchStartY < 0 || touchConsumed || isAnimLocked) return;

  const deltaY = touchStartY - e.touches[0].clientY;
  if (Math.abs(deltaY) < TOUCH_THRESHOLD_PX) return;

  // One step per touch — locked until the finger lifts (onTouchEnd).
  touchConsumed = true;
  tryStep(deltaY > 0 ? 1 : -1);
}

function onTouchEnd() {
  if (!isPinActive) return;
  // Reset so the next finger-down starts a fresh gesture.
  touchStartY = -1;
  touchConsumed = false;
}

function onKey(e) {
  if (!isPinActive) return;
  const downKeys = ["ArrowDown", "PageDown", " ", "Space"];
  const upKeys = ["ArrowUp", "PageUp"];
  if (downKeys.includes(e.key)) {
    e.preventDefault();
    tryStep(1);
  } else if (upKeys.includes(e.key)) {
    e.preventDefault();
    tryStep(-1);
  }
}

function attachListeners() {
  if (listenersAttached) return;
  listenersAttached = true;
  window.addEventListener("wheel", onWheel, {
    passive: false,
    capture: true,
  });
  window.addEventListener("touchstart", onTouchStart, {
    passive: true,
    capture: true,
  });
  window.addEventListener("touchmove", onTouchMove, {
    passive: false,
    capture: true,
  });
  window.addEventListener("touchend", onTouchEnd, {
    passive: true,
    capture: true,
  });
  window.addEventListener("keydown", onKey);
}

function detachListeners() {
  if (!listenersAttached) return;
  listenersAttached = false;
  window.removeEventListener("wheel", onWheel, { capture: true });
  window.removeEventListener("touchstart", onTouchStart, { capture: true });
  window.removeEventListener("touchmove", onTouchMove, { capture: true });
  window.removeEventListener("touchend", onTouchEnd, { capture: true });
  window.removeEventListener("keydown", onKey);
}

export function initProjectRolesScrollTrigger() {
  if (!refs.section || typeof ScrollTrigger === "undefined") return;

  if (scrollTriggerInstance) {
    scrollTriggerInstance.kill();
    deactivate();
  }
  currentIndex = 0;
  isAnimLocked = false;

  scrollTriggerInstance = ScrollTrigger.create({
    trigger: refs.section,
    start: "center center",
    end: "+=100%",
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
    onEnter: activate,
    onEnterBack: activate,
    onLeave: deactivate,
    onLeaveBack: deactivate,
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
