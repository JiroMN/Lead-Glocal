const HALF_TURN = Math.PI;
const nearestHalfTurn = (angle) => Math.round(angle / HALF_TURN) * HALF_TURN;
const isOddHalfTurn = (angle) =>
  Math.abs(Math.round(angle / HALF_TURN)) % 2 === 1;

// Drag, tap, hover and keyboard turning for the card.
// Dragging turns it freely around X and Y at once; it always settles on a
// face, and after a flip over X it rolls itself upright.
export function createCardControls(surface, settings) {
  const target = { x: 0, y: 0, z: 0 };
  const rotation = { x: 0, y: 0, z: 0 };
  const momentum = { x: 0, y: 0 };
  const pointer = { x: 0, y: 0 };
  const hover = { x: 0, y: 0 };
  let drag = null;
  let enabled = false;

  function flip(direction = 1) {
    momentum.y = 0;
    target.y = nearestHalfTurn(target.y) + HALF_TURN * direction;
  }

  function onPointerDown(event) {
    if (!enabled) return;
    drag = {
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      moved: false,
    };
    momentum.x = momentum.y = 0;
    surface.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event) {
    const bounds = surface.getBoundingClientRect();

    if (!drag) {
      if (!enabled || event.pointerType !== "mouse") return;
      pointer.x = (event.clientX - bounds.left) / bounds.width - 0.5;
      pointer.y = (event.clientY - bounds.top) / bounds.height - 0.5;
      return;
    }

    const travel = Math.hypot(
      event.clientX - drag.startX,
      event.clientY - drag.startY,
    );
    drag.moved ||= travel > settings.tapDistance;

    const turnPerPixel =
      (HALF_TURN / Math.min(bounds.width, 520)) * settings.dragSensitivity;
    // Seen from the back, turning around X runs the other way.
    const facing = Math.cos(rotation.y) < 0 ? -1 : 1;
    const step = {
      y: (event.clientX - drag.lastX) * turnPerPixel,
      x: (event.clientY - drag.lastY) * turnPerPixel * facing,
    };
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;

    if (!drag.moved) return;
    target.x += step.x;
    target.y += step.y;
    momentum.x = step.x;
    momentum.y = step.y;
  }

  function onPointerUp() {
    if (!drag) return;
    const { moved } = drag;
    drag = null;

    if (!moved) return flip();
    completeFlick("x");
    completeFlick("y");
  }

  // A quick flick always finishes the turn in its direction.
  function completeFlick(axis) {
    if (Math.abs(momentum[axis]) <= settings.flickSpeed) return;
    const towards = momentum[axis] > 0 ? Math.ceil : Math.floor;
    target[axis] = towards(target[axis] / HALF_TURN) * HALF_TURN;
    momentum[axis] = 0;
  }

  function onPointerLeave() {
    pointer.x = pointer.y = 0;
  }

  function onKeyDown(event) {
    if (!enabled) return;
    const direction = { ArrowRight: 1, Enter: 1, " ": 1, ArrowLeft: -1 }[
      event.key
    ];
    if (!direction) return;
    event.preventDefault();
    flip(direction);
  }

  function settle(axis, frames) {
    if (Math.abs(momentum[axis]) > 0.0008) {
      target[axis] += momentum[axis] * frames;
      momentum[axis] *= Math.pow(settings.momentumDecay, frames);
    } else {
      momentum[axis] = 0;
      target[axis] +=
        (nearestHalfTurn(target[axis]) - target[axis]) *
        approach(settings.snap, frames);
    }
  }

  function rollUpright() {
    const upsideDown = isOddHalfTurn(target.x);
    if (upsideDown && target.z === 0 && Math.abs(rotation.x - target.x) < 0.04)
      target.z = HALF_TURN;

    // Rx(pi) Rz(pi) equals Ry(pi): swap to that pose once the roll lands.
    if (target.z !== 0 && Math.abs(rotation.z - target.z) < 0.01) {
      target.y += HALF_TURN;
      rotation.y += HALF_TURN;
      target.x -= HALF_TURN;
      rotation.x -= HALF_TURN;
      target.z = rotation.z = 0;
    }
  }

  function update(frames) {
    if (!drag) {
      settle("y", frames);
      settle("x", frames);
      rollUpright();
    }

    hover.x += (pointer.x - hover.x) * approach(settings.hoverFollow, frames);
    hover.y += (pointer.y - hover.y) * approach(settings.hoverFollow, frames);

    const follow = approach(settings.follow, frames);
    rotation.y +=
      (target.y + hover.x * settings.hoverTilt.y - rotation.y) * follow;
    rotation.x +=
      (target.x + hover.y * settings.hoverTilt.x - rotation.x) * follow;
    rotation.z +=
      (target.z - rotation.z) * approach(settings.rollFollow, frames);
  }

  surface.addEventListener("pointerdown", onPointerDown);
  surface.addEventListener("pointermove", onPointerMove);
  surface.addEventListener("pointerup", onPointerUp);
  surface.addEventListener("pointercancel", onPointerUp);
  surface.addEventListener("pointerleave", onPointerLeave);
  surface.addEventListener("keydown", onKeyDown);

  return {
    rotation,
    update,
    enable() {
      enabled = true;
      surface.style.cursor = "grab";
    },
    destroy() {
      surface.removeEventListener("pointerdown", onPointerDown);
      surface.removeEventListener("pointermove", onPointerMove);
      surface.removeEventListener("pointerup", onPointerUp);
      surface.removeEventListener("pointercancel", onPointerUp);
      surface.removeEventListener("pointerleave", onPointerLeave);
      surface.removeEventListener("keydown", onKeyDown);
    },
  };
}

// Frame-rate independent version of "move this fraction closer each frame".
function approach(fractionPerFrame, frames) {
  return 1 - Math.pow(1 - fractionPerFrame, frames);
}
