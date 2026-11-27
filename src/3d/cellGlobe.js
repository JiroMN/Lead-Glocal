import { ROWS, COUNTRIES, CELLS } from "./globeCells";

// A globe built from cells: one round dot per 0.88° of land, drawn as
// instanced quads in plain WebGL2. Northern Europe at full strength, the
// rest of the world faint, pulses travelling over the surface from the
// project locations. Only the front of the sphere is ever drawn.
export const defaults = {
  // Camera
  lon: 12, // longitude facing the viewer (12 = Europe)
  tilt: 25, // degrees, tipped towards the viewer so we look down a little
  zoom: 1.55, // 1 = whole globe in view; above 1 it runs off the screen
  zoomMobile: 1.4,
  mobileBreakpoint: 760, // container width in px
  // Globe radius at zoom 1, from the container size in px.
  radius: (width, height, mobile) =>
    mobile
      ? Math.min(width * 0.62, height * 0.36)
      : Math.min(width * 0.26, height * 0.4),
  // When zoomed in, this latitude sits at focusY of the container height.
  // null keeps the globe centred.
  focusLat: 52,
  focusY: 0.42,

  // Idle motion: "europe" sways around lon, "round" turns all the way,
  // "none" stands still.
  motion: "europe",
  swayDeg: 24,
  swaySpeed: 0.16, // rad/s of the sway's sine: one full sway in ~39 s
  roundSpeed: 0.07, // rad/s for "round"

  // Look
  dotScale: 0.42, // dot radius as part of the spacing between cells
  // selected: the dots of the selected countries.
  colors: { dot: "#C2BFD2", selected: "#C2BFD2", pulse: "#2430B8" },
  contextOpacity: 0.34, // countries outside `selected`
  selected: COUNTRIES,
  limbFade: 0.28, // cells fade out over this depth towards the edge

  // Pulses run out from the sources over the surface, through the cells.
  pulse: {
    enabled: true,
    interval: 10, // seconds between two pulses of the same source
    maxAngle: 24, // degrees a pulse travels before it has faded
    width: 1.3, // degrees, the thickness of the front
    strength: 0.62, // how far cells on the front turn to colors.pulse
    mergeWithin: 2.2, // sources closer than this (degrees) pulse as one
    // How strongly a pulse shows on the selected countries and on the rest,
    // as part of strength.
    selectedStrength: 1,
    contextStrength: 0.75,
  },
  // [lat, lon] per project location.
  sources: [],

  // dragTilt: dragging up and down tips the globe too (mouse only).
  interactive: {
    drag: true,
    dragTilt: true,
    dragSpeed: 0.004, // radians per pixel dragged
    dragWeight: 0.14, // seconds the globe takes to catch up with the pointer
    dragMomentum: 0.9, // seconds it keeps coasting after letting go
    hover: true,
    // The hover trail, like the ecosystem map: the cursor is followed with a
    // little delay, cells light up quickly near it and fade out slowly, so
    // a trail is left behind.
    hoverRadius: 60, // px around the cursor
    hoverFollow: 1, // share of the way to the cursor per frame; 1 = on it
    hoverFade: 0.3, // seconds a lit cell takes to fade out
    clickRipple: true,
  },
  // Element that receives the pointer (the canvas when left empty), and what
  // inside it keeps the pointer for itself instead of dragging the globe.
  interactionTarget: null,
  passThrough:
    "a, button, input, select, textarea, label, h1, h2, h3, h4, h5, h6, p, img, [data-globe-pass-through]",
  // Cells appear from the middle outwards once reveal() is called.
  reveal: { duration: 1.2 },
  dprMax: 2,
  pauseOffscreen: true,
};

const MAX_SOURCES = 48;
const MAX_RIPPLES = 6;
const TRAIL_LENGTH = 10; // hover trail samples
const TRAIL_STEP = 1 / 40; // seconds between samples
const RIPPLE_LIFE = 3; // seconds
const IDLE_RETURN = 2.5; // seconds without interaction before the sway returns
const TILT_RANGE = [-10, 70]; // degrees
const RAD = Math.PI / 180;

