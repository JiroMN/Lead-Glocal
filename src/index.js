// -----------------------------------------
// OSMO PAGE TRANSITION BOILERPLATE
// -----------------------------------------

import { initEcosystems, initEcosystemCounter } from "./animations/ecosystems";
import { initEcosystemGraphs } from "./animations/ecosystemGraph";
import { initLinkButtons, initUnderlineButton } from "./animations/linkButtons";
import { initScalingNavigation } from "./animations/menu";
import { initHeadingMaskReveal } from "./animations/headingMaskReveal";
import { initTopHeading, prepTopHeading } from "./animations/topheading";
import "./globals.css";
import { getCurrentSectionInView, getVariableValue } from "./utils/helpers";
import { initServices } from "./animations/services";
import {
  initProjectCards,
  initProjectsSlider,
  bindProjectsSliderResize,
} from "./animations/projects";
import { initAvatar } from "./animations/avatar";
import { initCTA } from "./animations/callToAction";
import { initFooter } from "./animations/footer";
import { initCopyValue } from "./utils/initCopyValue";
import {
  initContactPage,
  initContactForm,
  prepContactPage,
} from "./animations/contact";
import {
  initPojectInDepth,
  prepProjectInDepth,
  initProjectRoles,
  initProjectRolesScrollTrigger,
  initImagesOnPathScroll,
  initNextProject,
} from "./animations/projectCollectionPage";

gsap.registerPlugin(CustomEase);

// Loading cursor — shown until barba's first afterEnter completes. Gives
// users immediate feedback that the page is still preparing (mostly for
// the home page's heavy ecosystems canvas init).
document.documentElement.classList.add("is-loading");

history.scrollRestoration = "manual";

let lenis = null;
let nextPage = document;
let onceFunctionsInitialized = false;

const hasLenis = () => typeof window.Lenis !== "undefined";
const hasScrollTrigger = () => typeof window.ScrollTrigger !== "undefined";

const rmMQ = window.matchMedia("(prefers-reduced-motion: reduce)");
let reducedMotion = rmMQ.matches;
rmMQ.addEventListener?.("change", (e) => (reducedMotion = e.matches));
rmMQ.addListener?.((e) => (reducedMotion = e.matches));

const has = (s) => !!nextPage.querySelector(s);

let staggerDefault = 0.05;
let durationDefault = 0.6;

// Dev flag — set to true to skip the page load animation.
const SKIP_LOAD_ANIMATION = true;

CustomEase.create("osmo", "0.625, 0.05, 0, 1");
CustomEase.create("loader", "0.65, 0.01, 0.05, 0.99");
CustomEase.create("energy", "M0,0 C0.32,0.72 0,1 1,1");
gsap.defaults({ ease: "energy", duration: durationDefault });

// -----------------------------------------
// FUNCTION REGISTRY
// -----------------------------------------

function initOnceFunctions() {
  initLenis();
  initScalingNavigation();
  if (onceFunctionsInitialized) return;
  onceFunctionsInitialized = true;

  // Runs once on first load
  // if (has('[data-something]')) initSomething();
}

function initBeforeEnterFunctions(next) {
  nextPage = next || document;

  // Runs before the enter animation — pre-paint from-states so no flash,
  // and heavy setup (like the ecosystems canvas) so the loader waits for it.
  if (has("[data-top-heading]")) prepTopHeading(next);
  if (has("[data-ecosystems]")) initEcosystems(next);
  if (has("[data-services]")) initServices(next);
  if (has("[data-contact]")) prepContactPage(next);
  if (has("[data-project-hero")) prepProjectInDepth(next);
}

function initAfterEnterFunctions(next) {
  nextPage = next || document;

  // Runs after enter animation completes
  // if (has('[data-something]')) initSomething();
  if (has("[data-top-heading]")) initTopHeading(next);
  if (has("[data-link-button]")) initLinkButtons();
  if (has("[data-heading-reveal-mask]")) initHeadingMaskReveal();
  if (has("[data-ecosystem-graph]")) initEcosystemGraphs(next);
  if (has("[data-services]")) initServices();
  if (has("[data-underline-button]")) initUnderlineButton();
  if (has("[data-project-card-wrap]")) initProjectCards();
  if (has("[data-gsap-slider-init]")) {
    initProjectsSlider();
    bindProjectsSliderResize();
  }
  if (has("[data-avatar]")) initAvatar();
  if (has("[data-call-to-action]")) initCTA();
  if (has("[data-footer]")) initFooter();
  if (has("[data-copy-value]")) initCopyValue();
  if (has("[data-contact]")) initContactPage();
  if (has("[data-contact-form]")) initContactForm();
  if (has("[data-project-hero]")) initPojectInDepth();
  if (has("[data-project-roles]")) {
    initProjectRoles();
    initProjectRolesScrollTrigger();
  }
  if (has("[data-ecosystems]")) initEcosystemCounter(next);
  if (has("[data-project-highlights]")) initImagesOnPathScroll();
  if (has("[data-next-project]")) initNextProject();

  if (hasLenis() && lenis) {
    lenis.resize();
  }

  if (hasScrollTrigger()) {
    ScrollTrigger.refresh();
  }
}

