import { sourceAtLeast } from "../utils/helpers";
import { registerCleanup } from "../utils/lifecycle";

const settings = {
  // Laps per second of the meridians across the front, left to right. At
  // 0.125 each of 8 meridians moves up one place per second, like the Osmo
  // accelerating globe.
  spin: 0.1,
  // Globe radii per second for the images on the ribbon, at idle speed.
  ribbonSpeed: 0.27,
  // Seconds to ease into a new speed.
  speedChange: 1.2,
  // Scrolling speeds globe and ribbon up, on top of the current speed.
  // factor: extra speed per pixel scrolled per frame (Lenis velocity).
  // max: the most it adds. rise / fall: seconds to catch up with scrolling
  // and to settle back once it stops.
  scroll: { factor: 0.2, max: 5, rise: 0.15, fall: 0.15 },
  // Smallest image width (px) taken from the srcset for the ribbon.
  imageWidth: 800,
  // Drawing the ribbon in: it sweeps around once while its images shoot in
  // faster and settle back to the current speed. The globe keeps its pace.
  start: { duration: 2.6, ease: "power2.out", boost: 4, settle: 2.8 },
  // Drawing the ribbon out: no new images come out of the gate, the rest
  // finishes its lap.
  stop: { duration: 2.6, ease: "power2.out" },
};

const look = {
  radius: 392, // half of the 784 × 784 viewBox
  // How far we look down on the globe, in radians.
  elevation: 0.37,
  // Latitude of the outermost parallels, as sine (1 = the poles).
  parallelReach: 0.825,
};

let globe = null;

let ribbonScene = null;
const loadRibbonScene = () =>
  (ribbonScene ??= import(
    /* webpackChunkName: "globe" */ "../3d/globeRibbonScene"
  ));

const prefersReducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// The globe is an SVG built from custom elements in Webflow. Every
// [data-globe-parallel] ellipse and [data-globe-meridian] path is one line;
// add or remove them in Webflow and they are spread evenly here. Parallels
// stay put, meridians sweep across the front. The ribbon of theme images is
// WebGL, drawn on a canvas on top of the SVG.
export function prepGlobe(next = document) {
  const shape = next.querySelector("[data-globe-shape]");
  if (!shape) return null;

  const meridians = [...shape.querySelectorAll("[data-globe-meridian]")];
  const parallels = [...shape.querySelectorAll("[data-globe-parallel]")];
  const state = {
    spin: 0, // laps the meridians have moved across the front
    pace: 1, // multiplier on idle speed, for globe and ribbon alike
    flow: 1, // extra multiplier for the ribbon only, for the start boost
    scroll: 1, // extra multiplier from scrolling, for globe and ribbon
    paused: false,
    offset: 0, // globe radii the images have travelled
    // How much of the lap is drawn in / drawn out, measured from the gate.
    head: 0,
    tail: 0,
    ribbon: null,
    wantsRibbon: false,
  };

  function tick(time, deltaTime) {
    if (state.paused) return;
    const seconds = deltaTime / 1000;
    followScroll(state, seconds);
    const pace = state.pace * state.scroll;
    state.spin += settings.spin * pace * seconds;
    state.offset += settings.ribbonSpeed * pace * state.flow * seconds;
    drawMeridians(meridians, state.spin);
    drawRibbon(state);
  }

  drawParallels(parallels);
  drawMeridians(meridians, state.spin);
  if (!prefersReducedMotion()) gsap.ticker.add(tick);

  loadRibbonScene().then(({ createGlobeRibbon }) => {
    if (globe !== state) return;
    state.ribbon = createGlobeRibbon({ shape, images: getGlobeImages(next) });
    state.ribbon.ready.then(() => {
      if (state.wantsRibbon) startRibbon(state);
    });
  });

  globe = state;
  registerCleanup(() => {
    gsap.ticker.remove(tick);
    gsap.killTweensOf(state);
    state.ribbon?.destroy();
    globe = null;
  });

  return state;
}

// One entry point to steer the globe from timelines and scroll triggers:
//   globeController("start")       → the ribbon shoots in and keeps flowing
//   globeController("stop")        → no new images; the last lap finishes.
//                                     Returns a promise for when it is gone.
//   globeController("speed", 3)    → 3× the idle speed, eased in
//   globeController("speed", 1)    → back to idle
//   globeController("pause")
//   globeController("resume")
export function globeController(command, value) {
  if (!globe) return;

  const commands = {
    start: () => startRibbon(globe),
    stop: () => stopRibbon(globe),
    pause: () => (globe.paused = true),
    resume: () => (globe.paused = false),
    speed: (multiplier = 1) =>
      gsap.to(globe, {
        pace: multiplier,
        duration: settings.speedChange,
        ease: "power2.inOut",
        overwrite: true,
      }),
  };

  if (!commands[command]) {
    console.warn(`globeController: unknown command "${command}"`);
    return;
  }
  return commands[command](value);
}

function startRibbon(state) {
  state.wantsRibbon = true;
  if (!state.ribbon) return;

  const { duration, ease, boost, settle } = settings.start;
  const full = 1 + state.ribbon.softness;
  const still = prefersReducedMotion();

  gsap.killTweensOf(state, "head,tail");
  return gsap
    .timeline()
    .set(state, { head: still ? full : 0, tail: 0 })
    .to(state, { head: full, duration: still ? 0 : duration, ease })
    .fromTo(
      state,
      { flow: still ? 1 : boost },
      { flow: 1, duration: still ? 0 : settle, ease: "power3.out" },
      0,
    )
    .call(() => drawRibbon(state));
}

