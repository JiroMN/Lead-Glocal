import {
  WebGLRenderer,
  Scene,
  OrthographicCamera,
  Mesh,
  SphereGeometry,
  MeshBasicMaterial,
  BufferGeometry,
  Float32BufferAttribute,
  ShaderMaterial,
  DoubleSide,
  CanvasTexture,
  SRGBColorSpace,
  Vector3,
} from "three";

// Everything is measured in globe radii: 1 is the edge of the SVG globe.
const look = {
  // The right half of the ribbon, traced from the motion design: from the
  // middle of the front diagonal, around the right loop, to the middle of the
  // back. The left half is the same turned half a turn around the centre.
  // Per point: x, y, width, depth (> 0 in front of the globe, < 0 behind it).
  // The ribbon narrows to a sliver where it turns away behind the globe.
  path: [
    [0, 0, 0.415, 1.3],
    [0.322, 0.19, 0.415, 1.25],
    [0.591, 0.347, 0.419, 1],
    [0.819, 0.463, 0.416, 0.7],
    [1.014, 0.498, 0.418, 0.45],
    [1.198, 0.41, 0.408, 0.25],
    [1.295, 0.303, 0.385, 0.1],
    [1.374, 0.14, 0.332, 0],
    [1.39, -0.033, 0.266, -0.1],
    [1.339, -0.22, 0.178, -0.2],
    [1.241, -0.354, 0.111, -0.35],
    [1.06, -0.443, 0.047, -0.5],
    [0.9, -0.48, 0.026, -0.6],
    // Hidden behind the globe: keeps going left before turning to the middle,
    // so the sliver leaves without a kink.
    [0.65, -0.47, 0.02, -0.9],
    [0.3, -0.2, 0.02, -1.25],
  ],
  centre: { x: 0.004, y: -0.017 },
  // How much of the path (in radii) the band looks at to decide which way
  // it faces. Spreads each bend over a longer stretch, so the images fan
  // out evenly instead of kinking, while the path itself stays the same.
  bendSmoothing: 0.4,
  // Images along the ribbon.
  imageLength: 0.66, // per image, including the gap
  gap: 0.03,
  // From the Webflow variables: rounded corners, and the colour laid over
  // the images like on the project photos.
  cornerRadius: "--_sizes---radius--xs-4",
  overlay: "--_colors---translucents--primary-60",
  edgeSoftness: 0.3, // fade at the start and end while drawing in and out
  // Where the ribbon goes behind the globe it fades out over this distance
  // (in radii) before it reaches the outline, instead of being cut off by it.
  behindFade: 0.2,
  // Smear along the flow, as part of an image, at idle speed. Grows with
  // the speed.
  motionBlur: 0.01,
  // Where the ribbon turns away behind the globe it passes through a lens:
  // the image bulges, the colours split and the light catches it.
  lens: {
    from: -0.05, // depth where it starts
    to: -0.6, // depth where it is strongest
    bulge: 0.35,
    aberration: 0.035, // colour split, as part of an image
    light: 0.45,
  },
  // Where the ribbon starts and ends when drawing in and out, as part of the
  // lap. 0.37 is where it comes out from behind the globe on the lower
  // right, so it shows straight away and rises up on the right. (0.5 would
  // be the middle of the back, hidden behind the globe.)
  gate: 0.37,
  // How much room the canvas gets around the globe.
  canvas: { x: 1.7, y: 1.05 },
  detail: 1200,
};

const CELL = { width: 768, height: 512 };

