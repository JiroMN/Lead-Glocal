import {
  CELL_KM,
  ORIGIN,
  SIZE,
  COUNTRIES,
  BOUNDS,
  RASTER,
} from "./ecosystemMapCells";

// The ecosystem map: a map of Northern Europe made of cells, in plain WebGL2.
// Projects are pins that grow out of the cells themselves, pins that would
// touch become a cluster, and the view always frames the visible projects.
//
// Every length below is in px, or in em of the map container as a string
// ("0.3em"), so it scales along with the page.
export const defaults = {
  projects: [], // { title, place, lat, lon, themes, url, logo, card }

  // Countries
  countries: COUNTRIES, // on the map, and the order in the selector
  selected: null, // null = all of them
  countrySelector: true, // the pill and the panel in the map itself
  backButton: true, // false: an own button, see onFocus and back()
  contextCountries: true, // show the countries that are not selected, faded
  contextOpacity: 0.32,

  // The grid. The cells are fixed in the geography, in sizes of 4, 6, 8, 12,
  // 16 … 256 km. The map draws the finest size whose dots are at least
  // `target` apart on screen, and never lets them get further apart than
  // target × range. On narrow containers the target follows the width
  // (width ÷ widthDivisor), never below `min`.
  dot: { target: 5, min: 5, widthDivisor: 58, range: 1.5, scale: 0.36 },

  colors: { dot: "#C2BFD2", accent: "#2430B8", active: "#2D1C59" },

  // Pins and clusters
  pin: { minHead: 9, headScale: 2.3, clusterScale: 1.22, mergeFactor: 2.9 },
  clusterZoom: true,

  // The crop around the visible projects
  frame: {
    top: 64, // kept free for the selector pill
    side: 22,
    bottom: 22,
    marginKm: 35,
    marginFraction: 0.1,
    minExtentKm: 160,
    // "projects": the crop follows the projects in view, in a rounded shape.
    // "countries": the crop is the selected countries, whole; a country is
    // only cut, softly, where it runs out of the container.
    fit: "projects",
    // A country with projects in view that is no larger than this is always
    // shown whole (the Netherlands, Belgium, Denmark), never cut to the
    // projects alone.
    wholeCountryKm: 450,
  },

  // Pulses from the pins
  pulse: { enabled: true, interval: 10, travel: 2.8, radius: 230, strength: 0.32 },

  reveal: { enabled: true, threshold: 0.25 },
  cameraDuration: 0.9,

  labels: {
    all: "Alle landen",
    countries: "landen",
    projects: "projecten",
    back: "← Terug naar overzicht",
    empty: "Nog geen projecten binnen deze selectie",
    view: "Bekijk project",
    names: {
      NL: "Nederland",
      BE: "België",
      DE: "Duitsland",
      DK: "Denemarken",
      NO: "Noorwegen",
      SE: "Zweden",
      FI: "Finland",
    },
  },
  dprMax: 2,
  pauseOffscreen: true,

  // Own tooltips, designed in the page: an element per kind that is copied
  // for every tooltip and filled in (see fillCard below for the hooks).
  // Without them the map draws its own glass tooltip.
  tooltip: { project: null, cluster: null },

  // Shows which cell and which coordinates are under the mouse, and lists
  // where every project ended up. Click copies the coordinates.
  debug: false,

  onChange: null, // called with { countries, theme } after a change
};

// ---------------------------------------------------------------------------
// Projection: Lambert conformal conic, in km from the centre of the map.
// ---------------------------------------------------------------------------
const RAD = Math.PI / 180;
const EARTH_KM = 6371;
const conic = (() => {
  const tan = (lat) => Math.tan((Math.PI / 2 + lat) / 2);
  const south = 52 * RAD;
  const north = 64 * RAD;
  const n =
    Math.log(Math.cos(south) / Math.cos(north)) /
    Math.log(tan(north) / tan(south));
  const f = (Math.cos(south) * Math.pow(tan(south), n)) / n;
  const raw = (lon, lat) => {
    const r = f / Math.pow(tan(lat), n);
    return [r * Math.sin(n * lon), f - r * Math.cos(n * lon)];
  };
  return { n, f, raw, centre: raw(0, 57 * RAD) };
})();

export function toKm(lat, lon) {
  const [x, y] = conic.raw((lon - 14) * RAD, lat * RAD);
  return [EARTH_KM * (x - conic.centre[0]), -EARTH_KM * (y - conic.centre[1])];
}

export function toLatLon(kx, ky) {
  const x = kx / EARTH_KM + conic.centre[0];
  const y = -ky / EARTH_KM + conic.centre[1];
  const r = Math.hypot(x, conic.f - y);
  const lon = Math.atan2(x, conic.f - y) / conic.n / RAD + 14;
  const lat =
    (2 * Math.atan(Math.pow(conic.f / r, 1 / conic.n)) - Math.PI / 2) / RAD;
  return [lat, lon];
}

// ---------------------------------------------------------------------------
// The raster and its levels of detail, shared between maps.
// ---------------------------------------------------------------------------
let raster = null;
let levels = null;

function loadLevels() {
  if (levels) return levels;
  const [width, height] = SIZE;
  const packed = atob(RASTER);
  let at = 0;
  const readNumber = () => {
    let number = 0;
    let shift = 0;
    let byte;
    do {
      byte = packed.charCodeAt(at++);
      number |= (byte & 127) << shift;
      shift += 7;
    } while (byte & 128);
    return number;
  };
  raster = new Uint8Array(width * height);
  let offset = 0;
  while (at < packed.length) {
    const value = readNumber();
    const run = readNumber();
    raster.fill(value, offset, offset + run);
    offset += run;
  }

  // Per country: how many 2 km cells of it lie in each larger cell.
  const reduce = (counts, w, h, factor) => {
    const nw = Math.ceil(w / factor);
    const nh = Math.ceil(h / factor);
    const out = counts.map(() => new Uint16Array(nw * nh));
    counts.forEach((source, country) => {
      const target = out[country];
      for (let y = 0; y < h; y++) {
        const row = Math.floor(y / factor) * nw;
        for (let x = 0; x < w; x++) {
          const count = source[y * w + x];
          if (count) target[row + Math.floor(x / factor)] += count;
        }
      }
    });
    return [out, nw, nh];
  };
  levels = [];
  // A cell is land if at least 30% of it is; the country with the most of it
  // gets the cell.
  const addLevel = (name, counts, w, h, size) => {
    const land = new Uint8Array(w * h);
    const area = size * size;
    for (let cell = 0; cell < land.length; cell++) {
      let total = 0;
      let most = 0;
      let country = 0;
      for (let c = 0; c < counts.length; c++) {
        const count = counts[c][cell];
        total += count;
        if (count > most) {
          most = count;
          country = c + 1;
        }
      }
      if (total >= area * 0.3) land[cell] = country;
    }
    levels.push({ name, width: w, height: h, cell: CELL_KM * size, land });
  };
  const single = COUNTRIES.map(() => new Uint16Array(width * height));
  raster.forEach((country, cell) => {
    if (country) single[country - 1][cell] = 1;
  });
  // Two nested series: A = 4 · 2ⁿ km and B = 6 · 2ⁿ km.
  [
    ["A", 2, 256],
    ["B", 3, 192],
  ].forEach(([series, first, largestKm]) => {
    let reduced = reduce(single, width, height, first);
    let size = first;
    for (let step = 1; CELL_KM * size <= largestKm; step++) {
      addLevel(series + step, reduced[0], reduced[1], reduced[2], size);
      reduced = reduce(reduced[0], reduced[1], reduced[2], 2);
      size *= 2;
    }
  });
  levels.sort((a, b) => a.cell - b.cell);
  return levels;
}

function rasterAt(kx, ky) {
  const x = Math.floor((kx - ORIGIN[0]) / CELL_KM);
  const y = Math.floor((ky - ORIGIN[1]) / CELL_KM);
  return x < 0 || y < 0 || x >= SIZE[0] || y >= SIZE[1]
    ? 0
    : raster[y * SIZE[0] + x];
}