function stopRibbon(state) {
  state.wantsRibbon = false;
  if (!state.ribbon || state.head === 0) return Promise.resolve();

  const { duration, ease } = settings.stop;
  gsap.killTweensOf(state, "head,tail");
  return gsap
    .timeline()
    .to(state, {
      tail: 1 + state.ribbon.softness,
      duration: prefersReducedMotion() ? 0 : duration,
      ease,
    })
    .set(state, { head: 0, tail: 0 })
    .then(() => drawRibbon(state));
}

function drawRibbon(state) {
  const { ribbon, head, tail, offset } = state;
  if (!ribbon) return;
  if (head === 0 && !state.needsClear) return;
  state.needsClear = head !== 0;
  ribbon.render({
    offset,
    head,
    tail,
    pace: state.pace * state.scroll * state.flow,
  });
}

// Eases the scroll multiplier towards how fast Lenis is scrolling: quickly
// up while scrolling, slowly back down to 1 after.
function followScroll(state, seconds) {
  const { factor, max, rise, fall } = settings.scroll;
  const velocity = Math.abs(window.lenis?.velocity ?? 0);
  const target = 1 + Math.min(velocity * factor, max);
  const time = target > state.scroll ? rise : fall;
  state.scroll += (target - state.scroll) * (1 - Math.exp(-seconds / time));
}

function getGlobeImages(scope) {
  return [...scope.querySelectorAll("[data-globe-sources] [data-globe-image]")]
    .map((image) => sourceAtLeast(image, settings.imageWidth))
    .filter(Boolean);
}

// Parallels sit at equal distances from each other on screen.
export function drawParallels(ellipses) {
  const { radius, elevation, parallelReach } = look;
  const steps = Math.max(ellipses.length - 1, 1);

  ellipses.forEach((ellipse, index) => {
    const height = parallelReach * (1 - (2 * index) / steps);
    const width = Math.sqrt(1 - height * height);
    const [, y] = project(0, height, 0);
    setAttributes(ellipse, {
      cx: radius,
      cy: y,
      rx: width * radius,
      ry: width * radius * Math.sin(elevation),
    });
  });
}

// Only the front half of each meridian is drawn, as an arc from pole to
// pole. They are evenly spaced and slide from the left edge to the right
// edge at a steady pace; one leaving on the right comes back on the left.
export function drawMeridians(paths, spin) {
  const { radius } = look;
  paths.forEach((path, index) => {
    const x = 2 * ((index / paths.length + spin) % 1) - 1;
    const width = Math.abs(x) * radius;
    const side = x > 0 ? 1 : 0;
    path.setAttribute(
      "d",
      `M ${radius} 0 A ${+width.toFixed(2)} ${radius} 0 0 ${side} ${radius} ${2 * radius}`,
    );
  });
}

// From a point on the unit sphere to the SVG, seen slightly from above.
function project(x, y, z) {
  const { radius, elevation } = look;
  const up = y * Math.cos(elevation) - z * Math.sin(elevation);
  return [radius + x * radius, radius - up * radius];
}

function setAttributes(element, values) {
  Object.entries(values).forEach(([name, value]) =>
    element.setAttribute(name, +value.toFixed(2)),
  );
}

export function initGlobe() {
  const bgStateTrigger = document.querySelector(
    "[data-globe-bg-state-trigger]",
  );
  const globeWrap = document.querySelector("[data-globe-wrap]");
  const globeSection = document.querySelector("[data-globe]");
  const globe = document.querySelector("[data-globe-shape]");

  if (!bgStateTrigger) return;

  globeController("start");

  // Sticky Globe Section
  gsap
    .timeline({
      scrollTrigger: {
        trigger: globeWrap,
        start: "top top",
        end: "bottom bottom",
        scrub: true,
      },
    })
    .to(globeSection, { yPercent: 200, ease: "none" });

  // Animate action when first section is in view
  let bgStateTl = gsap.timeline({
    scrollTrigger: {
      trigger: bgStateTrigger,
      start: "center bottom",
      scrub: true,
      onEnter: () => globeController("stop"),
      onLeaveBack: () => globeController("start"),
    },
  });

  bgStateTl.to(globe, {
    autoAlpha: 0.2,
    duration: 1,
  });
}

export function initGlobeSections(next = document) {
  const overlayingSections = next.querySelectorAll(
    "[data-globe-overlaying-section]",
  );

  overlayingSections.forEach((section) => {
    const items = [
      ...section.querySelectorAll(
        "[data-globe-overlaying-section-element], [data-globe-overlaying-section-text]",
      ),
    ];
    if (!items.length) return;

    const timeline = gsap.timeline({
      scrollTrigger: {
        trigger: items[0],
        start: "top 80%",
        endTrigger: items[items.length - 1],
        end: "bottom 50%",
        scrub: true,
      },
    });

    items.forEach((item, index) => {
      const position = index === 0 ? 0 : ">-0.3";
      if (item.matches("[data-globe-overlaying-section-text]")) {
        const { lines } = SplitText.create(item, { type: "lines" });
        timeline.from(
          lines,
          { autoAlpha: 0, filter: "blur(10px)", stagger: 0.1 },
          position,
        );
      } else {
        timeline.from(
          item,
          { yPercent: 50, autoAlpha: 0, filter: "blur(10px)" },
          position,
        );
      }
    });
  });
}
