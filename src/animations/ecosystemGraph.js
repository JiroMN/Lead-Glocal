// ─────────────────────────────────────────────────────────────────────────────
// Ecosystem Graph — reusable node-and-line diagram component.
// ─────────────────────────────────────────────────────────────────────────────
// One graph = a wrap element with child "node" elements. Connecting lines
// (SVG paths) are drawn between nodes live, following whatever transform the
// nodes happen to have (state transitions + inertia push).
//
// States: "architect" | "builder" | "manager" (extendable via the STATES map).
// Each state defines node positions (as 0-1 fractions of the wrap) and which
// node pairs connect with lines, plus line style.
//
// Public API (imported in index.js):
//   initEcosystemGraphs(next)         — init all [data-ecosystem-graph] in scope
//   setEcosystemGraphState(name)      — switch every initialized graph to this
//                                        state (e.g. "architect" → "builder")
//
// Expected HTML (build in Webflow):
//   <div data-ecosystem-graph>
//     <div data-ecosystem-graph-node></div>
//     <div data-ecosystem-graph-node></div>
//     <div data-ecosystem-graph-node></div>
//     <div data-ecosystem-graph-node></div>
//     <div data-ecosystem-graph-node></div>
//   </div>
// The SVG layer is injected automatically — don't add it in Webflow.
// ─────────────────────────────────────────────────────────────────────────────

import { getVariableValue } from "../utils/helpers";

const SVG_NS = "http://www.w3.org/2000/svg";

// ---- State configuration ---------------------------------------------------
// Positions are fractions (0–1) of the wrap width/height.
// `lines` are pairs of node indices that should be connected.
// Tweak these per design, add more states (e.g. "monitor") just by adding a
// key here — the rest of the code handles it.
// 6 nodes total — same connections in every state, only positions and line
// styling change. Metaphor: the connections always exist, they just become
// more visible / structured as the role evolves.
//
//   0           1        ← upper-left, upper-right

// 2       3       4      ← mid-left, center hub, mid-right

//           5            ← lower-center
//
// Connections are adjacent only — no crossings.
const LINES = [
  [0, 1], // top row
  [0, 2], // left vertical
  [0, 3], // top-left → center
  [1, 3], // top-right → center
  [1, 4], // right vertical
  [2, 3], // mid-left → center
  [3, 4], // center → mid-right
  [2, 5], // mid-left → bottom
  [3, 5], // center → bottom
  [4, 5], // mid-right → bottom
];

const STATES = {
  architect: {
    nodes: [
      { x: 0.28, y: 0.2 }, // 0 upper-left
      { x: 0.72, y: 0.18 }, // 1 upper-right
      { x: 0.18, y: 0.55 }, // 2 mid-left
      { x: 0.5, y: 0.48 }, // 3 center hub
      { x: 0.82, y: 0.55 }, // 4 mid-right
      { x: 0.5, y: 0.85 }, // 5 lower-center
    ],
    lineOpacity: 0.1,
    lineWidth: 1,
    particleOpacity: 0,
  },
  builder: {
    // One-step clockwise rotation of the perimeter, plus an extra ~15° of
    // angular drift around the center so nodes overshoot the "swap" spot —
    // gives the eye a sense of motion rather than discrete swapping. Center
    // hub (3) stays put.
    nodes: [
      { x: 0.63, y: 0.13 }, // 0 → past upper-right
      { x: 0.82, y: 0.47 }, // 1 → past mid-right
      { x: 0.21, y: 0.27 }, // 2 → past upper-left
      { x: 0.5, y: 0.48 }, // 3 center hub (unchanged)
      { x: 0.59, y: 0.84 }, // 4 → past lower-center
      { x: 0.2, y: 0.63 }, // 5 → past mid-left
    ],
    lineOpacity: 0.85,
    lineWidth: 1.25,
    particleOpacity: 0,
  },
  manager: {
    // Forked from builder — keeps the same rotated character and roughly
    // ~10% tighter, but coordinates snap onto shared axes so pairs read
    // as deliberate alignments instead of organic spread:
    //   x=0.6  : nodes 0 and 4   (vertical axis right of center)
    //   x=0.22 : nodes 2 and 5   (vertical axis on the left)
    //   y=0.5  : nodes 1 and 3   (horizontal axis through middle)
    nodes: [
      { x: 0.6, y: 0.17 }, // 0
      { x: 0.78, y: 0.5 }, // 1
      { x: 0.22, y: 0.3 }, // 2
      { x: 0.5, y: 0.5 }, // 3 center hub
      { x: 0.6, y: 0.83 }, // 4
      { x: 0.22, y: 0.62 }, // 5
    ],
    lineOpacity: 1.0,
    lineWidth: 1.25,
    particleOpacity: 1,
  },
};

