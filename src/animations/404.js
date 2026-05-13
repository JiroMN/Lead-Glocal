// ─────────────────────────────────────────────────────────────────────────────
// 404 page — "Versnippering" shatter effect using Matter.js.
//
// Click on the heading → each letter becomes a Matter.js body, gets a random
// explosive velocity, and physics takes over. DOM <span>s are synced to body
// positions every frame so the actual text glyphs remain on screen (no
// canvas texture work needed).
//
// Tweak the constants below to dial in the feel.
// ─────────────────────────────────────────────────────────────────────────────

// Physics tuning
const WORLD_GRAVITY = 1; // standard downward gravity
const RESTITUTION = 0.4; // bounciness on collision
const FRICTION = 0.3; // surface friction (slows sliding)
const FRICTION_AIR = 0.005; // air drag
// Initial "explosion" velocity for each letter
const EXPLOSION_X = 20; // horizontal kick range (random ±half)
const EXPLOSION_Y_MAX = 30; // upward kick (random, always upward)
const EXPLOSION_Y_MIN = 6;
const ANGULAR_VELOCITY = 0.35; // initial spin (random ±half)
// World walls
const WALL_THICKNESS = 200; // px — thick walls so fast bodies can't tunnel

export function prep404(next = document) {
  const content = next.querySelector("[data-content]");
  const cursor = next.querySelector("[data-404-cursor]");

  gsap.set(cursor, {
    visibility: "visible",
    autoAlpha: 0,
  });

  gsap.set(content, {
    visibility: "visible",
    autoAlpha: 0,
    pointerEvents: "none",
  });
}

export function init404() {
  initShatterText();
  init404Cursor();
}

function showCursor() {
  const cursor = document.querySelector("[data-404-cursor]");
  gsap.fromTo(
    cursor,
    {
      scaleY: 0.5,
      scaleX: 0.5,
      autoAlpha: 0,
    },
    {
      scaleY: 1,
      scaleX: 1,
      autoAlpha: 1,
      transformOrigin: "left",
      ease: "bounce",
      duration: 0.5,
    },
  );
}
function hideCursor(destroy = false) {
  const cursor = document.querySelector("[data-404-cursor]");
  gsap.to(cursor, {
    scaleY: 0.5,
    scaleX: 0.5,
    autoAlpha: 0,

    transformOrigin: "left",
    ease: "bounce",
    duration: 0.5,
    onComplete: () => {
      if (destroy) {
        setTimeout(() => (cursor.style.display = "none"), 1000);
      }
    },
  });
}

function init404Cursor() {
  const section = document.querySelector("[data-404]");
  showCursor();
  section.addEventListener("mouseenter", () => showCursor());
  section.addEventListener("mouseleave", () => hideCursor());
}

function showContent() {
  const contentWrap = document.querySelector("[data-content]");
  let tl = gsap.timeline({
    delay: 1,
    defaults: {
      duration: 1,
    },
  });

  tl.set(contentWrap, { pointerEvents: "auto" }).fromTo(
    contentWrap,
    {
      scale: 0.9,
      filter: "blur(10px)",
      autoAlpha: 0,
    },
    {
      scale: 1,
      filter: "blur(0px)",
      autoAlpha: 1,
    },
  );
}

// Click listener on the heading. One-shot — after shatter, no more clicks
// (the letters have moved on with their lives).
function initShatterText() {
  const textWrap = document.querySelector("[data-shatter-text-wrap]");
  const textEl = document.querySelector("[data-shatter-text]");
  if (!textEl || typeof Matter === "undefined") return;

  textWrap.addEventListener(
    "click",
    () => {
      shatterText(textEl);
      showContent();
      // Respond to destruction
      document.querySelector("[data-404-cursor-text]").textContent =
        "AAAAAAAAHHHGGG!";
      setTimeout(() => hideCursor(true), 1000);
    },
    { once: true },
  );
}

