// ─────────────────────────────────────────────────────────────────────────────
// Shared dot-position lookup
//
// Project nodes (DOM overlay) align to dots (canvas-rendered from the SVG
// map) via a stable index ID. initEcosystemMap populates this on every
// layout() call; initEcosystemProjects reads from it to position nodes in
// the same coordinate space as the canvas dots — so they stay locked
// regardless of viewport size.
//
// dotPositions[id] = { x, y } in canvas-relative CSS pixels.
// mapCanvas is the canvas element itself, used to translate canvas-relative
// coords into the project-node's parent-relative coords at positioning time.
// ─────────────────────────────────────────────────────────────────────────────
let dotPositions = [];
let mapCanvas = null;

// Dev helper: open the page with ?showDots=true to render each dot's index
// number on top of the canvas. Use this once to look up which ID matches
// which city, then enter that ID in Webflow CMS.
const SHOW_DOT_IDS =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("showDots") === "true";

export function initEcosystems(next = document) {
  initEcosystemMap(next);
  initEcosystemProjects(next);
  initEcosystemParallax(next);
}

export function initEcosystemCounter(next = document) {
  const counter = next.querySelector("[data-ecosystem-theme-counter]");
  const countElements = next.querySelectorAll("[data-theme-count-element]");
  const amountOfThemes = countElements.length;
  counter.textContent = "0";

  const REPEAT_DELAY = amountOfThemes > 7 ? 0.1 : 0.3;

  function incrementCounter() {
    if (counter.textContent < amountOfThemes) {
      counter.textContent = parseInt(counter.textContent) + 1;
    }
  }

  let tl = gsap.timeline({
    scrollTrigger: {
      trigger: next.querySelector("[data-ecosystems]"),
      start: "top 80%",
    },
    repeat: amountOfThemes - 1,
    repeatDelay: REPEAT_DELAY,
  });

  tl.add(() => incrementCounter());
}