// The country at a place; for a place on the coast, the nearest land.
function countryAt(kx, ky) {
  const country = rasterAt(kx, ky);
  if (country) return country;
  for (let radius = 2; radius <= 30; radius += 2)
    for (let step = 0; step < 16; step++) {
      const angle = (step / 16) * 2 * Math.PI;
      const found = rasterAt(
        kx + Math.cos(angle) * radius,
        ky + Math.sin(angle) * radius,
      );
      if (found) return found;
    }
  return 0;
}

const cellOf = (level, kx, ky) => [
  Math.floor((kx - ORIGIN[0]) / level.cell),
  Math.floor((ky - ORIGIN[1]) / level.cell),
];
const cellCentre = (level, ix, iy) => [
  ORIGIN[0] + (ix + 0.5) * level.cell,
  ORIGIN[1] + (iy + 0.5) * level.cell,
];
const landAt = (level, ix, iy) =>
  ix < 0 || iy < 0 || ix >= level.width || iy >= level.height
    ? 0
    : level.land[iy * level.width + ix];

// ---------------------------------------------------------------------------
// Shaders. One program draws both the cells (uMode 0) and the pins (uMode 1).
// ---------------------------------------------------------------------------
const VERTEX_SHADER = `#version 300 es
precision highp float;
layout(location=0) in vec2 aCorner;
layout(location=1) in vec4 aA;
layout(location=2) in vec4 aB;
uniform vec2 uRes, uScr;
uniform vec3 uCam;
uniform vec4 uMask;
uniform vec2 uMaskShape;
uniform float uCellKm, uRmax, uRpin, uTime, uStart, uOut, uMode, uDotScale;
uniform float uPulseEvery, uPulseTravel, uPulseRadius, uPulseOn;
uniform float uPinMin, uPinScale, uPinCluster;
out vec2 vLocal;
out vec4 vA;
out vec4 vB;
out float vReveal, vFlash, vWave, vRadius, vAlpha;

float easeOutBack(float t) {
  float c = 1.7;
  t -= 1.;
  return 1. + t * t * ((c + 1.) * t + c);
}

void main() {
  vA = aA;
  vB = aB;
  float halfSize;
  vec2 centre;
  if (uMode < .5) {
    // A cell: aA = km x, km y, opacity, reveal delay
    //         aB = km to the nearest pin, pulse phase, selected, rim offset
    centre = uScr + (aA.xy - uCam.xy) * uCam.z;
    float radius = min(uDotScale * uCellKm * uCam.z, uRmax);
    float t = clamp((uTime - uStart - aA.w) / .7, 0., 1.);
    vReveal = t <= 0. ? 0. : easeOutBack(t);
    vFlash = sin(3.14159 * clamp(t * 1.1, 0., 1.));
    centre.y += pow(1. - t, 3.) * radius * 1.6;
    if (uOut >= 0.) {
      float gone = clamp((uTime - uOut - max(aA.w, 0.) * .2) / .45, 0., 1.);
      vReveal *= 1. - gone * gone;
    }
    // No half dots: a dot that would cut the container or the shape is left out.
    float inside = step(radius + 1., centre.x) * step(centre.x, uRes.x - radius - 1.)
      * step(radius + 1., centre.y) * step(centre.y, uRes.y - radius - 1.);
    vec2 q = (abs(centre - uMask.xy) + radius) / uMask.zw;
    float d = pow(pow(q.x, uMaskShape.x) + pow(q.y, uMaskShape.x), 1. / uMaskShape.x);
    float edge = 1. - aB.w * .07;
    // Selected cells fade from uMaskShape.y on (1 = not at all).
    float fade = 1. - smoothstep(aB.z > .5 ? uMaskShape.y : .45, edge, d);
    if (aB.z > .5 && uMaskShape.y >= 1.) fade = 1.;
    vReveal *= step(d, edge) * inside;
    vAlpha = aA.z * fade;
    float reach = aB.x * uCam.z;
    float since = mod(uTime - aB.y, uPulseEvery);
    float front = since / uPulseTravel * uPulseRadius;
    vWave = (aB.x < 0. || uPulseOn < .5 || since > uPulseTravel) ? 0.
      : exp(-pow((reach - front) / 12., 2.)) * (1. - since / uPulseTravel)
        * smoothstep(1., 1.6, uTime - uStart - aA.w);
    vRadius = radius;
    halfSize = radius * 1.6 + 1.;
  } else {
    // A pin: aA = px x, px y, morph, hover; aB = active, cluster, opacity
    centre = aA.xy;
    float head = max(uRpin * uPinScale, uPinMin) * (aB.y > .5 ? uPinCluster : 1.);
    halfSize = head * 3.8 + 6.;
    vReveal = 1.;
    vFlash = 0.;
    vWave = 0.;
    vRadius = uRpin;
    vAlpha = aB.z;
  }
  vLocal = aCorner * halfSize;
  vec2 px = centre + vLocal;
  gl_Position = vec4(px / uRes * 2. - 1., 0., 1.);
  gl_Position.y = -gl_Position.y;
}`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec2 vLocal;
in vec4 vA;
in vec4 vB;
in float vReveal, vFlash, vWave, vRadius, vAlpha;
uniform float uDpr, uMode, uPulseStrength, uPinMin, uPinScale, uPinCluster;
uniform vec3 uDotColor, uAccentColor, uActiveColor;
out vec4 color;

// Two circles and the shape between them: the drop of a pin.
float drop(vec2 p, float r1, float r2, float h) {
  if (h < .01) return length(p) - max(r1, r2);
  p.x = abs(p.x);
  float b = (r1 - r2) / h;
  float a = sqrt(max(1. - b * b, 0.));
  float k = dot(p, vec2(-b, a));
  if (k < 0.) return length(p) - r1;
  if (k > a * h) return length(p - vec2(0., h)) - r2;
  return dot(p, vec2(a, b)) - r1;
}