export function createGlobeRibbon({ shape, images }) {
  const host = shape.parentElement;
  const renderer = new WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const canvas = renderer.domElement;
  canvas.style.cssText =
    "position:absolute;pointer-events:none;transform:translate(-50%,-50%);";
  host.appendChild(canvas);

  const scene = new Scene();
  const camera = new OrthographicCamera(
    -look.canvas.x,
    look.canvas.x,
    look.canvas.y,
    -look.canvas.y,
    0.1,
    20,
  );
  camera.position.z = 10;

  // An invisible globe that hides whatever passes behind it.
  const occluder = new Mesh(
    new SphereGeometry(0.995, 48, 32),
    new MeshBasicMaterial({ colorWrite: false }),
  );
  occluder.renderOrder = 0;
  scene.add(occluder);

  const path = tracePath();
  // Slots around the lap, a whole number of times the image count so the
  // sequence of images runs on seamlessly where the lap starts again.
  const slotsFor = (count) =>
    Math.max(1, Math.round(path.length / look.imageLength / count)) * count;
  let segments = slotsFor(1);
  const ribbon = new Mesh(buildRibbon(path), createMaterial(segments));
  ribbon.material.uniforms.slotLength.value = path.length / segments;
  ribbon.material.uniforms.overlay.value = readOverlay(canvas);
  ribbon.renderOrder = 1;
  scene.add(ribbon);

  function fit() {
    // Placed against whatever the canvas is positioned in, so the host
    // doesn't need position: relative.
    const globe = shape.getBoundingClientRect();
    const room = (canvas.offsetParent ?? document.body).getBoundingClientRect();
    const { width } = globe;
    if (!width) return;
    const pixelsPerRadius = width / 2;
    ribbon.material.uniforms.cornerRadius.value =
      (parseFloat(
        readVariable(canvas, "borderTopLeftRadius", look.cornerRadius),
      ) || 0) / pixelsPerRadius;
    const cssWidth = 2 * look.canvas.x * pixelsPerRadius;
    const cssHeight = 2 * look.canvas.y * pixelsPerRadius;
    renderer.setSize(cssWidth, cssHeight, false);
    Object.assign(canvas.style, {
      width: `${cssWidth}px`,
      height: `${cssHeight}px`,
      left: `${globe.left - room.left + globe.width / 2}px`,
      top: `${globe.top - room.top + globe.height / 2}px`,
    });
  }
  fit();
  const resizeObserver = new ResizeObserver(fit);
  resizeObserver.observe(shape);

  let destroyed = false;
  const ready = buildAtlas(images).then((atlas) => {
    if (destroyed) return new Promise(() => {});
    const { uniforms } = ribbon.material;
    uniforms.atlas.value = atlas.texture;
    uniforms.grid.value = [atlas.columns, atlas.rows];
    uniforms.imageCount.value = atlas.count;
    segments = slotsFor(Math.max(atlas.count, 1));
    uniforms.segments.value = segments;
    uniforms.slotLength.value = path.length / segments;
  });

  return {
    canvas,
    ready,
    // offset: how far the images have travelled, in globe radii.
    // head / tail: how much of the lap is drawn in / out from the gate.
    softness: look.edgeSoftness,
    // pace: the current speed as a multiple of idle, for the motion blur.
    render({ offset, head, tail, pace = 1 }) {
      const { uniforms } = ribbon.material;
      uniforms.offset.value = (offset / path.length) * segments;
      uniforms.blur.value = look.motionBlur * Math.abs(pace);
      uniforms.head.value = head;
      uniforms.tail.value = tail;
      renderer.render(scene, camera);
    },
    destroy() {
      destroyed = true;
      resizeObserver.disconnect();
      ribbon.material.uniforms.atlas.value?.dispose();
      [occluder, ribbon].forEach((mesh) => {
        mesh.geometry.dispose();
        mesh.material.dispose();
      });
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}

// The whole loop from the traced half: a smooth closed curve through the
// points, resampled so the points are spaced evenly along it.
function tracePath() {
  const half = look.path;
  const turned = half.map(([x, y, width, depth]) => [-x, -y, width, depth]);
  const back = [0, 0, half[half.length - 1][2], -1.3];
  const controls = [...half, back, ...turned.slice(1).reverse()];

  const raw = [];
  const steps = Math.ceil(look.detail / controls.length);
  controls.forEach((_, i) => {
    const around = (offset) =>
      controls[(i + offset + controls.length) % controls.length];
    for (let step = 0; step < steps; step++)
      raw.push(
        catmullRom(around(-1), around(0), around(1), around(2), step / steps),
      );
  });
  raw.push(raw[0]);

  const points = raw.map(
    ([x, y, , depth]) =>
      new Vector3(x + look.centre.x, y + look.centre.y, depth),
  );
  const distances = [0];
  for (let i = 1; i < raw.length; i++)
    distances.push(
      distances[i - 1] +
        Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1]),
    );
  const length = distances[distances.length - 1];

  return {
    length,
    points,
    widths: raw.map((point) => point[2]),
    progress: distances.map((distance) => distance / length),
  };
}