function initEcosystemMap(next = document) {
  const section = next.querySelector("[data-ecosystems]");
  if (!section) return;

  const mapWrap = section.querySelector("[data-ecosystems-map-wrap]");
  const mapSvg = section.querySelector("[data-ecosystems-map]");
  if (!mapWrap || !mapSvg) return;

  // --- 1. Extract dot positions from the SVG (one time) ----------------
  // Each <path> is a dot. getBBox() gives us each path's local bounding box
  // in SVG viewBox coordinates. Center + radius become our source data.
  const paths = mapSvg.querySelectorAll("path");
  const sourceDots = [];
  paths.forEach((p) => {
    const b = p.getBBox();
    if (!b.width && !b.height) return; // skip degenerate
    sourceDots.push({
      x: b.x + b.width / 2,
      y: b.y + b.height / 2,
      r: Math.max(b.width, b.height) / 2,
    });
  });

  const len = sourceDots.length;
  if (!len) return;

  const vb = mapSvg.viewBox.baseVal;
  const svgW = vb.width || parseFloat(mapSvg.getAttribute("width")) || 1;
  const svgH = vb.height || parseFloat(mapSvg.getAttribute("height")) || 1;

  // Extract fill color from the first path (falls back to a default).
  const fillAttr = paths[0]?.getAttribute("fill") || "#2C1D5A";
  const rgb = hexToRgb(fillAttr);

  // --- 2. Create canvas overlaying the SVG -----------------------------
  const canvas = document.createElement("canvas");
  canvas.style.position = "absolute";
  canvas.style.pointerEvents = "none";
  // Ensure wrap is a positioning context.
  if (getComputedStyle(mapWrap).position === "static") {
    mapWrap.style.position = "relative";
  }
  mapWrap.appendChild(canvas);
  mapCanvas = canvas;

  // Hide the SVG — we don't need it rendered anymore, but keep it in DOM
  // so layout (and getBoundingClientRect) stays correct.
  mapSvg.style.visibility = "hidden";

  const ctx = canvas.getContext("2d");
  const dpr = Math.min(window.devicePixelRatio || 1, 2); // cap at 2 for perf

  // Per-dot typed arrays for max speed in the render loop.
  const intensities = new Float32Array(len);
  const dotX = new Float32Array(len);
  const dotY = new Float32Array(len);
  const dotR = new Float32Array(len);

  // --- 3. Layout sync: size canvas to match the SVG's displayed box ----
  let cssW = 0;
  let cssH = 0;

  const layout = () => {
    const svgRect = mapSvg.getBoundingClientRect();
    const wrapRect = mapWrap.getBoundingClientRect();
    cssW = svgRect.width;
    cssH = svgRect.height;
    canvas.style.left = svgRect.left - wrapRect.left + "px";
    canvas.style.top = svgRect.top - wrapRect.top + "px";
    canvas.style.width = cssW + "px";
    canvas.style.height = cssH + "px";
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // one-shot: work in CSS pixels

    // Fit viewBox into displayed rect, preserving aspect (same as SVG
    // preserveAspectRatio="xMidYMid meet" default).
    const scale = Math.min(cssW / svgW, cssH / svgH);
    const offsetX = (cssW - svgW * scale) / 2;
    const offsetY = (cssH - svgH * scale) / 2;
    for (let i = 0; i < len; i++) {
      dotX[i] = sourceDots[i].x * scale + offsetX;
      dotY[i] = sourceDots[i].y * scale + offsetY;
      dotR[i] = Math.max(sourceDots[i].r * scale, 0.5);
      // Mirror into the module-level lookup so project nodes can read
      // dot positions without poking at the typed arrays.
      dotPositions[i] = { x: dotX[i], y: dotY[i] };
    }

    // Reposition project-node DOM overlays whenever the map relayouts,
    // so they stay locked to their assigned dots across viewport changes.
    positionProjectNodes();
  };

  layout();

  // Auto-relayout whenever the map wrap's size changes. Catches both window
  // resizes and Barba's post-transition reset (container goes from fixed to
  // natural flow). Debounced so rapid changes don't thrash.
  let resizeTimer;
  const resizeObserver = new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(layout, 120);
  });
  resizeObserver.observe(mapWrap);

  // --- 4. Mouse tracking (canvas-relative CSS pixels) ------------------
  // Two positions: the *real* mouse (instant), and the *tracked* position
  // that lerps toward it. Dots react to the tracked one, giving that
  // custom-cursor-with-smoothing feel.
  let mouseX = -1e6;
  let mouseY = -1e6;
  let trackX = -1e6;
  let trackY = -1e6;
  window.addEventListener("mousemove", (e) => {
    const r = canvas.getBoundingClientRect();
    mouseX = e.clientX - r.left;
    mouseY = e.clientY - r.top;
  });
  // Reset when cursor leaves viewport, so trail decays cleanly.
  window.addEventListener("mouseleave", () => {
    mouseX = -1e6;
    mouseY = -1e6;
  });

  // --- 5. Plankton animation constants ---------------------------------
  const THRESHOLD = 60;
  const THRESHOLD_SQ = THRESHOLD * THRESHOLD;
  const BASE_OPACITY = 0.3;
  const PEAK_OPACITY = 1.0;
  const BASE_SCALE = 0.8;
  const PEAK_SCALE = 1.2;
  const LERP_UP = 0.35;
  const LERP_DOWN = 0.025;
  // Cursor smoothing: 1 = instant (no delay), 0.1 = heavy drag.
  // 0.18-0.22 feels like Webflow's default interaction smoothing.
  const CURSOR_LERP = 0.15;

  // Hover-target tracking for the dev overlay — single closest dot.
  const HOVER_RADIUS = 15; // px: cursor must be within this of the nearest dot
  const HOVER_RADIUS_SQ = HOVER_RADIUS * HOVER_RADIUS;

  // --- 6. Render loop --------------------------------------------------
  const render = () => {
    // Smooth the tracked cursor toward the real one (cursor-lag effect).
    trackX += (mouseX - trackX) * CURSOR_LERP;
    trackY += (mouseY - trackY) * CURSOR_LERP;

    ctx.clearRect(0, 0, cssW, cssH);

    // Find the single dot closest to the cursor (only used by the dev
    // overlay, but cheap to compute alongside the main loop).
    let hoveredIndex = -1;
    let hoveredDistSq = Infinity;

    for (let i = 0; i < len; i++) {
      // Distance → target intensity (squared trick: skip sqrt when far).
      const dx = dotX[i] - trackX;
      const dy = dotY[i] - trackY;
      const distSq = dx * dx + dy * dy;
      let target = 0;
      if (distSq < THRESHOLD_SQ) {
        target = 1 - Math.sqrt(distSq) / THRESHOLD;
      }

      if (SHOW_DOT_IDS && distSq < hoveredDistSq) {
        hoveredDistSq = distSq;
        hoveredIndex = i;
      }

      // Asymmetric lerp → plankton trail behaviour.
      const cur = intensities[i];
      const rate = target > cur ? LERP_UP : LERP_DOWN;
      const next = cur + (target - cur) * rate;
      intensities[i] = next;

      const alpha = BASE_OPACITY + (PEAK_OPACITY - BASE_OPACITY) * next;
      const r = dotR[i] * (BASE_SCALE + (PEAK_SCALE - BASE_SCALE) * next);

      ctx.beginPath();
      ctx.arc(dotX[i], dotY[i], r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`;
      ctx.fill();
    }

    // Dev overlay: render the ID of only the single dot directly under
    // the cursor (within HOVER_RADIUS). Visit with ?showDots=true.
    // Color is bright orange — high contrast on both the white background
    // between dots AND the purple-blue dots themselves.
    if (
      SHOW_DOT_IDS &&
      hoveredIndex >= 0 &&
      hoveredDistSq < HOVER_RADIUS_SQ
    ) {
      ctx.fillStyle = "#FF6F00";
      ctx.font = "bold 28px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText(String(hoveredIndex), dotX[hoveredIndex], dotY[hoveredIndex] - 10);
    }
  };

  // Piggyback on GSAP's ticker — one loop, synced with every other animation.
  gsap.ticker.add(render);
}

function initEcosystemProjects() {
  const section = document.querySelector("[data-ecosystems]");
  if (!section) return;
  const themeSelectors = section.querySelectorAll("[data-ecosystem-theme]");
  const projectNodes = document.querySelectorAll(
    "[data-ecosystem-project-node]",
  );

  // Position each project on map by looking up its assigned dot ID.
  // Actual positioning logic lives in positionProjectNodes() so the
  // map's layout() can call it on every resize.
  positionProjectNodes();

  function selectTheme(theme) {
    animateThemeSelection(theme);
    section.setAttribute("data-ecosystem-selected-theme", theme);

    projectNodes.forEach((p) => {
      const projectTheme = p.closest("[data-ecosystem-project-node-group]")
        ?.dataset.ecosystemProjectNodeGroup;

      p.toggleAttribute("data-active", projectTheme === theme);
    });
  }

  function animateThemeSelection(theme) {
    if (section.dataset.ecosystemSelectedTheme === theme) return;

    const allClips = section.querySelectorAll("[data-ecosystem-theme-clip]");
    const selector = section.querySelector(`[data-ecosystem-theme=${theme}]`);
    const targetClip = selector.querySelector("[data-ecosystem-theme-clip]");

    let tl = gsap.timeline();

    // Reset all clips to 0% width before animating the selected one to 100%
    tl.to(
      allClips,
      {
        clipPath: "inset(0% 100% 0% 0%)",
      },
      0,
    );
    tl.to(
      targetClip,
      {
        clipPath: "inset(0% 0% 0% 0%)",
      },
      0,
    );
  }

  // Set first theme as default selected theme on page load
  const firstTheme = section.querySelector(
    "[data-ecosystem-theme-selector-wrap]",
  ).children[0];
  selectTheme(
    firstTheme
      .querySelector("[data-ecosystem-theme]")
      .getAttribute("data-ecosystem-theme"),
  );

  // Add click event listeners to theme selectors
  themeSelectors.forEach((selector) => {
    selector.addEventListener("click", () => {
      const theme = selector.getAttribute("data-ecosystem-theme");
      selectTheme(theme);
    });
  });

  projectNodes.forEach((node) => {
    node.addEventListener("click", () => {
      const projectTheme = node.closest("[data-ecosystem-project-node-group]")
        ?.dataset.ecosystemProjectNodeGroup;

      selectTheme(projectTheme);
    });
  });
}

function initEcosystemParallax() {
  const section = document.querySelector("[data-ecosystems]");
  if (!section) return;
  const mapWrap = section.querySelector("[data-ecosystems-map-wrap]");
  const collectionWrap = section.querySelector(
    "[data-ecosystems-map-collection-wrap]",
  );
  const canvas = section.querySelector("canvas");
  if (!mapWrap || !collectionWrap) return;

  // Two layers moving in opposite directions = depth illusion.
  // Foreground (collection) follows the mouse; background (canvas) moves
  // against it, and a bit softer for subtlety.
  const FG_STRENGTH = 3;
  const BG_STRENGTH = 3;

  const fgX = gsap.quickTo(collectionWrap, "x", { duration: 0.5 });
  const fgY = gsap.quickTo(collectionWrap, "y", { duration: 0.5 });
  const bgX = canvas ? gsap.quickTo(canvas, "x", { duration: 0.7 }) : null;
  const bgY = canvas ? gsap.quickTo(canvas, "y", { duration: 0.7 }) : null;

  mapWrap.addEventListener("mousemove", (e) => {
    const rect = mapWrap.getBoundingClientRect();
    // Normalize mouse pos to -1..1 (center = 0).
    const xNorm = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
    const yNorm = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
    fgX(xNorm * FG_STRENGTH);
    fgY(yNorm * FG_STRENGTH);
    bgX?.(-xNorm * BG_STRENGTH);
    bgY?.(-yNorm * BG_STRENGTH);
  });

  mapWrap.addEventListener("mouseleave", () => {
    fgX(0);
    fgY(0);
    bgX?.(0);
    bgY?.(0);
  });
}

// Position every [data-ecosystem-project-node] so its top-left aligns
// with its assigned dot on the map. Reads dotPositions (canvas-relative
// CSS px) and translates into the node's offsetParent coordinate space.
// Safe to call multiple times — invoked on init + on every map relayout.
function positionProjectNodes() {
  if (!mapCanvas || !dotPositions.length) return;

  const canvasRect = mapCanvas.getBoundingClientRect();
  const nodes = document.querySelectorAll("[data-ecosystem-project-node]");

  nodes.forEach((node) => {
    const id = parseInt(node.dataset.dotId, 10);
    if (isNaN(id)) return;
    const dot = dotPositions[id];
    if (!dot) return;

    const parent = node.offsetParent;
    if (!parent) return;
    const parentRect = parent.getBoundingClientRect();

    // Canvas-relative dot coords → parent-relative coords. Both rects use
    // viewport coordinates from getBoundingClientRect so the math is direct.
    const x = canvasRect.left - parentRect.left + dot.x;
    const y = canvasRect.top - parentRect.top + dot.y;

    node.style.left = x + "px";
    node.style.top = y + "px";
  });
}

// --- helpers ----------------------------------------------------------
function hexToRgb(hex) {
  const m = hex.trim().match(/^#?([a-f\d]{6})$/i);
  if (!m) return { r: 44, g: 29, b: 90 }; // brand purple fallback
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
