import { registerCleanup } from "../utils/lifecycle";

// The hero globe: a sphere of cells (see ../3d/cellGlobe), Northern Europe
// lit up, pulses running out from the project locations. It lives in
// [data-globe], which moves down with the page while the sections in
// [data-globe-wrap] scroll over it.
//
// Every option of the globe can be set here. Without code, in Webflow:
//   [data-globe-pulse-interval="14"]  on [data-globe]: seconds between pulses
//   [data-globe-pulses="off"]         on [data-globe]: no pulses
//   [data-globe-source] with data-lat and data-lon (e.g. in a CMS list of
//   projects): a pulse source per project. Without any, the demo list below.
//   [data-globe-canvas]               optional: where the canvas goes,
//                                     [data-globe] itself otherwise
//   [data-globe-fallback]             optional: shown instead when the device
//                                     has no WebGL2 (e.g. a still of the globe)
const settings = {
  // The start screen: zoomed in on Europe, swaying gently around it.
  globe: {
    lon: 12, // Europe in front
    tilt: 25,
    zoom: 1.55,
    zoomMobile: 1.4,
    focusLat: 52, // Northern Europe…
    focusY: 0.42, // …at 42% of the screen height, so the globe sits low
    motion: "europe",
    swayDeg: 24,
    swaySpeed: 0.16,
    roundSpeed: 0.07, // rad/s once it turns round: one turn in 90 s
    dotScale: 0.42,
    // The seven countries a touch darker than the rest of the world.
    colors: { dot: "#C2BFD2", selected: "#B3AFC7", pulse: "#2430B8" },
    contextOpacity: 0.34,
    limbFade: 0.28,
    // Calm enough to let the seven countries Lead Glocal works in stand out.
    pulse: {
      enabled: true,
      interval: 12,
      maxAngle: 18,
      width: 1.3,
      strength: 0.5,
      // A pulse barely lights up the seven countries, so one pulse doesn't
      // light up all of Europe; a bit less than on the rest of the world.
      selectedStrength: 0.45,
      contextStrength: 0.75,
    },
    reveal: { duration: 1.2 },
    interactive: { dragTilt: false }, // dragging only turns the globe
  },
  // Once the next section comes in, the globe steps back behind the text:
  // zoomed out, centred, tipped less towards Europe, turning all the way
  // round and fainter. Follows the scroll between start and end.
  backdrop: {
    zoom: 1.1, // as part of the start zoom, so mobile scales along
    tilt: 12,
    motion: "round",
    opacity: 0.5,
    start: "top 90%",
    end: "top 25%",
  },
  // A few project locations until they come from the CMS.
  demoSources: [
    [52.37, 4.9], // Amsterdam
    [55.68, 12.57], // Kopenhagen
    [59.33, 18.07], // Stockholm
  ],
  // Innovation hubs around the world, pulsing along with the projects.
  worldSources: [
    [37.77, -122.42],
    [42.36, -71.06],
    [40.71, -74.01],
    [19.43, -99.13],
    [-23.55, -46.63],
    [4.71, -74.07],
    [32.09, 34.78],
    [25.2, 55.27],
    [6.52, 3.38],
    [-1.29, 36.82],
    [-33.92, 18.42],
    [12.97, 77.59],
    [1.35, 103.82],
    [35.68, 139.69],
    [-33.87, 151.21],
  ],
};

let globe = null;

let globeEngine = null;
const loadGlobeEngine = () =>
  (globeEngine ??= import(/* webpackChunkName: "globe" */ "../3d/cellGlobe"));

