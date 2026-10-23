import {
  WebGLRenderer,
  Scene,
  PerspectiveCamera,
  Group,
  Mesh,
  BoxGeometry,
  MeshStandardMaterial,
  TextureLoader,
  SRGBColorSpace,
  Color,
  AmbientLight,
  DirectionalLight,
  MathUtils,
  Vector3,
} from "three";

const look = {
  card: { width: 8.5, thickness: 0.07, roughness: 0.42, edgeRoughness: 0.55 },
  camera: {
    fov: 30,
    elevation: 0.06,
    fitWidth: 1.22,
    fitHeight: 2.4,
    aimBelowCard: 0.32,
  },
  lights: {
    ambient: { color: 0xffffff, intensity: 1.4 },
    key: { color: 0xffffff, intensity: 2.35, position: [-6, 8, 7] },
    rim: { color: 0x9fb0ff, intensity: 2.8, position: [3, 6, -9] },
    fill: { color: 0xffffff, intensity: 0.95, position: [5, -3, -8] },
  },
};

export function createBusinessCardScene({ root, sources, variant }) {
  const artwork = sources[variant];

  const renderer = new WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const canvas = renderer.domElement;
  canvas.style.cssText =
    "position:absolute;inset:0;width:100%;height:100%;touch-action:none;outline:none;";
  canvas.tabIndex = 0;
  root.appendChild(canvas);

  const scene = new Scene();
  const camera = new PerspectiveCamera(look.camera.fov, 1, 0.1, 100);
  addLights(scene);

  const edge = new MeshStandardMaterial({
    color: new Color(artwork.borderColor),
    roughness: look.card.edgeRoughness,
  });
  const front = new MeshStandardMaterial({ roughness: look.card.roughness });
  const back = new MeshStandardMaterial({ roughness: look.card.roughness });

  const mesh = new Mesh(undefined, [edge, edge, edge, edge, front, back]);
  const card = new Group();
  card.rotation.order = "YXZ";
  card.add(mesh);
  scene.add(card);

  let cardHeight = look.card.width / 1.545;
  const aim = new Vector3();

  function shapeCard() {
    mesh.geometry?.dispose();
    mesh.geometry = new BoxGeometry(
      look.card.width,
      cardHeight,
      look.card.thickness,
    );
  }

  function frame() {
    const { clientWidth: width, clientHeight: height } = root;
    if (!width || !height) return;

    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    const tan = Math.tan(MathUtils.degToRad(camera.fov / 2));
    const distance = Math.max(
      (look.card.width * look.camera.fitWidth) / (2 * tan * camera.aspect),
      (cardHeight * look.camera.fitHeight) / (2 * tan),
    );
    aim.set(0, -cardHeight * look.camera.aimBelowCard, 0);
    camera.position.set(
      0,
      aim.y + Math.sin(look.camera.elevation) * distance,
      Math.cos(look.camera.elevation) * distance,
    );
    camera.lookAt(aim);
    camera.updateMatrixWorld();
    shareCardCenter();
  }

  // Lets CSS line things up with the card, e.g. the glow behind it.
  function shareCardCenter() {
    const { y } = new Vector3(0, 0, 0).project(camera);
    root.style.setProperty("--business-card-center", `${((1 - y) / 2) * 100}%`);
  }

  shapeCard();
  frame();
  const resizeObserver = new ResizeObserver(frame);
  resizeObserver.observe(root);

  let destroyed = false;
  const textures = [];
  const loader = new TextureLoader().setCrossOrigin("anonymous");
  const sharpness = renderer.capabilities.getMaxAnisotropy();

  const ready = Promise.all(
    [artwork.front, artwork.back].map(loadTexture),
  ).then(([frontArt, backArt]) => {
    if (destroyed) return new Promise(() => {});
    front.map = frontArt;
    back.map = backArt;
    front.needsUpdate = back.needsUpdate = true;
    cardHeight =
      look.card.width * (frontArt.image.height / frontArt.image.width);
    shapeCard();
    frame();
  });

  function loadTexture(url) {
    return loader.loadAsync(url).then((texture) => {
      texture.colorSpace = SRGBColorSpace;
      texture.anisotropy = sharpness;
      textures.push(texture);
      return texture;
    });
  }

  return {
    card,
    canvas,
    ready,
    render: () => renderer.render(scene, camera),
    destroy() {
      destroyed = true;
      resizeObserver.disconnect();
      mesh.geometry.dispose();
      [edge, front, back, ...textures].forEach((resource) =>
        resource.dispose(),
      );
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}

function addLights(scene) {
  const { ambient, ...directional } = look.lights;
  scene.add(new AmbientLight(ambient.color, ambient.intensity));
  Object.values(directional).forEach(({ color, intensity, position }) => {
    const light = new DirectionalLight(color, intensity);
    light.position.set(...position);
    scene.add(light);
  });
}