export function createCellGlobe(container, options = {}) {
  let config = merge(defaults, options);
  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  const canvas = document.createElement("canvas");
  canvas.style.cssText =
    "position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;";
  container.appendChild(canvas);

  const gl = canvas.getContext("webgl2", {
    alpha: true,
    antialias: false,
    premultipliedAlpha: true,
    powerPreference: "high-performance",
  });
  if (!gl) {
    canvas.remove();
    return null;
  }

  const program = createProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER);
  const uniforms = getUniforms(gl, program);
  const cells = readCells();
  const geometry = createGeometry(gl, cells);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  // Live camera state, in radians. Can be tweened from outside.
  //   rotation = idle motion + rotationOffset (drag) + returnOffset
  //   tilt     = restTilt + tiltOffset (drag)
  const state = {
    zoom: 1,
    zoomTarget: 1,
    scale: 1, // extra size on top of zoom, e.g. to step back on scroll
    focus: 1, // 1 = focusLat at focusY when zoomed in, 0 = centred
    restTilt: config.tilt * RAD, // the tilt the globe rests at
    tilt: config.tilt * RAD,
    rotation: -config.lon * RAD,
    // What a drag added on top of the idle motion; eases back to 0.
    rotationOffset: 0,
    tiltOffset: 0,
    // What is left of a turn back to Europe after leaving "round". Eases
    // to 0 by itself; scroll can scrub it down faster, never up.
    returnOffset: 0,
    reveal: reducedMotion ? 1 : 0,
    locked: false, // true: rotation, tilt and zoom are driven from outside
  };
  // The idle motion itself: where the globe would be without any drag.
  const idle = { angle: -config.lon * RAD, mode: config.motion };
  let wasLocked = false;
  const view = { width: 1, height: 1, dpr: 1, baseRadius: 300, mobile: false };
  const sources = { data: new Float32Array(MAX_SOURCES * 4), count: 0 };
  const trail = {
    points: [],
    lastSample: -Infinity,
    data: new Float32Array(TRAIL_LENGTH * 4),
  };
  const ripples = {
    data: new Float32Array(MAX_RIPPLES * 4).fill(-99),
    next: 0,
  };
  const pointer = {
    over: false,
    surface: [0, 0, 1],
    tracked: null, // where the trail follows the cursor, on the sphere
    hover: 0,
    dragging: false,
    x: 0,
    y: 0,
    pending: [0, 0], // dragged but not yet turned, in radians
    velocity: [0, 0], // radians per second
    idle: Infinity,
    moved: false,
  };
  let colors = {
    dot: hexToRgb(config.colors.dot),
    selected: hexToRgb(config.colors.selected ?? config.colors.dot),
    pulse: hexToRgb(config.colors.pulse),
  };
  let time = 0;
  let revealStart = null;
  let lastFrame = 0;
  let frameRequest = 0;
  let running = false;

  const swayTarget = () =>
    -config.lon * RAD +
    Math.sin(time * config.swaySpeed) * config.swayDeg * RAD;

  // Switching the idle motion never jumps: "round" carries on from where
  // the sway was, "europe" turns back the short way round.
  function syncMotion() {
    if (config.motion === idle.mode) return;
    if (config.motion === "europe") {
      const current = idle.angle + state.returnOffset;
      idle.angle = swayTarget();
      state.returnOffset = wrapToPi(current - idle.angle);
    }
    idle.mode = config.motion;
  }

  function applyConfig() {
    const selectedMask = COUNTRIES.reduce(
      (mask, code, index) =>
        config.selected.includes(code) ? mask | (1 << index) : mask,
      0,
    );
    gl.useProgram(program);
    gl.uniform1i(uniforms.uSelected, selectedMask);

    // Sources close together pulse as one; the rest spread their pulses
    // evenly over the interval (golden ratio steps), never all at once.
    const merged = [];
    config.sources.forEach(([lat, lon]) => {
      const point = toVector(lat, lon);
      const near = merged.some(
        (other) => angleBetween(other, point) < config.pulse.mergeWithin * RAD,
      );
      if (!near) merged.push(point);
    });
    sources.count = Math.min(merged.length, MAX_SOURCES);
    sources.data.fill(0);
    merged.slice(0, MAX_SOURCES).forEach((point, index) => {
      const phase = ((index * 0.618034) % 1) * config.pulse.interval;
      sources.data.set([...point, phase], index * 4);
    });

    colors = {
      dot: hexToRgb(config.colors.dot),
      selected: hexToRgb(config.colors.selected ?? config.colors.dot),
      pulse: hexToRgb(config.colors.pulse),
    };
    state.zoomTarget = view.mobile ? config.zoomMobile : config.zoom;
    syncMotion();
  }

  function resize() {
    const { width, height } = container.getBoundingClientRect();
    view.width = Math.max(1, Math.round(width));
    view.height = Math.max(1, Math.round(height));
    view.mobile = view.width < config.mobileBreakpoint;
    view.dpr = Math.min(window.devicePixelRatio || 1, config.dprMax);
    canvas.width = Math.round(view.width * view.dpr);
    canvas.height = Math.round(view.height * view.dpr);
    view.baseRadius = config.radius(view.width, view.height, view.mobile);
    applyConfig();
    if (!running) draw();
  }

  // Rotation around the axis, then the tilt towards the viewer.
  function rotationMatrix() {
    const cr = Math.cos(state.rotation);
    const sr = Math.sin(state.rotation);
    const ct = Math.cos(state.tilt);
    const st = Math.sin(state.tilt);
    return [
      [cr, 0, sr],
      [sr * st, ct, -cr * st],
      [-sr * ct, st, cr * ct],
    ];
  }

  // Zoomed in, the globe sinks so focusLat sits at focusY.
  function centreY(radius) {
    const { zoomTarget } = state;
    if (config.focusLat === null) return view.height / 2;
    const zoomed =
      zoomTarget > 1 ? clamp((state.zoom - 1) / (zoomTarget - 1), 0, 1) : 0;
    const focus =
      view.height * config.focusY +
      radius * Math.sin(config.focusLat * RAD - state.tilt);
    return view.height / 2 + zoomed * state.focus * (focus - view.height / 2);
  }

  // The point on the sphere under the pointer, or null off the globe.
  function surfaceAt(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width) return null;
    const scale = view.width / rect.width;
    const radius = view.baseRadius * state.zoom * state.scale;
    const x = ((clientX - rect.left) * scale - view.width / 2) / radius;
    const y = -((clientY - rect.top) * scale - centreY(radius)) / radius;
    const distance = x * x + y * y;
    if (distance > 1) return null;
    const front = [x, y, Math.sqrt(1 - distance)];
    const m = rotationMatrix();
    return [0, 1, 2].map(
      (k) => m[0][k] * front[0] + m[1][k] * front[1] + m[2][k] * front[2],
    );
  }

  function addRipple(point) {
    ripples.data.set([...point, time], (ripples.next++ % MAX_RIPPLES) * 4);
  }

  function update(seconds) {
    time += seconds;

    if (revealStart !== null && state.reveal < 1) {
      const progress = (time - revealStart) / config.reveal.duration;
      state.reveal = easeInOutCubic(clamp(progress, 0, 1));
    }

    pointer.idle += seconds;
    if (state.locked) {
      wasLocked = true;
    } else {
      if (wasLocked) {
        // Handed back from outside: carry on from where it was left.
        state.rotationOffset = wrapToPi(
          state.rotation - idle.angle - state.returnOffset,
        );
        state.tiltOffset = state.tilt - state.restTilt;
        pointer.pending = [0, 0];
        pointer.velocity = [0, 0];
        wasLocked = false;
      }
      turnWithDrag(seconds);
      if (!reducedMotion) advanceIdle(seconds);
      state.rotation = idle.angle + state.rotationOffset + state.returnOffset;
      state.tilt = clampTilt(state.restTilt + state.tiltOffset);
    }

    if (!state.locked)
      state.zoom +=
        (state.zoomTarget - state.zoom) * Math.min(1, seconds * 2.2);

    const hovering =
      pointer.over && !pointer.dragging && config.interactive.hover ? 1 : 0;
    pointer.hover += (hovering - pointer.hover) * Math.min(1, seconds * 8);
    followCursor(seconds);
  }

  // The tracked point eases after the cursor over the sphere and drops a
  // sample on the trail every TRAIL_STEP; samples fade out as they age.
  function followCursor(seconds) {
    const { hoverFollow, hoverFade } = config.interactive;
    if (pointer.hover > 0.01) {
      const target = pointer.surface;
      if (!pointer.tracked) pointer.tracked = [...target];
      const share = 1 - Math.pow(1 - hoverFollow, seconds * 60);
      const next = pointer.tracked.map(
        (value, k) => value + (target[k] - value) * share,
      );
      const length = Math.hypot(...next) || 1;
      pointer.tracked = next.map((value) => value / length);
      if (time - trail.lastSample >= TRAIL_STEP) {
        trail.points.unshift({
          point: pointer.tracked,
          time,
          hover: pointer.hover,
        });
        trail.points.length = Math.min(trail.points.length, TRAIL_LENGTH);
        trail.lastSample = time;
      }
    } else {
      pointer.tracked = null;
    }
    trail.data.fill(0);
    trail.points.forEach(({ point, time: sampled, hover }, index) => {
      const age = time - sampled;
      const strength =
        hover * Math.exp(-age / hoverFade) * (1 - index / TRAIL_LENGTH);
      trail.data.set([...point, strength], index * 4);
    });
  }

  // The globe has weight: it follows the drag with a short delay, and the
  // speed it had when let go carries on as momentum.
  function turnWithDrag(seconds) {
    const [pendingX, pendingY] = pointer.pending;
    if (!pendingX && !pendingY) return;
    const share = 1 - Math.exp(-seconds / config.interactive.dragWeight);
    const turn = [pendingX * share, pendingY * share];
    state.rotationOffset += turn[0];
    addTilt(turn[1]);
    pointer.pending = pointer.pending.map((left, index) =>
      Math.abs(left - turn[index]) < 1e-5 ? 0 : left - turn[index],
    );
    if (seconds > 0 && pointer.dragging)
      pointer.velocity = turn.map((amount) => amount / seconds);
  }

  // Tilt stays within range by limiting the drag's part, never the rest tilt.
  function addTilt(amount) {
    const tilt = clampTilt(state.restTilt + state.tiltOffset + amount);
    state.tiltOffset = tilt - state.restTilt;
  }

  // Without a hand on it the globe sways around Europe or turns round, the
  // drag's momentum coasts out and what a drag added eases back.
  function advanceIdle(seconds) {
    const dragging = pointer.dragging;
    const coasting = !dragging && pointer.idle < IDLE_RETURN;
    const back =
      dragging || coasting ? 0 : Math.min(1, (pointer.idle - IDLE_RETURN) / 3);

    if (config.motion === "round") {
      idle.angle += config.roundSpeed * seconds * back;
    } else if (config.motion === "europe") {
      // The sway is a fixed function of time; while a hand is on the globe
      // the drag offset absorbs it, so the globe holds still under it.
      const target = swayTarget();
      if (dragging || coasting) state.rotationOffset -= target - idle.angle;
      idle.angle = target;
    }

    if (coasting) {
      const coast = Math.exp(-seconds / config.interactive.dragMomentum);
      pointer.velocity = pointer.velocity.map((speed) => speed * coast);
      if (!pointer.pending[0] && !pointer.pending[1]) {
        state.rotationOffset += pointer.velocity[0] * seconds;
        addTilt(pointer.velocity[1] * seconds);
      }
    }

    const ease = seconds * 0.8;
    if (config.motion === "europe") {
      state.rotationOffset -= state.rotationOffset * ease * back;
      state.returnOffset -= state.returnOffset * ease;
    }
    if (config.motion !== "none")
      state.tiltOffset -= state.tiltOffset * ease * back;
  }

  function draw() {
    const radius = view.baseRadius * state.zoom * state.scale;
    const m = rotationMatrix();
    const pulsesOn = config.pulse.enabled && !reducedMotion;

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (state.reveal <= 0 && revealStart === null) return;

    gl.useProgram(program);
    gl.bindVertexArray(geometry.vao);
    gl.uniformMatrix3fv(uniforms.uRotation, false, [
      m[0][0],
      m[1][0],
      m[2][0],
      m[0][1],
      m[1][1],
      m[2][1],
      m[0][2],
      m[1][2],
      m[2][2],
    ]);
    gl.uniform2f(uniforms.uResolution, view.width, view.height);
    gl.uniform2f(uniforms.uCentre, view.width / 2, centreY(radius));
    gl.uniform1f(uniforms.uRadius, radius);
    gl.uniform1f(uniforms.uDot, ((radius * Math.PI) / ROWS) * config.dotScale);
    gl.uniform1f(uniforms.uTime, time);
    gl.uniform1f(uniforms.uReveal, state.reveal);
    gl.uniform4fv(uniforms.uTrail, trail.data);
    gl.uniform1f(
      uniforms.uHoverRadius,
      config.interactive.hoverRadius / Math.max(radius, 1),
    );
    gl.uniform1f(uniforms.uContext, config.contextOpacity);
    gl.uniform1f(uniforms.uLimb, config.limbFade);
    gl.uniform1f(uniforms.uPulseOn, pulsesOn ? 1 : 0);
    gl.uniform1f(uniforms.uPulseInterval, config.pulse.interval);
    gl.uniform1f(uniforms.uPulseReach, config.pulse.maxAngle * RAD);
    gl.uniform1f(uniforms.uPulseWidth, config.pulse.width * RAD);
    gl.uniform1f(uniforms.uPulseStrength, config.pulse.strength);
    gl.uniform1f(
      uniforms.uPulseCos,
      Math.cos(
        Math.min(
          Math.PI,
          (config.pulse.maxAngle + 3 * config.pulse.width) * RAD,
        ),
      ),
    );
    gl.uniform4fv(uniforms.uSources, sources.data);
    gl.uniform1i(uniforms.uSourceCount, sources.count);
    gl.uniform4fv(uniforms.uRipples, ripples.data);
    gl.uniform3fv(uniforms.uDotColor, colors.dot);
    gl.uniform3fv(uniforms.uSelectedColor, colors.selected);
    gl.uniform1f(uniforms.uSelectedPulse, config.pulse.selectedStrength);
    gl.uniform1f(uniforms.uContextPulse, config.pulse.contextStrength);
    gl.uniform3fv(uniforms.uPulseColor, colors.pulse);
    gl.uniform1f(uniforms.uDpr, view.dpr);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, cells.count);
  }

  function frame(now) {
    frameRequest = 0;
    if (!running) return;
    const seconds = lastFrame ? Math.min(0.12, (now - lastFrame) / 1000) : 0;
    lastFrame = now;
    update(seconds);
    draw();
    frameRequest = requestAnimationFrame(frame);
  }

  function start() {
    if (running || gl.isContextLost()) return;
    running = true;
    lastFrame = 0;
    frameRequest = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(frameRequest);
    frameRequest = 0;
  }

  // -----------------------------------------
  // INTERACTION
  // -----------------------------------------
  // Listens on `config.interactionTarget` (the canvas by default), so the
  // globe can sit behind content: text, links and buttons keep the pointer,
  // the rest of the area drags the globe.
  const target = config.interactionTarget || canvas;
  const blocked = (element) =>
    element instanceof Element && element.closest(config.passThrough);
  const touch = { id: null, x: 0, y: 0, axis: null };

  function onPointerMove(event) {
    if (event.pointerType === "touch") return onTouchMove(event);
    if (pointer.dragging) {
      drag(
        event.clientX - pointer.x,
        event.clientY - pointer.y,
        config.interactive.dragTilt,
      );
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      return;
    }
    const surface = blocked(event.target)
      ? null
      : surfaceAt(event.clientX, event.clientY);
    pointer.over = !!surface;
    if (surface) pointer.surface = surface;
  }

  function onPointerDown(event) {
    if (blocked(event.target)) return;
    if (!surfaceAt(event.clientX, event.clientY)) return;
    if (event.pointerType === "touch") {
      Object.assign(touch, {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        axis: null,
      });
      return;
    }
    if (!config.interactive.drag || event.button !== 0) return;
    event.preventDefault(); // no text selection while dragging
    pointer.dragging = true;
    pointer.moved = false;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    target.setPointerCapture?.(event.pointerId);
  }

  function onPointerUp(event) {
    if (event.pointerType === "touch") {
      const tapped = touch.id === event.pointerId && !touch.axis;
      touch.id = null;
      if (tapped) ripple(event);
      return;
    }
    const wasDragging = pointer.dragging;
    pointer.dragging = false;
    if (wasDragging && !pointer.moved) ripple(event);
  }

  // On touch, a mostly horizontal swipe turns the globe; anything else is
  // left alone so the page scrolls.
  function onTouchMove(event) {
    if (touch.id !== event.pointerId) return;
    const dx = event.clientX - touch.x;
    const dy = event.clientY - touch.y;
    if (!touch.axis && Math.hypot(dx, dy) > 8)
      touch.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
    if (touch.axis !== "x" || !config.interactive.drag) return;
    drag(dx, 0, false);
    touch.x = event.clientX;
    touch.y = event.clientY;
  }

  function drag(dx, dy, withTilt) {
    const { dragSpeed } = config.interactive;
    pointer.pending[0] += dx * dragSpeed;
    if (withTilt) pointer.pending[1] += dy * dragSpeed * 0.8;
    pointer.idle = 0;
    pointer.moved = true;
  }

  function ripple(event) {
    if (!config.interactive.clickRipple || blocked(event.target)) return;
    const surface = surfaceAt(event.clientX, event.clientY);
    if (surface) addRipple(surface);
  }

  function onPointerLeave() {
    pointer.over = false;
  }

  const listeners = [
    ["pointermove", onPointerMove],
    ["pointerdown", onPointerDown],
    ["pointerup", onPointerUp],
    ["pointercancel", onPointerUp],
    ["pointerleave", onPointerLeave],
  ];
  listeners.forEach(([type, listener]) =>
    target.addEventListener(type, listener),
  );

  // -----------------------------------------
  // LIFECYCLE
  // -----------------------------------------
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  const visibility =
    config.pauseOffscreen &&
    new IntersectionObserver(([entry]) =>
      entry.isIntersecting ? start() : stop(),
    );
  if (visibility) visibility.observe(container);

  function onContextLost(event) {
    event.preventDefault();
    stop();
  }
  canvas.addEventListener("webglcontextlost", onContextLost);

  resize();
  state.zoom = state.zoomTarget;
  idle.mode = config.motion;
  if (!visibility) start();

  return {
    state, // { zoom, tilt, rotation (radians), reveal, locked }
    get config() {
      return config;
    },
    // Build the globe up from the middle; immediate with reduced motion.
    reveal() {
      if (revealStart !== null) return;
      revealStart = time;
      if (reducedMotion) state.reveal = 1;
      if (!running) draw();
    },
    // Change any option live, e.g. set({ pulse: { interval: 14 } }).
    set(changes) {
      config = merge(config, changes);
      syncMotion();
      resize();
      // What is left of a turn back to Europe, for scroll to scrub down.
      return state.returnOffset;
    },
    ripple(lat, lon) {
      addRipple(toVector(lat, lon));
    },
    pause: stop,
    resume: start,
    destroy() {
      stop();
      resizeObserver.disconnect();
      if (visibility) visibility.disconnect();
      listeners.forEach(([type, listener]) =>
        target.removeEventListener(type, listener),
      );
      canvas.removeEventListener("webglcontextlost", onContextLost);
      geometry.buffers.forEach((buffer) => gl.deleteBuffer(buffer));
      gl.deleteVertexArray(geometry.vao);
      gl.deleteProgram(program);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      canvas.remove();
    },
  };
}