// The actual shatter. Splits the heading into chars, lifts them out of the
// document flow, hands each one to Matter.js, and syncs DOM transforms to
// physics positions every frame.
function shatterText(textEl) {
  const split = SplitText.create(textEl, { type: "chars" });
  const chars = split.chars;
  if (!chars.length) return;

  // 1. Snapshot the rendered position of each char in viewport coordinates.
  const charData = chars.map((el) => {
    const rect = el.getBoundingClientRect();
    return {
      el,
      x: rect.left + rect.width / 2, // center x
      y: rect.top + rect.height / 2, // center y
      w: rect.width,
      h: rect.height,
    };
  });

  // 2. Lift every char out of flow and pin to its current viewport spot.
  //    From here on the originals don't influence layout — they just float.
  charData.forEach((c) => {
    const { el, x, y, w, h } = c;
    el.style.position = "fixed";
    el.style.left = `${x - w / 2}px`;
    el.style.top = `${y - h / 2}px`;
    el.style.margin = "0";
    el.style.willChange = "transform";
  });

  // 3. Spin up a Matter world sized to the viewport.
  const { Engine, World, Bodies, Body, Runner } = Matter;
  const engine = Engine.create();
  engine.world.gravity.y = WORLD_GRAVITY;

  const w = window.innerWidth;
  const h = window.innerHeight;

  // Walls — ground, sides, ceiling. Thick + static so letters bounce instead
  // of escaping the viewport on fast collisions.
  const walls = [
    Bodies.rectangle(w / 2, h + WALL_THICKNESS / 2, w * 2, WALL_THICKNESS, {
      isStatic: true,
    }), // ground
    Bodies.rectangle(-WALL_THICKNESS / 2, h / 2, WALL_THICKNESS, h * 2, {
      isStatic: true,
    }), // left
    Bodies.rectangle(w + WALL_THICKNESS / 2, h / 2, WALL_THICKNESS, h * 2, {
      isStatic: true,
    }), // right
    Bodies.rectangle(w / 2, -WALL_THICKNESS / 2, w * 2, WALL_THICKNESS, {
      isStatic: true,
    }), // ceiling
  ];
  World.add(engine.world, walls);

  // 4. Create a body per char + random initial velocity for the explosion.
  const bodies = charData.map((c) => {
    const body = Bodies.rectangle(c.x, c.y, c.w, c.h, {
      restitution: RESTITUTION,
      friction: FRICTION,
      frictionAir: FRICTION_AIR,
    });
    Body.setVelocity(body, {
      x: (Math.random() - 0.5) * EXPLOSION_X,
      y: -(
        EXPLOSION_Y_MIN +
        Math.random() * (EXPLOSION_Y_MAX - EXPLOSION_Y_MIN)
      ),
    });
    Body.setAngularVelocity(body, (Math.random() - 0.5) * ANGULAR_VELOCITY);
    return body;
  });
  World.add(engine.world, bodies);

  // 5. Start the runner.
  Runner.run(Runner.create(), engine);

  // 6. Per-frame: copy body position+rotation into DOM transforms.
  //    Body position is center; CSS left/top is top-left of the char. We
  //    already left/top'd each char to its starting center, so the delta
  //    here is `body.position - original center`.
  function syncFrame() {
    for (let i = 0; i < bodies.length; i++) {
      const body = bodies[i];
      const c = charData[i];
      const dx = body.position.x - c.x;
      const dy = body.position.y - c.y;
      c.el.style.transform = `translate(${dx}px, ${dy}px) rotate(${body.angle}rad)`;
    }
    requestAnimationFrame(syncFrame);
  }
  syncFrame();

  // 7. Let the rest of the page know — caller can fade in the 404 content.
  textEl.dispatchEvent(new CustomEvent("shatter-triggered", { bubbles: true }));
  document.querySelector("[data-shatter-text-wrap]").style.pointerEvents =
    "none";
}
