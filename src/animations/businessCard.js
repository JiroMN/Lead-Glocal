import { getVariableValue } from "../utils/helpers";
import { registerCleanup } from "../utils/lifecycle";
import { createCardControls } from "./businessCardControls";

const settings = {
  placeholder: { minimumTime: 1.5, close: 0.8, fadeOut: 0.6 },
  atmosphere: {
    beam: { delay: 0.2, fadeIn: 2.2 },
    glow: { delay: 0.9, fadeIn: 2, growFrom: 0.85, grow: 2.6 },
  },
  intro: {
    delay: 0.3,
    duration: 2.5,
    ease: "0.6, 0, 0.12, 1",
    fadeIn: 1.2,
    startDepth: -7,
    startHeight: -1.8,
    riseCurve: 2.2,
  },
  float: {
    fadeIn: 1.4,
    bob: { amount: 0.14, speed: 1.15 },
    sway: {
      pitch: 0.025,
      yaw: 0.04,
      roll: 0.012,
      speed: { pitch: 0.9, yaw: 0.7, roll: 0.6 },
    },
  },
  controls: {
    tapDistance: 6,
    dragSensitivity: 1.6,
    flickSpeed: 0.02,
    momentumDecay: 0.92,
    snap: 0.12,
    follow: 0.14,
    rollFollow: 0.1,
    hoverFollow: 0.08,
    hoverTilt: { x: 0.25, y: 0.35 },
  },
};

const VARIANTS = ["nfc", "qr"];
const prefersReducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const wait = (seconds) =>
  new Promise((resolve) => setTimeout(resolve, seconds * 1000));

let scenePromise = null;
const loadScene = () =>
  (scenePromise ??= import(
    /* webpackChunkName: "business-card" */ "../3d/businessCardScene"
  ));

// data-business-card-state on [data-business-card], plus a matching event:
// business-card:loading → business-card:revealing → business-card:ready
function setState(root, state) {
  root.dataset.businessCardState = state;
  root.dispatchEvent(
    new CustomEvent(`business-card:${state}`, { bubbles: true }),
  );
}

const findAtmosphere = (scope) => ({
  beam: scope.querySelector("[data-business-card-beam]"),
  glow: scope.querySelector("[data-business-card-glow]"),
});

export function prepBusinessCard(next = document) {
  const { beam, glow } = findAtmosphere(next);
  gsap.set([beam, glow].filter(Boolean), { autoAlpha: 0 });
  return loadScene();
}

export async function initBusinessCard(next = document) {
  const root = next.querySelector("[data-business-card]");
  if (!root) return;
  const placeholder = next.querySelector("[data-business-card-placeholder]");
  const placeholderShown = wait(settings.placeholder.minimumTime);
  setState(root, "loading");

  const sources = getBusinessCardSources(next);
  if (!sources) return;

  const { createBusinessCardScene } = await loadScene();
  const scene = createBusinessCardScene({
    root,
    sources,
    variant: getBusinessCardVariant(),
  });
  const controls = createCardControls(scene.canvas, settings.controls);
  const motion = { lift: 0, float: 0 };

  gsap.set(scene.canvas, { autoAlpha: 0 });

  function render(time) {
    controls.update(gsap.ticker.deltaRatio(60));
    poseCard(scene.card, motion, controls.rotation, time);
    scene.render();
  }
  gsap.ticker.add(render);

  let active = true;
  registerCleanup(() => {
    active = false;
    gsap.ticker.remove(render);
    gsap.killTweensOf([motion, scene.canvas]);
    controls.destroy();
    scene.destroy();
  });

  await Promise.all([scene.ready, placeholderShown]);
  if (active) {
    const atmosphere = findAtmosphere(next);
    reveal({ root, scene, placeholder, atmosphere, motion, controls });
  }
}