// ---- Particle config -------------------------------------------------------
// Tiny accent-colored dots that travel along lines. Only visible in states
// where particleOpacity > 0 (manager state by default). Group opacity is
// animated, individual particles always render — cheap.
//
// One particle per LINE (so arrivals are predictable, not chaotic). Each
// particle bounces between its two endpoints — pulse on either side.
const PARTICLE_RADIUS = 4;
const PARTICLE_MIN_SPEED = 0.0015; // progress per frame
const PARTICLE_MAX_SPEED = 0.003;
// Cooldown per node so rapid arrivals don't pop-pop-pop. Below this gap
// extra arrivals are silently swallowed — the pulse you DO see correlates
// 1:1 with a particle visibly hitting the node.
const PULSE_COOLDOWN = 450;

// Global registry of initialized graphs, so setEcosystemGraphState can reach
// all of them at once.
const graphs = [];

// ---- Public API ------------------------------------------------------------

export function initEcosystemGraphs(next = document) {
  const els = next.querySelectorAll("[data-ecosystem-graph]");
  els.forEach((el) => {
    if (el.__egInit) return; // guard: double-init (e.g. Barba re-entry)
    el.__egInit = true;
    graphs.push(createGraph(el));
  });
}

export function setEcosystemGraphState(name) {
  graphs.forEach((g) => g.setState(name));
}

// ---- Internal --------------------------------------------------------------