export function prepGlobe(next = document) {
  const section = next.querySelector("[data-globe]");
  if (!section) return;
  const host = section.querySelector("[data-globe-canvas]") || section;
  if (getComputedStyle(host).position === "static")
    host.style.position = "relative";
  // The canvas sits in a stage of its own, which steps back on scroll.
  const stage = document.createElement("div");
  stage.setAttribute("data-globe-stage", "");
  stage.style.cssText = "position:absolute;inset:0;";
  host.appendChild(stage);

  let active = true;
  registerCleanup(() => {
    active = false;
    globe?.destroy();
    globe = null;
    stage.remove();
  });

  loadGlobeEngine().then(({ createCellGlobe }) => {
    if (!active) return;
    globe = createCellGlobe(stage, {
      ...settings.globe,
      pulse: { ...settings.globe.pulse, ...readPulseSettings(section) },
      sources: readSources(next),
      interactionTarget: next.querySelector("[data-globe-wrap]") || section,
    });
    if (!globe) {
      stage.remove();
      const fallback = section.querySelector("[data-globe-fallback]");
      if (fallback) fallback.style.display = "block";
    } else if (pendingReveal) {
      globe.reveal();
    }
  });
}

let pendingReveal = false;

export function initGlobe(next = document) {
  const wrap = next.querySelector("[data-globe-wrap]");
  const section = next.querySelector("[data-globe]");
  if (!section) return;

  // Built up once the page is in view; the engine may still be loading.
  pendingReveal = true;
  globe?.reveal();
  registerCleanup(() => (pendingReveal = false));

  // The globe section moves down with the page while the sections after it
  // scroll over it.
  if (wrap)
    gsap.to(section, {
      yPercent: 200,
      ease: "none",
      scrollTrigger: {
        trigger: wrap,
        start: "top top",
        end: "bottom bottom",
        scrub: true,
      },
    });

  // Steps back behind the text. The size changes inside the canvas, never
  // the canvas itself, so the globe never shows a cut-off edge.
  const trigger = next.querySelector("[data-globe-bg-state-trigger]");
  const stage = section.querySelector("[data-globe-stage]");
  if (trigger && stage) {
    const { globe: hero, backdrop } = settings;
    const view = { progress: 0 };
    gsap.to(view, {
      progress: 1,
      ease: "none",
      scrollTrigger: {
        trigger,
        start: backdrop.start,
        end: backdrop.end,
        scrub: true,
      },
      onUpdate: () => {
        const t = view.progress;
        stage.style.opacity = 1 + (backdrop.opacity - 1) * t;
        if (!globe) return;
        globe.state.scale = 1 + (backdrop.zoom / hero.zoom - 1) * t;
        globe.state.focus = 1 - t;
        globe.state.restTilt =
          (hero.tilt + (backdrop.tilt - hero.tilt) * t) * (Math.PI / 180);
        const motion = t < 0.5 ? hero.motion : backdrop.motion;
        if (globe.config.motion !== motion) globe.set({ motion });
      },
    });
  }
}

// One entry point to steer the globe from timelines and scroll triggers:
//   globeController("reveal")              → build the cells up
//   globeController("pause") / ("resume")
//   globeController("ripple", [lat, lon])  → a pulse from that point
//   globeController("set", { tilt: 30 })   → change any option live
export function globeController(command, value) {
  if (!globe) return;
  const commands = {
    reveal: () => globe.reveal(),
    pause: () => globe.pause(),
    resume: () => globe.resume(),
    ripple: ([lat, lon]) => globe.ripple(lat, lon),
    set: (changes) => globe.set(changes),
  };
  if (!commands[command]) {
    console.warn(`globeController: unknown command "${command}"`);
    return;
  }
  return commands[command](value);
}

function readSources(scope) {
  const sources = [...scope.querySelectorAll("[data-globe-source]")]
    .map((element) => [
      parseFloat(element.dataset.lat),
      parseFloat(element.dataset.lon),
    ])
    .filter(([lat, lon]) => Number.isFinite(lat) && Number.isFinite(lon));
  return [
    ...(sources.length ? sources : settings.demoSources),
    ...settings.worldSources,
  ];
}

function readPulseSettings(section) {
  const interval = parseFloat(section.dataset.globePulseInterval);
  return {
    ...(Number.isFinite(interval) && interval > 0 && { interval }),
    ...(section.dataset.globePulses === "off" && { enabled: false }),
  };
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