function catmullRom(p0, p1, p2, p3, t) {
  return p1.map((_, k) => {
    const [a, b, c, d] = [p0[k], p1[k], p2[k], p3[k]];
    return (
      0.5 *
      (2 * b +
        (c - a) * t +
        (2 * a - 5 * b + 4 * c - d) * t * t +
        (3 * b - a - 3 * c + d) * t * t * t)
    );
  });
}

// A flat band facing the viewer; its width follows the traced path. Length is
// measured on screen, so the images keep their size where the band turns away.
function buildRibbon({ points, widths, progress, length }) {
  const positions = [];
  const uvs = [];
  const lens = [];
  const bandWidths = [];
  const indices = [];
  const facing = new Vector3(0, 0, 1);

  points.forEach((point, i) => {
    // The last point closes the loop onto the first.
    const count = points.length - 1;
    const reach = Math.max(
      1,
      Math.round((look.bendSmoothing / length) * count),
    );
    const previous = points[(i - reach + count) % count];
    const next = points[(i + reach) % count];
    const across = next
      .clone()
      .sub(previous)
      .setZ(0)
      .cross(facing)
      .normalize()
      .multiplyScalar(widths[i] / 2);

    const left = point.clone().sub(across);
    const right = point.clone().add(across);
    positions.push(left.x, left.y, left.z, right.x, right.y, right.z);
    uvs.push(progress[i], 0, progress[i], 1);
    const strength = smoothstep(look.lens.from, look.lens.to, point.z);
    lens.push(strength, strength);
    bandWidths.push(widths[i], widths[i]);

    if (i < points.length - 1) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  });

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("lens", new Float32BufferAttribute(lens, 1));
  geometry.setAttribute("width", new Float32BufferAttribute(bandWidths, 1));
  geometry.setIndex(indices);
  return geometry;
}

// A Webflow variable as the browser resolves it for a CSS property, so em
// becomes pixels and any colour becomes rgb(a).
function readVariable(element, property, variable) {
  const before = element.style[property];
  element.style[property] = `var(${variable})`;
  const value = getComputedStyle(element)[property];
  element.style[property] = before;
  return value;
}

// The overlay colour as sRGB plus alpha, for the shader.
function readOverlay(element) {
  const value = readVariable(element, "backgroundColor", look.overlay);
  const [r = 0, g = 0, b = 0, a = 1] =
    value.match(/[\d.]+/g)?.map(Number) ?? [];
  return [r / 255, g / 255, b / 255, value.includes("rgba") ? a : 1];
}

function smoothstep(from, to, value) {
  const t = Math.min(Math.max((value - from) / (to - from), 0), 1);
  return t * t * (3 - 2 * t);
}