function createGraph(wrap) {
  const nodes = Array.from(
    wrap.querySelectorAll("[data-ecosystem-graph-node]"),
  );
  if (!nodes.length) return { setState: () => {} };

  // Ensure wrap is a positioning context (so absolute children align).
  if (getComputedStyle(wrap).position === "static") {
    wrap.style.position = "relative";
  }

  // Inject the SVG layer for lines. Done once per graph.
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("data-ecosystem-graph-lines", "");
  svg.style.cssText =
    "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible;";
  wrap.insertBefore(svg, wrap.firstChild);

  // Nodes are positioned by transform x/y in pixels, centered on their point
  // via xPercent/yPercent so you don't have to offset them by their own size.
  gsap.set(nodes, {
    position: "absolute",
    left: 0,
    top: 0,
    xPercent: -50,
    yPercent: -50,
    x: 0,
    y: 0,
  });

  let currentState = null;
  let transitioning = false;
  let wrapW = 0;
  let wrapH = 0;

  // Paths are built ONCE at init using the constant LINES array. Per state we
  // only animate their stroke-width and opacity; the connections themselves
  // never change.
  const pathEls = LINES.map(([from, to]) => {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("fill", "none");
    path.setAttribute("stroke-linecap", "round");
    svg.appendChild(path);
    return { el: path, from, to };
  });

  // ---- Particles ----------------------------------------------------------
  // Group keeps a single opacity tween affecting all particles at once.
  // Each particle picks a random line + progress + speed at init; in
  // renderLines it moves along the line and wraps around at progress >= 1.
  const accentColor = getVariableValue("--_colors---accent") || "currentColor";
  const particleGroup = document.createElementNS(SVG_NS, "g");
  particleGroup.setAttribute("data-ecosystem-graph-particles", "");
  particleGroup.style.opacity = "0";
  svg.appendChild(particleGroup);

  // One particle per line — bouncing between endpoints. Random initial
  // progress + speed + direction so arrivals aren't synchronized.
  const particles = LINES.map((_, lineIdx) => {
    const c = document.createElementNS(SVG_NS, "circle");
    c.setAttribute("r", PARTICLE_RADIUS);
    c.setAttribute("fill", accentColor);
    c.style.filter = `drop-shadow(0 0 4px ${accentColor})`;
    particleGroup.appendChild(c);
    return {
      el: c,
      lineIdx,
      progress: Math.random(),
      speed:
        PARTICLE_MIN_SPEED +
        Math.random() * (PARTICLE_MAX_SPEED - PARTICLE_MIN_SPEED),
      direction: Math.random() < 0.5 ? 1 : -1,
    };
  });

  function applyState(stateName, duration = 0.8) {
    const state = STATES[stateName];
    if (!state) return;
    currentState = stateName;
    wrap.setAttribute("data-ecosystem-graph-state", stateName);

    // Animate node positions to the new state.
    state.nodes.forEach((pos, i) => {
      const node = nodes[i];
      if (!node) return;
      // Clear inertia lock — `overwrite: true` below kills any in-flight
      // inertia tween, but its onComplete won't fire, so we'd leak the lock.
      node.__inertiaActive = false;
      const targetX = pos.x * wrapW;
      const targetY = pos.y * wrapH;
      if (duration === 0) {
        gsap.set(node, { x: targetX, y: targetY });
      } else {
        gsap.to(node, {
          x: targetX,
          y: targetY,
          duration,
          ease: "power3.inOut",
          overwrite: true,
        });
      }
    });

    // Animate line styling (opacity + width) to match the new state.
    pathEls.forEach(({ el }) => {
      if (duration === 0) {
        gsap.set(el, {
          attr: { "stroke-width": state.lineWidth, opacity: state.lineOpacity },
        });
      } else {
        gsap.to(el, {
          attr: { "stroke-width": state.lineWidth, opacity: state.lineOpacity },
          duration,
          ease: "power3.inOut",
        });
      }
    });

    // Fade the particle group in/out per state.
    const targetParticleOpacity = state.particleOpacity ?? 0;
    if (duration === 0) {
      gsap.set(particleGroup, { opacity: targetParticleOpacity });
    } else {
      gsap.to(particleGroup, {
        opacity: targetParticleOpacity,
        duration,
        ease: "power3.inOut",
      });
    }
  }

  function layout() {
    const r = wrap.getBoundingClientRect();
    wrapW = r.width;
    wrapH = r.height;
    if (currentState) applyState(currentState, 0);
  }

  // Per-frame path rendering. Reads each node's current bounding box and
  // writes the resulting `d` attribute for each path. Works regardless of
  // whether the node moved via GSAP transition, inertia push, or CSS resize.
  function renderLines() {
    if (!pathEls.length) return;
    const wrapRect = wrap.getBoundingClientRect();
    const n = nodes.length;
    const cx = new Array(n);
    const cy = new Array(n);
    for (let i = 0; i < n; i++) {
      const r = nodes[i].getBoundingClientRect();
      cx[i] = r.left - wrapRect.left + r.width / 2;
      cy[i] = r.top - wrapRect.top + r.height / 2;
    }
    for (let i = 0; i < pathEls.length; i++) {
      const { el, from, to } = pathEls[i];
      el.setAttribute("d", `M ${cx[from]} ${cy[from]} L ${cx[to]} ${cy[to]}`);
    }

    // Advance + position particles. Each particle bounces between its
    // line's endpoints — pulse whichever node it just hit, so both ends
    // of every line get equal love and arrivals are 1:1 with pops.
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.progress += p.speed * p.direction;
      if (p.progress >= 1) {
        p.progress = 1;
        p.direction = -1;
        pulseNode(LINES[p.lineIdx][1]);
      } else if (p.progress <= 0) {
        p.progress = 0;
        p.direction = 1;
        pulseNode(LINES[p.lineIdx][0]);
      }
      const [from, to] = LINES[p.lineIdx];
      const x = cx[from] + (cx[to] - cx[from]) * p.progress;
      const y = cy[from] + (cy[to] - cy[from]) * p.progress;
      p.el.setAttribute("cx", x);
      p.el.setAttribute("cy", y);
    }
  }

  // Subtle scale-bump on a node — only fires when particles are visible
  // (i.e. manager state). Cooldown-based: arrivals within PULSE_COOLDOWN
  // ms are silently dropped so the eye can match each pop to a particle
  // landing rather than seeing pop-pop-pop chaos.
  function pulseNode(idx) {
    const node = nodes[idx];
    if (!node) return;
    // Only pulse when particles are actually visible — avoids invisible
    // pops in architect/builder.
    if (parseFloat(particleGroup.style.opacity || "0") < 0.05) return;
    const now = performance.now();
    if (node.__pulseUntil && node.__pulseUntil > now) return;
    node.__pulseUntil = now + PULSE_COOLDOWN;
    gsap.to(node, {
      scale: 1.1,
      duration: 0.2,
      ease: "power3.inOut",
      onComplete() {
        gsap.to(node, {
          scale: 1,
          duration: 0.35,
          ease: "power3.inOut",
        });
      },
    });
  }
  gsap.ticker.add(renderLines);

  // Auto-relayout on wrap size changes (window resize, Barba reset, etc).
  const resizeObserver = new ResizeObserver(layout);
  resizeObserver.observe(wrap);

  // ---- Inertia on mouse proximity ------------------------------------------
  // When the mouse moves fast near a node, push it away with momentum and
  // elastic-return to the current state's target position.
  // Disabled during state-transition windows to avoid target conflicts.
  const THRESHOLD = 200; // px distance from cursor to node center to trigger a push
  const SPEED_TRIGGER = 100; // mouse speed (px/s) needed to trigger a push
  const MAX_SPEED = 5000; // cap mouse velocity so flicks don't fling nodes off
  const VELOCITY_SCALE = 0.1; // how much of mouse velocity transfers to nodes
  const RESISTANCE = 1300; // higher = stops sooner = shorter push distance
  let lastX = 0;
  let lastY = 0;
  let lastT = 0;

  function onMove(e) {
    if (transitioning) return;
    if (typeof InertiaPlugin === "undefined") return; // plugin not loaded

    const now = performance.now();
    const dt = now - lastT || 16;
    let vx = ((e.clientX - lastX) / dt) * 1000;
    let vy = ((e.clientY - lastY) / dt) * 1000;
    lastT = now;
    lastX = e.clientX;
    lastY = e.clientY;

    let speed = Math.hypot(vx, vy);
    if (speed < SPEED_TRIGGER) return;
    if (speed > MAX_SPEED) {
      const scale = MAX_SPEED / speed;
      vx *= scale;
      vy *= scale;
    }

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (node.__inertiaActive) continue;
      const r = node.getBoundingClientRect();
      const ncx = r.left + r.width / 2;
      const ncy = r.top + r.height / 2;
      if (Math.hypot(ncx - e.clientX, ncy - e.clientY) >= THRESHOLD) continue;

      node.__inertiaActive = true;
      gsap.to(node, {
        inertia: {
          x: { velocity: vx * VELOCITY_SCALE },
          y: { velocity: vy * VELOCITY_SCALE },
          resistance: RESISTANCE,
        },
        overwrite: true, // kill any in-flight elastic-return cleanly
        onInterrupt() {
          // Push got killed (e.g. by state change). Release the lock.
          node.__inertiaActive = false;
        },
        onComplete() {
          // Push phase done — release the lock NOW so new pushes can
          // interrupt the elastic return that's about to start.
          node.__inertiaActive = false;
          const pos = STATES[currentState]?.nodes[i];
          if (!pos) return;
          gsap.to(node, {
            x: pos.x * wrapW,
            y: pos.y * wrapH,
            duration: 1.2,
            ease: "elastic.out(1, 0.6)",
            // No lock callbacks — lock is already cleared. A fresh inertia
            // push will overwrite this tween via `overwrite: true` above.
          });
        },
      });
    }
  }
  window.addEventListener("mousemove", onMove);

  // ---- Initial state -------------------------------------------------------
  layout();
  applyState("architect", 0);

  // ---- Public per-graph API ------------------------------------------------
  return {
    setState(name) {
      if (!STATES[name]) return;
      if (name === currentState) return;
      transitioning = true;
      applyState(name, 0.8);
      // Unlock inertia shortly after the transition finishes.
      gsap.delayedCall(0.85, () => {
        transitioning = false;
      });
    },
  };
}