// -----------------------------------------
// CELLS
// -----------------------------------------

let cellCache = null;

// Only land cells go to the GPU (~14,000): position on the unit sphere,
// plus the country code and a random number for the reveal.
function readCells() {
  if (cellCache) return cellCache;
  const bytes = atob(CELLS);
  const positions = [];
  const details = [];
  let index = 0;
  for (let row = 0; row < ROWS; row++) {
    const lat = -90 + ((row + 0.5) * 180) / ROWS;
    const count = Math.max(1, Math.round(2 * ROWS * Math.cos(lat * RAD)));
    for (let column = 0; column < count; column++, index++) {
      const code = (bytes.charCodeAt(index >> 1) >> ((index & 1) * 4)) & 15;
      if (!code) continue;
      const lon = -180 + ((column + 0.5) * 360) / count;
      positions.push(...toVector(lat, lon));
      details.push(code, Math.random());
    }
  }
  cellCache = {
    positions: new Float32Array(positions),
    details: new Float32Array(details),
    count: positions.length / 3,
  };
  return cellCache;
}

function createGeometry(gl, cells) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const attribute = (data, location, size, perInstance) => {
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
    if (perInstance) gl.vertexAttribDivisor(location, 1);
    return buffer;
  };
  const buffers = [
    attribute(new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), 0, 2, false),
    attribute(cells.positions, 1, 3, true),
    attribute(cells.details, 2, 2, true),
  ];
  return { vao, buffers };
}