function createMaterial(segments) {
  return new ShaderMaterial({
    transparent: true,
    side: DoubleSide,
    uniforms: {
      atlas: { value: null },
      grid: { value: [1, 1] },
      imageCount: { value: 1 },
      segments: { value: segments },
      gap: { value: look.gap / look.imageLength },
      offset: { value: 0 },
      head: { value: 0 },
      tail: { value: 0 },
      softness: { value: look.edgeSoftness },
      gate: { value: look.gate },
      blur: { value: look.motionBlur },
      bulge: { value: look.lens.bulge },
      aberration: { value: look.lens.aberration },
      light: { value: look.lens.light },
      slotLength: { value: 1 },
      cornerRadius: { value: 0 },
      overlay: { value: [0, 0, 0, 0] },
      behindFade: { value: look.behindFade },
    },
    vertexShader: /* glsl */ `
      attribute float lens, width;
      varying vec2 vUv;
      varying float vLens, vWidth;
      varying vec3 vPosition;
      void main() {
        vUv = uv;
        vPosition = position;
        vLens = lens;
        vWidth = width;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D atlas;
      uniform vec2 grid;
      uniform float imageCount, segments, gap, offset, head, tail, softness, gate;
      uniform float blur, bulge, aberration, light, slotLength, cornerRadius;
      uniform vec4 overlay;
      uniform float behindFade;
      varying vec2 vUv;
      varying float vLens, vWidth;
      varying vec3 vPosition;

      const int TAPS = 7;

      // One image from the atlas, smeared along the flow. along and across
      // run 0 to 1 over the image.
      vec3 sampleImage(vec2 cell, float along, float across) {
        vec3 sum = vec3(0.0);
        for (int i = 0; i < TAPS; i++) {
          float shift = (float(i) / float(TAPS - 1) - 0.5) * blur;
          vec2 uv = vec2(
            (cell.x + clamp(along + shift, 0.0, 1.0)) / grid.x,
            1.0 - (cell.y + across) / grid.y
          );
          sum += texture2D(atlas, uv).rgb;
        }
        return sum / float(TAPS);
      }

      void main() {
        if (imageCount < 1.0) discard;

        // Images flow against the direction of the path: right to left over
        // the front, like in the motion design.
        float flow = vUv.x * segments + offset;
        float slot = floor(flow);
        float along = fract(flow);

        // The image as a rounded rectangle, measured in globe radii from
        // its middle.
        vec2 size = vec2(slotLength * (1.0 - gap), vWidth);
        vec2 point = vec2((along - 0.5) * slotLength, (vUv.y - 0.5) * vWidth);
        float radius = min(cornerRadius, 0.5 * min(size.x, size.y));
        vec2 corner = abs(point) - 0.5 * size + radius;
        float outside = length(max(corner, 0.0))
          + min(max(corner.x, corner.y), 0.0) - radius;
        float inImage = 1.0 - smoothstep(-fwidth(outside), 0.0, outside);
        along = (along - gap * 0.5) / (1.0 - gap);

        float image = mod(slot, imageCount);
        vec2 cell = vec2(mod(image, grid.x), floor(image / grid.x));

        // Lens: the middle of the band is magnified, like through a drop of
        // glass, and the colours drift apart along the flow.
        float across = vUv.y - 0.5;
        across = 0.5 + across * (1.0 - vLens * bulge * (1.0 - 4.0 * across * across));
        float split = vLens * aberration;
        vec3 color = vec3(
          sampleImage(cell, along + split, across).r,
          sampleImage(cell, along, across).g,
          sampleImage(cell, along - split, across).b
        );
        // A streak of light along the middle of the band.
        float streak = exp(-pow((vUv.y - 0.5) * 3.5, 2.0));
        // Mixed in sRGB, like a CSS overlay on top of the image.
        color = pow(mix(pow(color, vec3(1.0 / 2.2)), overlay.rgb, overlay.a), vec3(2.2));
        color = mix(color, vec3(1.0), vLens * light * streak);

        // Drawn in and out with the flow, starting at the gate.
        float lap = fract(gate - vUv.x);
        float drawnIn = 1.0 - smoothstep(head - softness, head, lap);
        float drawnOut = smoothstep(tail - softness, tail, lap);

        // Behind the globe, fade out just outside its outline.
        float outsideGlobe = length(vPosition.xy) - 1.0;
        float behind = vPosition.z < 0.0
          ? smoothstep(0.0, behindFade, outsideGlobe)
          : 1.0;

        float alpha = inImage * drawnIn * drawnOut * behind;
        if (alpha < 0.01) discard;
        gl_FragColor = vec4(color, alpha);
        #include <colorspace_fragment>
      }
    `,
  });
}

// All theme images side by side in one texture, each cropped to the shape of
// a slot on the ribbon.
async function buildAtlas(urls) {
  const loaded = (await Promise.allSettled(urls.map(loadImage)))
    .filter((result) => result.status === "fulfilled")
    .map((result) => result.value);

  const count = loaded.length;
  const columns = Math.ceil(Math.sqrt(count)) || 1;
  const rows = Math.ceil(count / columns) || 1;
  const sheet = document.createElement("canvas");
  sheet.width = columns * CELL.width;
  sheet.height = rows * CELL.height;
  const context = sheet.getContext("2d");

  loaded.forEach((image, index) => {
    const x = (index % columns) * CELL.width;
    const y = Math.floor(index / columns) * CELL.height;
    const scale = Math.max(
      CELL.width / image.naturalWidth,
      CELL.height / image.naturalHeight,
    );
    const cropWidth = CELL.width / scale;
    const cropHeight = CELL.height / scale;
    context.drawImage(
      image,
      (image.naturalWidth - cropWidth) / 2,
      (image.naturalHeight - cropHeight) / 2,
      cropWidth,
      cropHeight,
      x,
      y,
      CELL.width,
      CELL.height,
    );
  });

  const texture = new CanvasTexture(sheet);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return { texture, columns, rows, count };
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = url;
  });
}