void main() {
  float aa = .75 / uDpr;
  if (uMode < .5) {
    float r = vRadius * vReveal * (1. + .14 * vWave);
    float a = clamp(.5 - (length(vLocal) - r) / aa * .5, 0., 1.) * step(.001, r);
    vec3 col = mix(uDotColor, uAccentColor,
      clamp(vFlash * .8 + vWave * uPulseStrength, 0., 1.));
    float alpha = a * vAlpha;
    color = vec4(col * alpha, alpha);
  } else {
    float morph = vA.z, hover = vA.w, picked = vB.x, cluster = vB.y;
    float head = max(vRadius * uPinScale, uPinMin) * (cluster > .5 ? uPinCluster : 1.)
      * (1. + .12 * hover + .08 * picked);
    float R = mix(vRadius, head, morph);
    float h = morph * head * 1.6;
    float tip = mix(vRadius, .7, morph);
    vec2 p = vec2(vLocal.x, -vLocal.y);
    float d = drop(p, tip, R, h);
    float shadowD = drop(p - vec2(.8, -2.2), tip, R, h);
    float shadow = (1. - smoothstep(-1.5, 5., shadowD)) * .22 * morph;
    float a = clamp(.5 - d / aa * .5, 0., 1.);
    float hole = length(p - vec2(0., h)) - R * .36 * smoothstep(.35, 1., morph);
    float holeA = clamp(.5 - hole / aa * .5, 0., 1.) * step(.01, morph) * (1. - cluster);
    vec3 fill = mix(mix(uDotColor, uAccentColor, smoothstep(0., .5, morph)), uActiveColor, picked);
    vec3 col = mix(fill, vec3(1.), holeA);
    color = vec4((col * a + vec3(.12, .1, .3) * shadow * (1. - a)) * vAlpha,
      max(a, shadow * (1. - a)) * vAlpha);
  }
}`;

const UNIFORMS = [
  "uRes",
  "uScr",
  "uCam",
  "uMask",
  "uMaskShape",
  "uDpr",
  "uCellKm",
  "uRmax",
  "uRpin",
  "uTime",
  "uStart",
  "uOut",
  "uMode",
  "uDotScale",
  "uPulseEvery",
  "uPulseTravel",
  "uPulseRadius",
  "uPulseOn",
  "uPulseStrength",
  "uPinMin",
  "uPinScale",
  "uPinCluster",
  "uDotColor",
  "uAccentColor",
  "uActiveColor",
];

// ---------------------------------------------------------------------------
// Styles of everything on top of the canvas, added to the page once. Sizes
// are in em, so they follow the font size of the map container.
// ---------------------------------------------------------------------------
const STYLE_ID = "ecosystem-map-style";
const CSS = `
.ecosystem-map{position:relative;user-select:none;-webkit-user-select:none}
.ecosystem-map__canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
.ecosystem-map__hits{position:absolute;inset:0;pointer-events:none;z-index:3}
.ecosystem-map__hit{position:absolute;left:0;top:0;pointer-events:auto;border:0;padding:0;background:none;cursor:pointer;border-radius:50%;display:grid;place-items:center;color:#fff;font:inherit;font-weight:700;font-size:.75em;line-height:1;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.ecosystem-map__hit span{transition:opacity .25s}
.ecosystem-map__hit:focus-visible{outline:2px solid var(--ecosystem-map-accent);outline-offset:2px}
.ecosystem-map__glass{background:rgba(246,247,255,.6);backdrop-filter:blur(14px) saturate(1.4);-webkit-backdrop-filter:blur(14px) saturate(1.4);border:1px solid rgba(255,255,255,.75);box-shadow:0 1px 0 rgba(255,255,255,.6) inset,0 .5em 1.75em -.75em rgba(36,48,184,.28)}
.ecosystem-map__selector{position:absolute;top:.625em;right:1.375em;z-index:5;display:flex;flex-direction:column;align-items:flex-end;gap:.5em;max-width:calc(100% - 2.75em);pointer-events:none}
.ecosystem-map__pill,.ecosystem-map__selector.is-open .ecosystem-map__panel{pointer-events:auto}
.ecosystem-map__pill{display:flex;align-items:center;gap:.67em;padding:.67em .93em;border-radius:.27em;font:inherit;font-size:.9375em;text-transform:uppercase;color:var(--ecosystem-map-accent);white-space:nowrap;cursor:pointer}
.ecosystem-map__pill i{width:.73em;height:.73em;border-radius:50%;background:var(--ecosystem-map-accent)}
.ecosystem-map__pill svg{width:.93em;height:.93em;transition:transform .3s}
.ecosystem-map__selector.is-open .ecosystem-map__pill svg{transform:rotate(180deg)}
.ecosystem-map__panel{border-radius:.375em;padding:.625em;display:grid;grid-template-columns:1fr 1fr;gap:.25em;min-width:16.25em;transform-origin:top right;transition:opacity .25s,transform .3s cubic-bezier(.2,.8,.2,1)}
.ecosystem-map__selector:not(.is-open) .ecosystem-map__panel{opacity:0;transform:translateY(-.375em) scale(.98);pointer-events:none}
.ecosystem-map__option{display:flex;align-items:center;gap:.64em;padding:.57em .64em;border:0;border-radius:.36em;background:none;font:inherit;font-size:.875em;color:var(--ecosystem-map-active);text-align:left;cursor:pointer}
.ecosystem-map__option:hover{background:rgba(36,48,184,.07)}
.ecosystem-map__option b{width:1em;height:1em;border-radius:50%;border:1.5px solid var(--ecosystem-map-accent);display:grid;place-items:center;flex:none;transition:background .2s}
.ecosystem-map__option b::after{content:'';width:.43em;height:.43em;border-radius:50%;background:#fff;transform:scale(0);transition:transform .2s}
.ecosystem-map__option[aria-pressed=true] b{background:var(--ecosystem-map-accent)}
.ecosystem-map__option[aria-pressed=true] b::after{transform:scale(1)}
.ecosystem-map__option small{margin-left:auto;font-size:.79em;opacity:.55}
.ecosystem-map__row{grid-column:1/-1;display:flex;gap:.375em;padding-top:.375em;margin-top:.25em;border-top:1px solid rgba(45,28,89,.1)}
.ecosystem-map__row button{border:0;font:inherit;font-size:.75em;padding:.5em .83em;border-radius:.33em;color:var(--ecosystem-map-accent);background:rgba(36,48,184,.07);cursor:pointer}
.ecosystem-map__back,.ecosystem-map__empty{position:absolute;left:1.7em;bottom:.92em;z-index:5;padding:.62em 1em;border-radius:.3em;font:inherit;font-size:.8125em;color:var(--ecosystem-map-accent);transition:opacity .25s,transform .25s}
.ecosystem-map__back{cursor:pointer}
.ecosystem-map__back[hidden],.ecosystem-map__empty[hidden]{display:block;opacity:0;transform:translateY(.4em);pointer-events:none}
.ecosystem-map__empty{pointer-events:none;color:var(--ecosystem-map-active)}
.ecosystem-map__tip{position:absolute;z-index:6;left:0;top:0;width:max-content;max-width:min(17.5em,calc(100% - 1.25em));max-height:calc(100% - 1em);overflow:auto;pointer-events:none;border-radius:.5em;padding:.625em .875em .69em .625em;display:flex;flex-direction:column;gap:.75em;opacity:0;transform:translate(-50%,-100%);transition:opacity .18s;color:var(--ecosystem-map-active)}
.ecosystem-map__tip.is-own{padding:0;border-radius:0;gap:.5em;max-width:calc(100% - 1.25em)}
.ecosystem-map__card{display:flex;gap:.69em;align-items:center}
.ecosystem-map__tip.is-on{opacity:1}
.ecosystem-map__tip.is-pinned{pointer-events:auto}
.ecosystem-map__logo{width:2.83em;height:2.83em;border-radius:50%;flex:none;display:grid;place-items:center;font-size:.75em;font-weight:600;color:#fff;background:var(--ecosystem-map-active);overflow:hidden}
.ecosystem-map__logo img{width:100%;height:100%;object-fit:cover}
.ecosystem-map__logo.is-count{background:var(--ecosystem-map-accent);font-size:.875em;width:2.43em;height:2.43em}
.ecosystem-map__title{font-size:.9375em;font-weight:600;line-height:1.2}
.ecosystem-map__place{font-size:.75em;opacity:.65;margin-top:.17em;line-height:1.35}
.ecosystem-map__link{display:inline-block;margin-top:.42em;font-size:.75em;color:var(--ecosystem-map-accent);text-decoration:none}
.ecosystem-map__debug{position:absolute;left:.5em;top:.5em;z-index:7;max-width:min(26em,calc(100% - 1em));max-height:calc(100% - 1em);overflow:auto;padding:.6em .75em;border-radius:.4em;background:rgba(20,16,40,.88);color:#fff;font:11px/1.45 ui-monospace,Menlo,monospace;pointer-events:auto;user-select:text;-webkit-user-select:text}
.ecosystem-map__debug b{color:#aab2ff;font-weight:600}
.ecosystem-map__debug i{color:#ffb4a8;font-style:normal}
.ecosystem-map__debug p{margin:0 0 .5em}
`;

function addStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}

// ---------------------------------------------------------------------------
export function createEcosystemMap(container, options = {}) {
  let config = merge(defaults, options);
  const canvas = document.createElement("canvas");
  canvas.className = "ecosystem-map__canvas";
  const gl = canvas.getContext("webgl2", {
    antialias: false,
    premultipliedAlpha: true,
    alpha: true,
  });
  if (!gl) return null;

  addStyles();
  loadLevels();
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  container.classList.add("ecosystem-map");
  container.style.setProperty("--ecosystem-map-accent", config.colors.accent);
  container.style.setProperty("--ecosystem-map-active", config.colors.active);
  container.appendChild(canvas);

  // The layers on top of the canvas.
  const layer = (tag, className, html = "") => {
    const element = document.createElement(tag);
    element.className = className;
    element.innerHTML = html;
    container.appendChild(element);
    return element;
  };
  const hits = layer("div", "ecosystem-map__hits");
  const selector = config.countrySelector
    ? layer(
        "div",
        "ecosystem-map__selector",
        `<button type="button" class="ecosystem-map__pill ecosystem-map__glass" aria-expanded="false"><i></i><span></span><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 6l4 4 4-4"/></svg></button><div class="ecosystem-map__panel ecosystem-map__glass"></div>`,
      )
    : null;
  const pill = selector?.firstChild;
  const panel = selector?.lastChild;
  const backButton = layer(
    "button",
    "ecosystem-map__back ecosystem-map__glass",
    escapeHtml(config.labels.back),
  );
  backButton.type = "button";
  backButton.hidden = true;
  // An own back button elsewhere: follow config.onFocus and call back().
  if (config.backButton === false) backButton.style.display = "none";
  const setFocused = (focused) => {
    backButton.hidden = !focused;
    config.onFocus?.(focused);
  };
  const emptyLabel = layer(
    "div",
    "ecosystem-map__empty ecosystem-map__glass",
    escapeHtml(config.labels.empty),
  );
  emptyLabel.hidden = true;
  const tip = layer("div", "ecosystem-map__tip ecosystem-map__glass");
  const debugPanel = config.debug ? layer("div", "ecosystem-map__debug") : null;

  // WebGL
  const program = gl.createProgram();
  [
    [gl.VERTEX_SHADER, VERTEX_SHADER],
    [gl.FRAGMENT_SHADER, FRAGMENT_SHADER],
  ].forEach(([type, source]) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
      console.error("ecosystemMap:", gl.getShaderInfoLog(shader));
    gl.attachShader(program, shader);
  });
  gl.linkProgram(program);
  const uniforms = Object.fromEntries(
    UNIFORMS.map((name) => [name, gl.getUniformLocation(program, name)]),
  );
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
    gl.STATIC_DRAW,
  );
  // Three sets of instances: the cells, the cells of the previous view while
  // they fade out, and the pins.
  const PINS = 2;
  const sets = [0, 1, 2].map(() => {
    const vertexArray = gl.createVertexArray();
    const buffer = gl.createBuffer();
    gl.bindVertexArray(vertexArray);
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    [1, 2].forEach((location) => {
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, 4, gl.FLOAT, false, 32, (location - 1) * 16);
      gl.vertexAttribDivisor(location, 1);
    });
    gl.bindVertexArray(null);
    return { vertexArray, buffer, count: 0, cellKm: 1 };
  });
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------
  let projects = readProjects(config.projects);
  const state = {
    selected: new Set(config.selected?.length ? config.selected : config.countries),
    theme: null,
    focus: null, // the crop of a cluster that was zoomed in on
    focusProjects: null,
    active: null, // id of the project whose pin was clicked
    opened: null, // key of a cluster that cannot split up, showing its projects
    hover: null, // key of the pin under the mouse
    started: false,
  };
  let view = null; // what is on screen: level, scale, camera, shape
  let cameraFrom = null;
  let cameraStart = 0;
  let current = 0; // which set holds the cells of this view
  let revealStart = 0;
  let fadeStart = -1;
  let clock = 0;
  let pins = [];
  let leavingPins = [];
  let width = 0;
  let height = 0;
  let dpr = 1;
  let sizes = null; // the lengths of the config in px
  let frameRequest = 0;
  let running = false;
  let lastFrame = 0;
  let colors = readColors();
  let debugCell = "";

  function readColors() {
    return {
      dot: hexToRgb(config.colors.dot),
      accent: hexToRgb(config.colors.accent),
      active: hexToRgb(config.colors.active),
    };
  }

  function readProjects(list) {
    const out = [];
    (list || []).forEach((project, id) => {
      const lat = parseFloat(project.lat);
      const lon = parseFloat(project.lon);
      const entry = {
        id,
        title: project.title || "",
        place: project.place || "",
        url: project.url || "",
        logo: project.logo || "",
        // An own card for this project (e.g. its CMS item), used as tooltip.
        card: project.card || null,
        themes: (Array.isArray(project.themes)
          ? project.themes
          : String(project.themes || "").split(",")
        )
          .map((theme) => String(theme).trim().toLowerCase())
          .filter(Boolean),
        lat,
        lon,
        onMap: false,
      };
      out.push(entry);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
      [entry.kx, entry.ky] = toKm(lat, lon);
      entry.countryIndex = countryAt(entry.kx, entry.ky);
      // Outside the countries of the map: not on this map.
      if (!entry.countryIndex) return;
      entry.country = COUNTRIES[entry.countryIndex - 1];
      entry.onMap = config.countries.includes(entry.country);
    });
    return out;
  }

  const matchesTheme = (project) =>
    !state.theme || project.themes.includes(state.theme);
  const visibleProjects = () =>
    projects.filter(
      (project) =>
        project.onMap && state.selected.has(project.country) && matchesTheme(project),
    );

  // em or px to px.
  function readSizes() {
    const em = parseFloat(getComputedStyle(container).fontSize) || 16;
    const px = (value) =>
      typeof value === "string" && value.trim().endsWith("em")
        ? parseFloat(value) * em
        : parseFloat(value) || 0;
    return {
      target: px(config.dot.target),
      min: px(config.dot.min),
      minHead: px(config.pin.minHead),
      top: px(config.frame.top),
      side: px(config.frame.side),
      bottom: px(config.frame.bottom),
      pulseRadius: px(config.pulse.radius),
    };
  }

  // -------------------------------------------------------------------------
  // The view: which crop, which level of detail, which shape
  // -------------------------------------------------------------------------
  function boundsOf(list) {
    if (state.focus) return state.focus.slice();
    const bounds = [1e9, 1e9, -1e9, -1e9];
    const grow = (x0, y0, x1, y1) => {
      bounds[0] = Math.min(bounds[0], x0);
      bounds[1] = Math.min(bounds[1], y0);
      bounds[2] = Math.max(bounds[2], x1);
      bounds[3] = Math.max(bounds[3], y1);
    };
    if (config.frame.fit === "countries") {
      // Whole countries: the selected ones, or with every country selected
      // the ones that hold a project in view.
      const everything = state.selected.size === config.countries.length;
      const codes =
        everything && list.length
          ? new Set(list.map((project) => project.country))
          : state.selected;
      codes.forEach((code) => grow(...BOUNDS[COUNTRIES.indexOf(code)]));
    } else if (list.length) {
      list.forEach(({ kx, ky }) => grow(kx, ky, kx, ky));
      // Small countries with projects are shown whole.
      new Set(list.map((project) => project.countryIndex)).forEach((index) => {
        const [west, north, east, south] = BOUNDS[index - 1];
        if (Math.max(east - west, south - north) <= config.frame.wholeCountryKm)
          grow(west, north, east, south);
      });
    } else
      state.selected.forEach((code) => grow(...BOUNDS[COUNTRIES.indexOf(code)]));
    return bounds;
  }

  function computeView(list) {
    const { dot, frame, pin } = config;
    const pitchMin = Math.max(
      sizes.min,
      Math.min(sizes.target, width / dot.widthDivisor),
    );
    const pitchMax = pitchMin * dot.range;
    const pinRoom =
      Math.max(pitchMax * dot.scale * pin.headScale, sizes.minHead) *
      pin.clusterScale *
      2.8;
    let bounds = boundsOf(list);
    let w = bounds[2] - bounds[0];
    let h = bounds[3] - bounds[1];
    if (w < frame.minExtentKm) {
      bounds[0] -= (frame.minExtentKm - w) / 2;
      bounds[2] += (frame.minExtentKm - w) / 2;
    }
    if (h < frame.minExtentKm) {
      bounds[1] -= (frame.minExtentKm - h) / 2;
      bounds[3] += (frame.minExtentKm - h) / 2;
    }
    w = bounds[2] - bounds[0];
    h = bounds[3] - bounds[1];
    const margin = Math.max(frame.marginKm, Math.max(w, h) * frame.marginFraction);
    bounds = [
      bounds[0] - margin,
      bounds[1] - margin,
      bounds[2] + margin,
      bounds[3] + margin,
    ];
    w += 2 * margin;
    h += 2 * margin;
    const roomX = width - 2 * sizes.side;
    const roomY = height - sizes.top - sizes.bottom - pinRoom;
    const fit = Math.min(roomX / w, roomY / h);
    // The finest cells that are still far enough apart on screen.
    const level =
      levels.find((candidate) => candidate.cell * fit >= pitchMin) ||
      levels[levels.length - 1];
    const scale = level.cell * fit > pitchMax ? pitchMax / level.cell : fit;
    const pitch = level.cell * scale;
    const centre = [width / 2, sizes.top + pinRoom + roomY / 2];
    // "countries": the shape is the container itself, so a country is only
    // cut, softly, where it runs out of the container. Otherwise the rounded
    // shape around the projects, at least two cells inside the container.
    const whole = config.frame.fit === "countries" && !state.focus;
    const halfX = Math.min(
      width / 2 - 2 * pitch,
      Math.max((w / 2) * scale * 1.12 + pitch, pitch * 6),
    );
    const halfY = Math.min(
      Math.min(centre[1], height - centre[1]) - 2 * pitch + pitch * 1.5,
      Math.max((h / 2) * scale * 1.12 + pitch, pitch * 6),
    );
    return {
      level,
      scale,
      pitch,
      pitchMax,
      camera: [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2, scale],
      centre,
      mask: whole
        ? [width / 2, height / 2, width / 2, height / 2, 8, 0.82]
        : [centre[0], centre[1], halfX, halfY, 3, 1],
      radius: dot.scale * pitch,
    };
  }

  function cameraNow() {
    if (!cameraFrom || reducedMotion)
      return { camera: view.camera, mask: view.mask };
    const t = Math.min(1, (clock - cameraStart) / config.cameraDuration);
    const eased = easeInOutCubic(t);
    const mix = (from, to) => from + (to - from) * eased;
    return {
      camera: [
        mix(cameraFrom.camera[0], view.camera[0]),
        mix(cameraFrom.camera[1], view.camera[1]),
        Math.exp(mix(Math.log(cameraFrom.camera[2]), Math.log(view.camera[2]))),
      ],
      mask: cameraFrom.mask.map((value, index) => mix(value, view.mask[index])),
    };
  }

  // Which cell a project gets at a level: the one its coordinates fall in,
  // or for a place on the coast the nearest land cell of its own country.
  function cellForProject(level, project) {
    let [ix, iy] = cellOf(level, project.kx, project.ky);
    if (landAt(level, ix, iy) === project.countryIndex) return [ix, iy];
    let best = null;
    let bestDistance = 1e9;
    for (let reach = 1; reach <= 4 && !best; reach++)
      for (let dy = -reach; dy <= reach; dy++)
        for (let dx = -reach; dx <= reach; dx++) {
          if (landAt(level, ix + dx, iy + dy) !== project.countryIndex) continue;
          const [cx, cy] = cellCentre(level, ix + dx, iy + dy);
          const distance = Math.hypot(cx - project.kx, cy - project.ky);
          if (distance < bestDistance) {
            bestDistance = distance;
            best = [ix + dx, iy + dy];
          }
        }
    return best || [ix, iy];
  }

  // Projects in the same cell are one pin. Pins that would touch merge into
  // the one with the most projects; on a tie the northernmost, then the
  // westernmost. The same data on the same screen always gives the same pins.
  function clusterPins(nextView, list) {
    const { level, scale } = nextView;
    const byCell = new Map();
    list.forEach((project) => {
      const [ix, iy] = cellForProject(level, project);
      const key = `${level.name}:${ix}:${iy}`;
      if (!byCell.has(key)) byCell.set(key, { key, ix, iy, projects: [] });
      byCell.get(key).projects.push(project);
    });
    const ordered = [...byCell.values()].sort(
      (a, b) => b.projects.length - a.projects.length || a.iy - b.iy || a.ix - b.ix,
    );
    const head =
      Math.max(nextView.radius * config.pin.headScale, sizes.minHead) *
      config.pin.clusterScale;
    const minDistance = head * config.pin.mergeFactor;
    const kept = [];
    ordered.forEach((pin) => {
      [pin.kx, pin.ky] = cellCentre(level, pin.ix, pin.iy);
      let target = null;
      let nearest = 1e9;
      kept.forEach((other) => {
        const distance = Math.hypot(other.kx - pin.kx, other.ky - pin.ky) * scale;
        if (distance < minDistance && distance < nearest) {
          nearest = distance;
          target = other;
        }
      });
      if (target) target.projects = target.projects.concat(pin.projects);
      else kept.push(pin);
    });
    return kept;
  }

  // -------------------------------------------------------------------------
  // Build the cells and pins of the current selection
  // -------------------------------------------------------------------------
  function build(animate) {
    const rect = container.getBoundingClientRect();
    const w = Math.round(rect.width);
    const h = Math.round(rect.height);
    if (!w || !h || !state.started) return;
    animate = animate && !reducedMotion;
    dpr = Math.min(window.devicePixelRatio || 1, config.dprMax);
    width = w;
    height = h;
    sizes = readSizes();
    const canvasWidth = Math.round(w * dpr);
    const canvasHeight = Math.round(h * dpr);
    if (canvas.width !== canvasWidth || canvas.height !== canvasHeight) {
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
    }

    const visible = visibleProjects();
    const list = state.focus
      ? state.focusProjects.filter((project) => visible.includes(project))
      : visible;
    const previous = view && animate ? cameraNow() : null;
    view = computeView(list);
    const { level, scale } = view;
    const nextPins = clusterPins(view, list);

    // Every land cell in sight.
    const reach = level.cell * scale;
    const [x0, y0] = cellOf(
      level,
      view.camera[0] - (view.centre[0] + reach) / scale,
      view.camera[1] - (view.centre[1] + reach) / scale,
    );
    const [x1, y1] = cellOf(
      level,
      view.camera[0] + (w - view.centre[0] + reach) / scale,
      view.camera[1] + (h - view.centre[1] + reach) / scale,
    );
    const taken = new Set(nextPins.map((pin) => `${pin.ix}:${pin.iy}`));
    const farthest = Math.hypot(w, h) / scale;
    const data = [];
    for (let iy = Math.max(0, y0); iy <= Math.min(level.height - 1, y1); iy++)
      for (let ix = Math.max(0, x0); ix <= Math.min(level.width - 1, x1); ix++) {
        const country = level.land[iy * level.width + ix];
        if (!country) continue;
        const code = COUNTRIES[country - 1];
        if (!config.countries.includes(code)) continue;
        const selected = state.selected.has(code);
        if (!selected && !config.contextCountries) continue;
        if (taken.has(`${ix}:${iy}`)) continue;
        const [kx, ky] = cellCentre(level, ix, iy);
        // The nearest pin: the cell grows from it and pulses with it.
        let distance = 1e9;
        let phase = 0;
        nextPins.forEach((pin, index) => {
          const d = Math.hypot(kx - pin.kx, ky - pin.ky);
          if (d < distance) {
            distance = d;
            phase = ((index * 0.618034) % 1) * config.pulse.interval;
          }
        });
        if (!nextPins.length)
          distance = Math.hypot(kx - view.camera[0], ky - view.camera[1]);
        const delay = animate
          ? Math.pow(distance / farthest, 0.8) * 1.2 + hash(ix, iy) * 0.12
          : -10;
        data.push(
          kx,
          ky,
          selected ? 1 : config.contextOpacity,
          delay,
          selected && nextPins.length ? distance : -1,
          phase,
          selected ? 1 : 0,
          hash(iy, ix),
        );
      }

    const next = animate ? 1 - current : current;
    gl.bindBuffer(gl.ARRAY_BUFFER, sets[next].buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
    sets[next].count = data.length / 8;
    sets[next].cellKm = level.cell;
    if (animate && previous) {
      cameraFrom = previous;
      cameraStart = clock;
      fadeStart = clock;
      leavingPins = pins;
    } else {
      cameraFrom = null;
      sets[1 - next].count = 0;
      fadeStart = -1;
      leavingPins = [];
    }
    const hadCells = animate && sets[1 - next].count > 0;
    current = next;
    revealStart = animate
      ? clock + (hadCells ? config.cameraDuration * 0.45 : 0)
      : clock - 10;
    const keep = animate ? [] : pins;
    pins = nextPins.map((pin, index) => {
      const same = keep.find((old) => old.key === pin.key);
      pin.morph = same ? same.morph : 0;
      pin.hover = 0;
      pin.delay = animate
        ? (hadCells ? config.cameraDuration * 0.55 : 0.2) + index * 0.06
        : 0;
      return pin;
    });
    if (
      state.active != null &&
      !pins.some((pin) => pin.projects.some(({ id }) => id === state.active))
    )
      state.active = null;
    if (state.opened && !pins.some((pin) => pin.key === state.opened))
      state.opened = null;
    emptyLabel.hidden = list.length > 0;
    debugCell = "";
    renderHits();
    renderSelector();
    showTip();
    renderDebug();
  }

  // -------------------------------------------------------------------------
  // Draw
  // -------------------------------------------------------------------------
  function frame(now) {
    frameRequest = 0;
    if (!running) return;
    const seconds = lastFrame ? Math.min(0.12, (now - lastFrame) / 1000) : 0;
    lastFrame = now;
    clock += seconds;
    if (view) draw(seconds);
    frameRequest = requestAnimationFrame(frame);
  }

  function draw(seconds) {
    const { camera, mask } = cameraNow();
    const { dot, pulse, pin } = config;
    const radiusMax = dot.scale * view.pitchMax * 1.15;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);
    gl.uniform2f(uniforms.uRes, width, height);
    gl.uniform2f(uniforms.uScr, view.centre[0], view.centre[1]);
    gl.uniform3f(uniforms.uCam, camera[0], camera[1], camera[2]);
    gl.uniform4f(uniforms.uMask, mask[0], mask[1], mask[2], mask[3]);
    gl.uniform2f(uniforms.uMaskShape, mask[4], mask[5]);
    gl.uniform1f(uniforms.uDpr, dpr);
    gl.uniform1f(uniforms.uRmax, radiusMax);
    gl.uniform1f(uniforms.uTime, clock);
    gl.uniform1f(uniforms.uMode, 0);
    gl.uniform1f(uniforms.uDotScale, dot.scale);
    gl.uniform1f(uniforms.uPulseEvery, pulse.interval);
    gl.uniform1f(uniforms.uPulseTravel, Math.min(pulse.travel, pulse.interval));
    gl.uniform1f(uniforms.uPulseRadius, sizes.pulseRadius);
    gl.uniform1f(uniforms.uPulseOn, pulse.enabled && !reducedMotion ? 1 : 0);
    gl.uniform1f(uniforms.uPulseStrength, pulse.strength);
    gl.uniform1f(uniforms.uPinMin, sizes.minHead);
    gl.uniform1f(uniforms.uPinScale, pin.headScale);
    gl.uniform1f(uniforms.uPinCluster, pin.clusterScale);
    gl.uniform3fv(uniforms.uDotColor, colors.dot);
    gl.uniform3fv(uniforms.uAccentColor, colors.accent);
    gl.uniform3fv(uniforms.uActiveColor, colors.active);

    // The cells of the previous view fade out while the new ones grow.
    const old = sets[1 - current];
    if (old.count && fadeStart >= 0) {
      if (clock - fadeStart > 1.2) old.count = 0;
      else {
        gl.uniform1f(uniforms.uCellKm, old.cellKm);
        gl.uniform1f(uniforms.uStart, -100);
        gl.uniform1f(uniforms.uOut, fadeStart + 0.08);
        gl.bindVertexArray(old.vertexArray);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, old.count);
      }
    }
    const cells = sets[current];
    gl.uniform1f(uniforms.uCellKm, cells.cellKm);
    gl.uniform1f(uniforms.uStart, revealStart);
    gl.uniform1f(uniforms.uOut, -1);
    gl.bindVertexArray(cells.vertexArray);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, cells.count);

    // The pins: the dot of the cell morphs into a pin.
    const toScreen = (kx, ky) => [
      view.centre[0] + (kx - camera[0]) * camera[2],
      view.centre[1] + (ky - camera[1]) * camera[2],
    ];
    const radius = Math.min(dot.scale * cells.cellKm * camera[2], radiusMax);
    const drawn = [];
    leavingPins = leavingPins.filter((pin) => {
      pin.morph = Math.max(0, pin.morph - seconds * 4);
      return pin.morph > 0;
    });
    leavingPins.forEach((pin) => {
      [pin.x, pin.y] = toScreen(pin.kx, pin.ky);
      drawn.push(pin);
    });
    pins.forEach((pin) => {
      const since = clock - revealStart - pin.delay;
      pin.morph = reducedMotion
        ? 1
        : Math.max(pin.morph, since > 0 ? easeInOutCubic(Math.min(1, since / 0.6)) : 0);
      pin.hover +=
        ((state.hover === pin.key ? 1 : 0) - pin.hover) * Math.min(1, seconds * 12);
      [pin.x, pin.y] = toScreen(pin.kx, pin.ky);
      const qx = (Math.abs(pin.x - mask[0]) + radius) / mask[2];
      const qy = (Math.abs(pin.y - mask[1]) + radius) / mask[3];
      pin.visible =
        (qx ** mask[4] + qy ** mask[4]) ** (1 / mask[4]) <= 1.02 &&
        pin.x > 8 &&
        pin.x < width - 8 &&
        pin.y > 20 &&
        pin.y < height - 4;
      if (clock >= revealStart && pin.visible) drawn.push(pin);
    });
    const instances = new Float32Array(drawn.length * 8);
    drawn.forEach((pin, index) => {
      const active =
        state.opened === pin.key ||
        (pin.projects.length === 1 && state.active === pin.projects[0].id);
      instances.set(
        [
          pin.x,
          pin.y,
          pin.morph,
          pin.hover,
          active ? 1 : 0,
          pin.projects.length > 1 ? 1 : 0,
          1,
          0,
        ],
        index * 8,
      );
    });
    gl.bindBuffer(gl.ARRAY_BUFFER, sets[PINS].buffer);
    gl.bufferData(gl.ARRAY_BUFFER, instances, gl.DYNAMIC_DRAW);
    gl.uniform1f(uniforms.uRpin, radius);
    gl.uniform1f(uniforms.uMode, 1);
    gl.bindVertexArray(sets[PINS].vertexArray);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, drawn.length);
    placeHits(radius);
    placeTip(radius);
  }

  function start() {
    if (running) return;
    running = true;
    lastFrame = 0;
    frameRequest = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    if (frameRequest) cancelAnimationFrame(frameRequest);
    frameRequest = 0;
  }

  // -------------------------------------------------------------------------
  // Pins as buttons (mouse, touch and keyboard) and the tooltip
  // -------------------------------------------------------------------------
  const headRadius = (pin, radius) =>
    Math.max(radius * config.pin.headScale, sizes.minHead) *
    (pin.projects.length > 1 ? config.pin.clusterScale : 1);

  function renderHits() {
    hits.innerHTML = "";
    pins.forEach((pin) => {
      const count = pin.projects.length;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ecosystem-map__hit";
      button.setAttribute(
        "aria-label",
        count > 1
          ? `${count} ${config.labels.projects}: ${uniquePlaces(pin).join(", ")}`
          : [pin.projects[0].title, pin.projects[0].place].filter(Boolean).join(", "),
      );
      if (count > 1) button.innerHTML = `<span>${count}</span>`;
      const enter = () => {
        state.hover = pin.key;
        showTip();
      };
      const leave = () => {
        if (state.hover === pin.key) state.hover = null;
        showTip();
      };
      button.addEventListener("mouseenter", enter);
      button.addEventListener("focus", enter);
      button.addEventListener("mouseleave", leave);
      button.addEventListener("blur", leave);
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        if (count > 1) {
          // A cluster zooms in until it cannot split up any further; then a
          // click shows its projects.
          if (config.clusterZoom && splits(pin)) return zoomTo(pin);
          state.active = null;
          state.opened = state.opened === pin.key ? null : pin.key;
          return showTip();
        }
        const { id } = pin.projects[0];
        state.opened = null;
        state.active = state.active === id ? null : id;
        showTip();
      });
      pin.button = button;
      hits.appendChild(button);
    });
  }

  function placeHits(radius) {
    pins.forEach((pin) => {
      if (!pin.button) return;
      const head = headRadius(pin, radius);
      const size = head * 2 + 8;
      const headY = pin.y - head * 1.6 * pin.morph;
      const { style, firstChild } = pin.button;
      style.width = style.height = `${size}px`;
      style.transform = `translate(${pin.x - size / 2}px,${headY - size / 2}px)`;
      style.visibility = pin.morph > 0.05 && pin.visible ? "visible" : "hidden";
      if (firstChild) firstChild.style.opacity = pin.morph > 0.85 ? 1 : 0;
    });
  }

  const uniquePlaces = (pin) => [
    ...new Set(pin.projects.map((project) => project.place).filter(Boolean)),
  ];

  function tipPin() {
    if (state.hover) return pins.find((pin) => pin.key === state.hover);
    if (state.opened) return pins.find((pin) => pin.key === state.opened);
    if (state.active != null)
      return pins.find(
        (pin) => pin.projects.length === 1 && pin.projects[0].id === state.active,
      );
    return null;
  }

  const placeOf = (project) =>
    [project.place, config.labels.names[project.country] || project.country]
      .filter(Boolean)
      .join(", ");

  // The card of one project. `pinned` adds the link to its page.
  function projectCard(project, pinned) {
    // A card of its own keeps the texts it came with.
    const template = project.card || config.tooltip.project;
    if (template)
      return fillCard(template, {
        title: project.card ? null : project.title,
        place: project.card ? null : placeOf(project),
        logo: project.logo,
        initials: initials(project.title),
        url: pinned ? project.url : "",
      });
    return `<div class="ecosystem-map__card"><div class="ecosystem-map__logo">${
      project.logo
        ? `<img src="${escapeHtml(project.logo)}" alt="">`
        : escapeHtml(initials(project.title))
    }</div><div><div class="ecosystem-map__title">${escapeHtml(project.title)}</div><div class="ecosystem-map__place">${escapeHtml(placeOf(project))}</div>${
      project.url && pinned
        ? `<a class="ecosystem-map__link" href="${escapeHtml(project.url)}">${escapeHtml(config.labels.view)} →</a>`
        : ""
    }</div></div>`;
  }

  // The card of a cluster: how many projects, and where.
  function clusterCard(pin) {
    const count = pin.projects.length;
    const all = uniquePlaces(pin);
    const places =
      all.slice(0, 4).join(", ") + (all.length > 4 ? ` +${all.length - 4}` : "");
    const title = `${count} ${config.labels.projects}`;
    if (config.tooltip.cluster)
      return fillCard(config.tooltip.cluster, { title, place: places, count });
    return `<div class="ecosystem-map__card"><div class="ecosystem-map__logo is-count">${count}</div><div><div class="ecosystem-map__title">${escapeHtml(title)}</div><div class="ecosystem-map__place">${escapeHtml(places)}</div></div></div>`;
  }

  // A copy of an own tooltip element, filled in:
  //   [data-ecosystem-tooltip-title]     the title (or "3 projecten")
  //   [data-ecosystem-tooltip-place]     place and country (or the places)
  //   [data-ecosystem-tooltip-logo]      an image, or an element that gets
  //                                      the logo as background image
  //   [data-ecosystem-tooltip-initials]  the initials, shown without a logo
  //   [data-ecosystem-tooltip-count]     the number of projects of a cluster
  //   [data-ecosystem-tooltip-link]      the link to the project page, only
  //                                      shown once the pin is clicked
  function fillCard(template, values) {
    const card = template.cloneNode(true);
    card.style.display = "";
    card.removeAttribute("id");
    const each = (name, apply) =>
      [card, ...card.querySelectorAll("*")]
        .filter((element) => element.hasAttribute(`data-ecosystem-tooltip-${name}`))
        .forEach(apply);
    if (values.title != null)
      each("title", (element) => (element.textContent = values.title));
    if (values.place != null)
      each("place", (element) => (element.textContent = values.place));
    each("count", (element) => (element.textContent = values.count ?? ""));
    each("logo", (element) => {
      if (!values.logo) element.style.display = "none";
      else if (element.tagName === "IMG") {
        element.removeAttribute("srcset");
        element.src = values.logo;
      } else element.style.backgroundImage = `url("${values.logo}")`;
    });
    each("initials", (element) => {
      element.textContent = values.initials || "";
      if (values.logo) element.style.display = "none";
    });
    each("link", (element) => {
      if (values.url) element.setAttribute("href", values.url);
      else element.style.display = "none";
    });
    return card.outerHTML;
  }

  function showTip() {
    const pin = tipPin();
    if (!pin) {
      tip.classList.remove("is-on", "is-pinned");
      return;
    }
    const count = pin.projects.length;
    const opened = state.opened === pin.key;
    const own =
      count > 1 && !opened
        ? config.tooltip.cluster
        : config.tooltip.project || pin.projects[0].card;
    const html = opened
      ? pin.projects.map((project) => projectCard(project, true)).join("")
      : count > 1
        ? clusterCard(pin)
        : projectCard(pin.projects[0], state.active === pin.projects[0].id);
    // Only when it changes: a rebuild between mouse down and up on a link in
    // the card (the pin loses focus then) would swallow the click.
    if (tip.innerHTML !== html) tip.innerHTML = html;
    tip.classList.toggle("ecosystem-map__glass", !own);
    tip.classList.toggle("is-own", !!own);
    tip.dataset.key = pin.key;
    tip.classList.add("is-on");
    tip.classList.toggle(
      "is-pinned",
      opened || (!state.hover && state.active != null),
    );
  }

  // 8 px above the head of the pin; below the pin when there is no room.
  function placeTip(radius) {
    if (!tip.classList.contains("is-on")) return;
    const pin = pins.find((candidate) => candidate.key === tip.dataset.key);
    if (!pin || !pin.visible) {
      tip.classList.remove("is-on");
      return;
    }
    const head = headRadius(pin, radius);
    const headY = pin.y - head * 1.6 * pin.morph;
    const tipWidth = tip.offsetWidth;
    const tipHeight = tip.offsetHeight;
    const x = clamp(pin.x, tipWidth / 2 + 10, width - tipWidth / 2 - 10);
    let y = headY - head * 1.12 - 8;
    if (y - tipHeight < 8) y = pin.y + radius + 8 + tipHeight;
    y = Math.max(tipHeight + 8, Math.min(y, height - 8));
    tip.style.left = `${x}px`;
    tip.style.top = `${y}px`;
  }

  function resetSelection() {
    state.focus = null;
    state.focusProjects = null;
    state.active = null;
    state.opened = null;
    state.hover = null;
    setFocused(false);
  }

  const boundsOfProjects = (list) =>
    list.reduce(
      (bounds, { kx, ky }) => [
        Math.min(bounds[0], kx),
        Math.min(bounds[1], ky),
        Math.max(bounds[2], kx),
        Math.max(bounds[3], ky),
      ],
      [1e9, 1e9, -1e9, -1e9],
    );

  // Whether zooming in on a cluster would break it up into more pins.
  function splits(pin) {
    const { focus, focusProjects } = state;
    state.focus = boundsOfProjects(pin.projects);
    state.focusProjects = pin.projects;
    const zoomed = clusterPins(computeView(pin.projects), pin.projects);
    state.focus = focus;
    state.focusProjects = focusProjects;
    return zoomed.length > 1;
  }

  function zoomTo(pin) {
    resetSelection();
    state.focus = boundsOfProjects(pin.projects);
    state.focusProjects = pin.projects;
    setFocused(true);
    build(true);
  }

  function onBack(event) {
    event?.stopPropagation();
    if (!state.focus) return;
    resetSelection();
    build(true);
  }

  // A click next to the pinned tooltip closes it.
  function onContainerClick(event) {
    if (tip.contains(event.target)) return;
    if (state.active == null && !state.opened) return;
    state.active = null;
    state.opened = null;
    showTip();
  }
  backButton.addEventListener("click", onBack);
  container.addEventListener("click", onContainerClick);

  // -------------------------------------------------------------------------
  // Countries
  // -------------------------------------------------------------------------
  function countPerCountry() {
    const counts = Object.fromEntries(config.countries.map((code) => [code, 0]));
    projects.forEach((project) => {
      if (project.onMap && matchesTheme(project)) counts[project.country]++;
    });
    return counts;
  }

  function renderSelector() {
    if (!selector) return;
    const count = state.selected.size;
    const { labels } = config;
    pill.querySelector("span").textContent =
      count === config.countries.length
        ? labels.all
        : count === 1
          ? labels.names[[...state.selected][0]] || [...state.selected][0]
          : `${count} ${labels.countries}`;
    const counts = countPerCountry();
    panel.innerHTML =
      config.countries
        .map(
          (code) =>
            `<button type="button" class="ecosystem-map__option" data-country="${code}" aria-pressed="${state.selected.has(code)}"><b></b>${escapeHtml(labels.names[code] || code)}<small>${counts[code]}</small></button>`,
        )
        .join("") +
      `<div class="ecosystem-map__row"><button type="button" data-all>${escapeHtml(labels.all)}</button></div>`;
  }

  function changed() {
    config.onChange?.({ countries: [...state.selected], theme: state.theme });
  }

  // At least one country always stays selected.
  function setCountries(codes, { silent = false } = {}) {
    const next = config.countries.filter((code) => codes.includes(code));
    const selected = next.length ? next : config.countries;
    if (
      selected.length === state.selected.size &&
      selected.every((code) => state.selected.has(code))
    )
      return;
    state.selected = new Set(selected);
    resetSelection();
    build(true);
    if (!silent) changed();
  }

  function toggleCountry(code) {
    const next = new Set(state.selected);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    if (next.size) setCountries([...next]);
  }

  function setTheme(theme) {
    theme = String(theme || "").trim().toLowerCase() || null;
    if (theme === state.theme) return;
    state.theme = theme;
    resetSelection();
    build(true);
  }

  function closeSelector() {
    if (!selector) return;
    selector.classList.remove("is-open");
    pill.setAttribute("aria-expanded", "false");
  }
  function onPill(event) {
    event.stopPropagation();
    pill.setAttribute("aria-expanded", selector.classList.toggle("is-open"));
  }
  function onPanel(event) {
    event.stopPropagation();
    const option = event.target.closest("[data-country]");
    if (option) toggleCountry(option.dataset.country);
    else if (event.target.closest("[data-all]")) setCountries(config.countries);
  }
  if (selector) {
    pill.addEventListener("click", onPill);
    panel.addEventListener("click", onPanel);
    document.addEventListener("click", closeSelector);
  }

  // -------------------------------------------------------------------------
  // Debug: the cell and coordinates under the mouse, and where projects went
  // -------------------------------------------------------------------------
  function cellUnder(event) {
    if (!view) return null;
    const rect = container.getBoundingClientRect();
    const { camera } = cameraNow();
    const kx = camera[0] + (event.clientX - rect.left - view.centre[0]) / camera[2];
    const ky = camera[1] + (event.clientY - rect.top - view.centre[1]) / camera[2];
    const [ix, iy] = cellOf(view.level, kx, ky);
    const [lat, lon] = toLatLon(...cellCentre(view.level, ix, iy));
    const country = landAt(view.level, ix, iy);
    return {
      id: `${view.level.name}:${ix}:${iy}`,
      lat: lat.toFixed(4),
      lon: lon.toFixed(4),
      country: country ? COUNTRIES[country - 1] : "water",
      mouse: toLatLon(kx, ky).map((value) => value.toFixed(4)),
    };
  }

  function renderDebug() {
    if (!debugPanel || !view) return;
    const rows = projects.map((project) => {
      const name = escapeHtml(project.title || `project ${project.id + 1}`);
      if (!Number.isFinite(project.lat) || !Number.isFinite(project.lon))
        return `<i>✕ ${name}: geen latitude/longitude</i>`;
      if (!project.onMap)
        return `<i>✕ ${name}: ${project.lat}, ${project.lon} ligt buiten de landen van de kaart</i>`;
      const [ix, iy] = cellForProject(view.level, project);
      return `${name}: ${project.lat}, ${project.lon} → ${project.country} <b>${view.level.name}:${ix}:${iy}</b>`;
    });
    debugPanel.innerHTML =
      `<p><b>Raster</b> ${view.level.cell} km per cel (${view.level.name}), ${view.pitch.toFixed(2)} px tussen de puntjes, ${pins.length} pins</p>` +
      `<p data-cell>${debugCell || "Beweeg over de kaart voor cel en coördinaten; klik kopieert ze."}</p>` +
      `<p><b>Projecten</b> (${projects.filter((project) => project.onMap).length} van ${projects.length} op de kaart)</p>` +
      rows.join("<br>");
  }

  function onDebugMove(event) {
    if (debugPanel.contains(event.target)) return;
    const cell = cellUnder(event);
    if (!cell) return;
    debugCell = `<b>Cel ${cell.id}</b> (${cell.country})<br>midden van de cel: ${cell.lat}, ${cell.lon}<br>muis: ${cell.mouse.join(", ")}`;
    const line = debugPanel.querySelector("[data-cell]");
    if (line) line.innerHTML = debugCell;
  }

  function onDebugClick(event) {
    if (debugPanel.contains(event.target)) return;
    const cell = cellUnder(event);
    if (cell) navigator.clipboard?.writeText(cell.mouse.join(", ")).catch(() => {});
  }
  if (debugPanel) {
    container.addEventListener("mousemove", onDebugMove);
    container.addEventListener("click", onDebugClick);
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------
  let resizeTimer = 0;
  const resizeObserver = new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => build(false), 40);
  });
  resizeObserver.observe(container);

  // Builds up once enough of the map is in view; stands still out of view.
  function begin() {
    if (state.started) return;
    state.started = true;
    start();
    build(config.reveal.enabled);
  }
  const threshold = Math.min(config.reveal.threshold, 0.99);
  const visibility = new IntersectionObserver(
    ([entry]) => {
      if (entry.isIntersecting && entry.intersectionRatio >= threshold) begin();
      if (!state.started || !config.pauseOffscreen) return;
      if (entry.isIntersecting) start();
      else stop();
    },
    { threshold: [0, threshold] },
  );
  visibility.observe(container);

  return {
    get state() {
      return {
        countries: [...state.selected],
        theme: state.theme,
        focus: !!state.focus,
        active: state.active,
        level: view?.level.name,
        cellKm: view?.level.cell,
        pitch: view?.pitch,
        pins: pins.map((pin) => ({
          key: pin.key,
          x: pin.x,
          y: pin.y,
          count: pin.projects.length,
        })),
      };
    },
    get config() {
      return config;
    },
    // Change any option live, e.g. set({ dot: { target: "0.3em" } }).
    set(changes) {
      config = merge(config, changes);
      colors = readColors();
      if (changes.projects) projects = readProjects(config.projects);
      build(false);
    },
    setCountries,
    setTheme,
    countPerCountry,
    back: () => onBack(),
    replay: () => build(true),
    pause: stop,
    resume: start,
    destroy() {
      stop();
      resizeObserver.disconnect();
      visibility.disconnect();
      clearTimeout(resizeTimer);
      container.removeEventListener("click", onContainerClick);
      document.removeEventListener("click", closeSelector);
      if (debugPanel) {
        container.removeEventListener("mousemove", onDebugMove);
        container.removeEventListener("click", onDebugClick);
      }
      sets.forEach((set) => {
        gl.deleteBuffer(set.buffer);
        gl.deleteVertexArray(set.vertexArray);
      });
      gl.deleteBuffer(quad);
      gl.deleteProgram(program);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      [canvas, hits, selector, backButton, emptyLabel, tip, debugPanel].forEach(
        (element) => element?.remove(),
      );
      container.classList.remove("ecosystem-map");
    },
  };
}

// ---------------------------------------------------------------------------
function merge(base, changes) {
  const out = { ...base };
  Object.entries(changes || {}).forEach(([key, value]) => {
    if (value === undefined) return;
    const nested =
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      base[key] &&
      typeof base[key] === "object" &&
      !Array.isArray(base[key]);
    out[key] = nested ? merge(base[key], value) : value;
  });
  return out;
}

function hexToRgb(hex) {
  const value = hex.replace("#", "");
  return [0, 2, 4].map((at) => parseInt(value.slice(at, at + 2), 16) / 255);
}

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
const escapeHtml = (text) =>
  String(text ?? "").replace(/[&<>"]/g, (character) => ESCAPES[character]);

const initials = (title) =>
  title
    .split(/[\s-]+/)
    .filter((word) => word.length > 2)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join("");

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const easeInOutCubic = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
// A fixed number between 0 and 1 per cell, the same on every build.
const hash = (x, y) => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