// -----------------------------------------
// SHADERS
// -----------------------------------------

const VERTEX_SHADER = /* glsl */ `#version 300 es
precision highp float;
layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec3 aPosition;
layout(location = 2) in vec2 aDetails; // country code, random

uniform mat3 uRotation;
uniform vec2 uResolution, uCentre;
uniform float uRadius, uDot, uTime, uReveal, uHoverRadius, uContext, uLimb;
uniform float uPulseOn, uPulseInterval, uPulseReach, uPulseWidth, uPulseStrength;
uniform float uPulseCos; // cells further than a pulse ever reaches skip it
uniform int uSelected, uSourceCount;
uniform vec4 uSources[${MAX_SOURCES}]; // xyz = point, w = phase in seconds
uniform vec4 uRipples[${MAX_RIPPLES}]; // xyz = point, w = start time
uniform vec4 uTrail[${TRAIL_LENGTH}]; // xyz = point, w = strength
uniform vec3 uDotColor, uSelectedColor, uPulseColor;
uniform float uSelectedPulse, uContextPulse;

out vec2 vLocal;
out float vRadius;
out vec4 vColor;

void main() {
  vec3 q = uRotation * aPosition;
  // The back is never drawn: skip it before any of the work below.
  if (q.z <= 0.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  int code = int(aDetails.x + 0.5);
  bool selected = code < 8 && ((uSelected >> (code - 1)) & 1) == 1;
  vec2 centre = uCentre + uRadius * vec2(q.x, -q.y);

  // Reveal: from the middle of the globe outwards, a little scattered.
  float fromMiddle = length(centre - uCentre) / uRadius;
  float appear = clamp((uReveal * 1.5 - fromMiddle * 0.9 - aDetails.y * 0.25) / 0.3, 0.0, 1.0);

  // Smaller towards the edge, following the curve; fading out at the limb.
  float radius = uDot * (0.42 + 0.58 * sqrt(max(q.z, 0.0))) * appear;
  float limb = smoothstep(0.0, uLimb, q.z);
  float alpha = (selected ? 1.0 : uContext) * limb;

  // Pulses: rings travelling out over the surface from each source.
  float wave = 0.0;
  if (uPulseOn > 0.5) {
    for (int i = 0; i < ${MAX_SOURCES}; i++) {
      if (i >= uSourceCount) break;
      float c = dot(aPosition, uSources[i].xyz);
      if (c < uPulseCos) continue;
      float t = mod(uTime + uSources[i].w, uPulseInterval) / uPulseInterval;
      float d = acos(min(c, 1.0)) - t * uPulseReach;
      wave = max(wave, exp(-pow(d / uPulseWidth, 2.0)) * (1.0 - t));
    }
  }
  // Click ripples: faster, gone within ${RIPPLE_LIFE} seconds.
  for (int i = 0; i < ${MAX_RIPPLES}; i++) {
    float age = uTime - uRipples[i].w;
    if (age < 0.0 || age > ${RIPPLE_LIFE.toFixed(1)}) continue;
    float c = dot(aPosition, uRipples[i].xyz);
    if (c < cos(age * 0.32 + 0.1)) continue;
    float d = acos(min(c, 1.0)) - age * 0.32;
    wave = max(wave, exp(-pow(d / 0.028, 2.0)) * (1.0 - age / ${RIPPLE_LIFE.toFixed(1)}));
  }
  wave *= selected ? uSelectedPulse : uContextPulse;

  // Hover trail: cells near the cursor light up, then fade.
  float lens = 0.0;
  float hoverCos = cos(uHoverRadius);
  for (int i = 0; i < ${TRAIL_LENGTH}; i++) {
    if (uTrail[i].w <= 0.0) continue;
    float c = dot(aPosition, uTrail[i].xyz);
    if (c < hoverCos) continue;
    float near = 1.0 - acos(min(c, 1.0)) / uHoverRadius;
    lens = max(lens, near * uTrail[i].w);
  }

  vec3 color = mix(selected ? uSelectedColor : uDotColor, uPulseColor, clamp(wave * uPulseStrength + lens * 0.2, 0.0, 1.0));
  alpha = max(alpha, 0.95 * max(wave, lens) * appear * limb);
  radius *= 1.0 + 0.28 * wave + 0.3 * lens;

  vRadius = radius;
  vColor = vec4(color, alpha);
  vLocal = aCorner * (radius * 1.4 + 1.0);
  vec2 pixel = centre + vLocal;
  gl_Position = vec4(pixel / uResolution * 2.0 - 1.0, 0.0, 1.0);
  gl_Position.y = -gl_Position.y;
  if (alpha <= 0.003 || radius <= 0.05) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}`;