function reveal({ root, scene, placeholder, atmosphere, motion, controls }) {
  const { intro, float } = settings;
  const lift = CustomEase.create("businessCardLift", intro.ease);
  const pace = prefersReducedMotion() ? 0.15 : 1;

  setState(root, "revealing");

  const timeline = gsap
    .timeline()
    .to(scene.canvas, {
      autoAlpha: 1,
      duration: intro.fadeIn * pace,
      ease: lift,
    })
    .to(
      motion,
      { lift: 1, duration: intro.duration * pace, ease: lift },
      intro.delay * pace,
    )
    .call(() => {
      controls.enable();
      setState(root, "ready");
    })
    .to(motion, {
      float: prefersReducedMotion() ? 0 : 1,
      duration: float.fadeIn,
      ease: "sine.inOut",
    });

  if (placeholder) timeline.add(hidePlaceholder(placeholder, pace), 0);
  timeline.add(lightUp(atmosphere, pace), 0);
}

// The beam from above and the glow behind the card come up with the card.
function lightUp({ beam, glow }, pace) {
  const { atmosphere } = settings;
  const timeline = gsap.timeline();
  if (beam)
    timeline.to(
      beam,
      {
        autoAlpha: 1,
        duration: atmosphere.beam.fadeIn * pace,
        ease: "sine.inOut",
      },
      atmosphere.beam.delay * pace,
    );
  if (glow)
    timeline
      .fromTo(
        glow,
        { scale: atmosphere.glow.growFrom },
        { scale: 1, duration: atmosphere.glow.grow * pace, ease: "expo.out" },
        atmosphere.glow.delay * pace,
      )
      .to(
        glow,
        {
          autoAlpha: 1,
          duration: atmosphere.glow.fadeIn * pace,
          ease: "sine.inOut",
        },
        "<",
      );
  return timeline;
}

// The loader closes like it opened, then fades away.
function hidePlaceholder(placeholder, pace) {
  const { close, fadeOut } = settings.placeholder;
  return gsap
    .timeline()
    .to(placeholder, { width: 0, duration: close * pace })
    .to(placeholder, { autoAlpha: 0, duration: fadeOut * pace });
}

// The card slides in from far back on the horizon, rises along an exponential
// curve while tipping up to face the viewer, then floats.
function poseCard(card, { lift, float }, rotation, time) {
  const { intro, float: drift } = settings;
  const rise =
    (Math.exp(intro.riseCurve * lift) - 1) / (Math.exp(intro.riseCurve) - 1);
  const wave = (speed, amount) => Math.sin(time * speed) * amount * float;

  card.position.set(
    0,
    intro.startHeight * (1 - rise) + wave(drift.bob.speed, drift.bob.amount),
    intro.startDepth * (1 - lift),
  );
  card.rotation.set(
    (Math.PI / 2) * (1 - lift) +
      rotation.x +
      wave(drift.sway.speed.pitch, drift.sway.pitch),
    rotation.y + wave(drift.sway.speed.yaw, drift.sway.yaw),
    rotation.z + wave(drift.sway.speed.roll, drift.sway.roll),
  );
}

// -----------------------------------------
// SOURCES (hidden element in Webflow)
// -----------------------------------------

export function getBusinessCardVariant() {
  const source = new URLSearchParams(window.location.search).get("src");
  return VARIANTS.includes(source) ? source : "nfc";
}

export function getBusinessCardSources(scope = document) {
  const sources = scope.querySelector("[data-business-card-sources]");
  if (!sources) return null;

  const image = (variant, side) =>
    largestSource(
      sources.querySelector(`[data-business-card-${variant}-${side}-image]`),
    );
  const borderColor = (variant) =>
    resolveColor(
      sources.getAttribute(`data-business-card-${variant}-border-color`),
      sources,
    );

  return Object.fromEntries(
    VARIANTS.map((variant) => [
      variant,
      {
        front: image(variant, "front"),
        back: image(variant, "back"),
        borderColor: borderColor(variant),
      },
    ]),
  );
}

function largestSource(img) {
  if (!img) return null;
  const candidates = (img.getAttribute("srcset") || "")
    .split(",")
    .map((entry) => {
      const [url, width = "0"] = entry.trim().split(/\s+/);
      return { url, width: parseFloat(width) || 0 };
    });
  const largest = candidates.sort((a, b) => b.width - a.width)[0];
  return largest?.url || img.getAttribute("src");
}

function resolveColor(value, element) {
  const variable = value?.trim().match(/^var\((--[^),\s]+)/);
  return variable ? getVariableValue(variable[1], element) : value?.trim();
}