// -----------------------------------------
// PAGE TRANSITIONS
// -----------------------------------------

function runPageOnceAnimation(next) {
  const tl = gsap.timeline();

  const body = document.body;
  const loader = document.querySelector("[data-page-loader]");
  const logoContainer = document.querySelector("[data-load-container]");
  const loadLogo = document.querySelector("[data-load-logo]");
  const nextChildren = next.querySelector(
    "[data-page-transition-reveal]",
  ).children;

  if (SKIP_LOAD_ANIMATION) {
    loader.style.display = "none";
    resetPage(next); // clears the position:fixed set by beforeEnter so we can scroll
    return;
  }

  tl.set(loader, { display: "flex" })
    .set(body, {
      backgroundColor: getVariableValue("--_colors---background-tones--80"),
    })
    .from(logoContainer, { yPercent: 50, autoAlpha: 0 }, 0.5)
    .to(
      loadLogo,
      {
        clipPath: "inset(0% 0% 0% 0%)",
        duration: 2,
        ease: "loader",
      },
      ">",
    )
    .to(logoContainer, { yPercent: -50, autoAlpha: 0 })
    .to(loader, { yPercent: -101 })
    .fromTo(next, { yPercent: 50 }, { yPercent: 0, duration: 0.8 }, "<")
    .fromTo(
      nextChildren,
      { yPercent: 100 },
      { yPercent: 0, duration: 1.2, stagger: staggerDefault },
      "<0.1",
    )
    .fromTo(next, { scale: 0.9 }, { scale: 1, duration: 0.8 }, "<0.4")
    .set(body, {
      backgroundColor: getVariableValue("--_colors---background"),
    });

  tl.call(
    () => {
      resetPage(next);
    },
    null,
    0,
  );

  return tl;
}

function getRevealSections(scope, phase) {
  return Array.from(
    scope.querySelectorAll("[data-page-transition-reveal]"),
  ).filter((el) => {
    const value = el.dataset.pageTransitionReveal;
    return !value || value === phase;
  });
}

function runPageLeaveAnimation(current, next) {
  const tl = gsap.timeline({
    onComplete: () => {
      current.remove();
    },
  });

  if (reducedMotion) {
    return tl.set(current, { autoAlpha: 0 });
  }

  const sections = getRevealSections(current, "leave");

  sections.forEach((section, i) => {
    tl.to(
      section.children,
      {
        autoAlpha: 0,
        yPercent: -50,
        filter: "blur(10px)",
        stagger: staggerDefault,
      },
      i === 0 ? "<" : "<0.05",
    );
  });

  tl.to(current, { autoAlpha: 0 }, "<50%");

  return tl;
}

function runPageEnterAnimation(next) {
  const tl = gsap.timeline();

  if (reducedMotion) {
    // Immediate swap behavior if user prefers reduced motion
    tl.set(next, { autoAlpha: 1 });
    tl.add("pageReady");
    tl.call(resetPage, [next], "pageReady");
    return new Promise((resolve) => tl.call(resolve, null, "pageReady"));
  }

  tl.add("startEnter", 0.6);

  const sections = getRevealSections(next, "enter");

  tl.fromTo(next, { autoAlpha: 0 }, { autoAlpha: 1 }, "startEnter");

  sections.forEach((section) => {
    tl.fromTo(
      section.children,
      {
        autoAlpha: 0,
        yPercent: 50,
        filter: "blur(10px)",
        stagger: staggerDefault,
      },
      {
        autoAlpha: 1,
        yPercent: 0,
        filter: "blur(0px)",
        stagger: staggerDefault,
        clearProps: "filter,transform,opacity",
      },
      ">",
    );
  });

  tl.add("pageReady");
  tl.call(resetPage, [next], "pageReady");

  return new Promise((resolve) => {
    tl.call(resolve, null, "pageReady");
  });
}

// -----------------------------------------
// BARBA HOOKS + INIT
// -----------------------------------------

barba.hooks.beforeEnter((data) => {
  // Re-add the loading cursor for in-app navigations too — gives the same
  // "wait, almost there" feedback as on first load.
  document.documentElement.classList.add("is-loading");

  // Position new container on top
  gsap.set(data.next.container, {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
  });

  if (lenis && typeof lenis.stop === "function") {
    lenis.stop();
  }

  initBeforeEnterFunctions(data.next.container);
  applyThemeFrom(data.next.container);
});