const FRAGMENT_SHADER = /* glsl */ `#version 300 es
precision highp float;
in vec2 vLocal;
in float vRadius;
in vec4 vColor;
uniform float uDpr;
out vec4 outColor;

void main() {
  float edge = length(vLocal) - vRadius;
  float alpha = clamp(0.5 - edge * uDpr * 0.75, 0.0, 1.0) * vColor.a;
  outColor = vec4(vColor.rgb * alpha, alpha);
}`;

function createProgram(gl, vertexSource, fragmentSource) {
  const compile = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
      throw new Error(gl.getShaderInfoLog(shader));
    return shader;
  };
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSource));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSource));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS))
    throw new Error(gl.getProgramInfoLog(program));
  return program;
}

function getUniforms(gl, program) {
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
  const uniforms = {};
  for (let i = 0; i < count; i++) {
    const name = gl.getActiveUniform(program, i).name.replace("[0]", "");
    uniforms[name] = gl.getUniformLocation(program, name);
  }
  return uniforms;
}

// -----------------------------------------
// HELPERS
// -----------------------------------------

function toVector(lat, lon) {
  const cosLat = Math.cos(lat * RAD);
  return [
    cosLat * Math.sin(lon * RAD),
    Math.sin(lat * RAD),
    cosLat * Math.cos(lon * RAD),
  ];
}

function angleBetween(a, b) {
  return Math.acos(clamp(a[0] * b[0] + a[1] * b[1] + a[2] * b[2], -1, 1));
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const wrapToPi = (angle) =>
  angle - Math.round(angle / (2 * Math.PI)) * 2 * Math.PI;
const clampTilt = (tilt) =>
  clamp(tilt, TILT_RANGE[0] * RAD, TILT_RANGE[1] * RAD);
const easeInOutCubic = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

function hexToRgb(hex) {
  const value = parseInt(hex.replace("#", ""), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255].map(
    (channel) => channel / 255,
  );
}

// Deep merge for plain objects; arrays and functions are replaced.
function merge(base, changes = {}) {
  const result = { ...base };
  Object.entries(changes).forEach(([key, value]) => {
    if (value === undefined) return;
    const nested =
      isPlainObject(value) &&
      isPlainObject(base[key]) &&
      !(value instanceof Element);
    result[key] = nested ? merge(base[key], value) : value;
  });
  return result;
}

const isPlainObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