barba.hooks.afterLeave(() => {
  if (hasScrollTrigger()) {
    ScrollTrigger.getAll().forEach((trigger) => trigger.kill());
  }
});

barba.hooks.enter((data) => {
  initBarbaNavUpdate(data);
});

barba.hooks.afterEnter((data) => {
  // Run page functions
  initAfterEnterFunctions(data.next.container);

  // Settle
  if (hasLenis() && lenis) {
    lenis.resize();
    lenis.start();
  }

  if (hasScrollTrigger()) {
    ScrollTrigger.refresh();
  }

  // Page is fully ready — drop the loading cursor.
  document.documentElement.classList.remove("is-loading");
});

barba.init({
  debug: true, // Set to 'false' in production
  timeout: 7000,
  preventRunning: true,
  transitions: [
    {
      name: "default",
      sync: true,

      // First load
      async once(data) {
        initOnceFunctions();

        return runPageOnceAnimation(data.next.container);
      },

      // Current page leaves
      async leave(data) {
        return runPageLeaveAnimation(
          data.current.container,
          data.next.container,
        );
      },

      // New page enters
      async enter(data) {
        return runPageEnterAnimation(data.next.container);
      },
    },
  ],
});

// -----------------------------------------
// GENERIC + HELPERS
// -----------------------------------------

const themeConfig = {
  light: {
    nav: "dark",
    transition: "light",
  },
  dark: {
    nav: "light",
    transition: "dark",
  },
};

function applyThemeFrom(container) {
  const pageTheme = container?.dataset?.pageTheme || "light";
  const config = themeConfig[pageTheme] || themeConfig.light;

  document.body.dataset.pageTheme = pageTheme;
  const transitionEl = document.querySelector("[data-theme-transition]");
  if (transitionEl) {
    transitionEl.dataset.themeTransition = config.transition;
  }

  const nav = document.querySelector("[data-theme-nav]");
  if (nav) {
    nav.dataset.themeNav = config.nav;
  }
}

function initLenis() {
  if (lenis) return; // already created
  if (!hasLenis()) return;

  lenis = new Lenis({
    lerp: 0.165,
    wheelMultiplier: 1.25,
  });

  // Expose for other modules that need to lock/unlock scroll programmatically
  // (e.g. the project-roles pinned section's gesture handler).
  window.lenis = lenis;

  if (hasScrollTrigger()) {
    lenis.on("scroll", ScrollTrigger.update);
  }

  gsap.ticker.add((time) => {
    lenis.raf(time * 1000);
  });

  gsap.ticker.lagSmoothing(0);
}

function resetPage(container) {
  window.scrollTo(0, 0);
  gsap.set(container, { clearProps: "position,top,left,right" });

  if (hasLenis() && lenis) {
    lenis.resize();
    lenis.start();
  }
}

function debounceOnWidthChange(fn, ms) {
  let last = innerWidth,
    timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (innerWidth !== last) {
        last = innerWidth;
        fn.apply(this, args);
      }
    }, ms);
  };
}

function initBarbaNavUpdate(data) {
  var tpl = document.createElement("template");
  tpl.innerHTML = data.next.html.trim();
  var nextNodes = tpl.content.querySelectorAll("[data-barba-update]");
  var currentNodes = document.querySelectorAll("nav [data-barba-update]");

  currentNodes.forEach(function (curr, index) {
    var next = nextNodes[index];
    if (!next) return;

    // Aria-current sync
    var newStatus = next.getAttribute("aria-current");
    if (newStatus !== null) {
      curr.setAttribute("aria-current", newStatus);
    } else {
      curr.removeAttribute("aria-current");
    }

    // Class list sync
    var newClassList = next.getAttribute("class") || "";
    curr.setAttribute("class", newClassList);
  });
}

// add to runPageOnceAnimation() -> tl.call(()=>{...}) beneath resetPage(next)
function scrollToInitialHash(container = document) {
  const hash = window.location.hash;
  if (!hash || hash === "#") return;
  const target = container.querySelector(hash) || document.querySelector(hash);
  if (!target) return;
  // Reduced motion: jump
  if (reducedMotion) {
    target.scrollIntoView();
    return;
  }
  // Smooth: Lenis if available, else native smooth
  if (hasLenis && lenis) {
    lenis.scrollTo(target, {
      offset: 0,
      duration: 1,
      immediate: false,
      lock: true,
    });
  } else {
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

// -----------------------------------------
// YOUR FUNCTIONS GO BELOW HERE
// -----------------------------------------
