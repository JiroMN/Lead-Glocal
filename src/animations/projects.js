import { getVariableValue } from "../utils/helpers";

// Register Draggable + InertiaPlugin once. Idempotent — re-calling is safe.
function ensureSliderPlugins() {
  if (typeof Draggable === "undefined" || typeof InertiaPlugin === "undefined")
    return false;
  gsap.registerPlugin(Draggable, InertiaPlugin);
  return true;
}

export function initProjectCards() {
  const PADDING_TARGET = getVariableValue("--_sizes---padding--4xs-10");

  const cardWrappers = document.querySelectorAll("[data-project-card-wrap]");

  cardWrappers.forEach((cardWrap) => {
    const innerCard = cardWrap.querySelector("[data-project-card]");

    // Set up brackets
    const brackets = cardWrap.querySelector("[data-project-card-brackets]");
    brackets.style.opacity = 1;
    gsap.set(brackets, { autoAlpha: 0 });

    // One live timeline per card. We kill the previous one on every hover
    // transition so two opposing tweens never overlap on the same brackets —
    // that's what was causing the "still visible" glitches.
    let activeTl = null;

    cardWrap.addEventListener("mouseenter", () => {
      activeTl?.kill();
      activeTl = gsap.timeline({ defaults: { duration: 0.3, ease: "osmo" } });
      activeTl
        .to(cardWrap, {
          padding: PADDING_TARGET,
        })
        .to(
          brackets,
          {
            autoAlpha: 1,
          },
          "<+0.1",
        )
        .fromTo(brackets, { scale: 0.9 }, { scale: 1 }, "<");
    });
    cardWrap.addEventListener("mouseleave", () => {
      activeTl?.kill();
      activeTl = gsap.timeline({ defaults: { duration: 0.3, ease: "osmo" } });
      activeTl
        .to(brackets, {
          autoAlpha: 0,
        })
        .to(
          brackets,
          {
            scale: 0.9,
          },
          "<",
        )
        .to(
          cardWrap,
          {
            padding: 0,
            clearProps: "padding",
          },
          "<",
        );
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Projects slider — drag-with-inertia carousel based on the Osmo GSAP slider.
// Re-uses the slider-wrap as both [init] and [collection] so we only need to
// add ONE new wrapper (the [list]/track) inside the existing markup.
// ─────────────────────────────────────────────────────────────────────────────
export function initProjectsSlider() {
  if (!ensureSliderPlugins()) return;

  document.querySelectorAll("[data-gsap-slider-init]").forEach((root) => {
    // Clean up any previous instance (e.g. Barba re-entry, resize re-init).
    if (root._sliderDraggable) root._sliderDraggable.kill();

    // The wrap is allowed to also be the collection — fall back to root.
    const collection =
      root.querySelector("[data-gsap-slider-collection]") || root;
    const track = root.querySelector("[data-gsap-slider-list]");
    const items = Array.from(root.querySelectorAll("[data-gsap-slider-item]"));
    if (!track || items.length < 2) return;

    // Aria
    root.setAttribute("role", "region");
    root.setAttribute("aria-roledescription", "carousel");
    items.forEach((slide, i) => {
      slide.setAttribute("role", "group");
      slide.setAttribute("aria-roledescription", "Slide");
      slide.setAttribute("aria-label", `Slide ${i + 1} of ${items.length}`);
    });

    // Measure the per-slide stride (width + gap, regardless of margin or
    // CSS gap) by sampling the distance between consecutive items.
    const r0 = items[0].getBoundingClientRect();
    const r1 = items[1].getBoundingClientRect();
    const slideStride = r1.left - r0.left;
    if (slideStride <= 0) return; // layout not ready yet

    // Bounds + snap points.
    // We use the collection's *content-box* width (excluding its own padding)
    // because the track sits inside that content-box. If the wrap doubles as
    // collection AND has section padding, clientWidth would include it and
    // the slider would over-scroll past the right edge.
    const collectionStyle = getComputedStyle(collection);
    const padX =
      parseFloat(collectionStyle.paddingLeft || 0) +
      parseFloat(collectionStyle.paddingRight || 0);
    const vw = collection.clientWidth - padX;
    const tw = track.scrollWidth;
    const maxScroll = Math.max(tw - vw, 0);
    const minX = -maxScroll;
    const maxX = 0;

    // No need to drag if everything fits already.
    if (maxScroll <= 0) {
      root.setAttribute("data-gsap-slider-status", "not-active");
      return;
    }
    root.setAttribute("data-gsap-slider-status", "active");

    const maxIndex = maxScroll / slideStride;
    const full = Math.floor(maxIndex);
    const snapPoints = [];
    for (let i = 0; i <= full; i++) snapPoints.push(-i * slideStride);
    if (full < maxIndex) snapPoints.push(-maxScroll);

    // Hover state for cursor styling (data attribute → style with CSS).
    track.onmouseenter = () =>
      track.setAttribute("data-gsap-slider-list-status", "grab");
    track.onmouseleave = () =>
      track.removeAttribute("data-gsap-slider-list-status");

    let activeIndex = 0;
    const setX = gsap.quickSetter(track, "x", "px");
    let collectionRect = collection.getBoundingClientRect();

    function updateStatus(x) {
      const calcX = Math.max(minX, Math.min(maxX, x));
      let closest = snapPoints[0];
      snapPoints.forEach((pt) => {
        if (Math.abs(pt - calcX) < Math.abs(closest - calcX)) closest = pt;
      });
      activeIndex = snapPoints.indexOf(closest);

      items.forEach((slide, i) => {
        const r = slide.getBoundingClientRect();
        const leftEdge = r.left - collectionRect.left;
        const slideCenter = leftEdge + r.width / 2;
        const inView = slideCenter > 0 && slideCenter < collectionRect.width;
        const status =
          i === activeIndex ? "active" : inView ? "inview" : "not-active";
        slide.setAttribute("data-gsap-slider-item-status", status);
        slide.setAttribute(
          "aria-selected",
          i === activeIndex ? "true" : "false",
        );
        // `inert` for off-screen slides (instead of aria-hidden) so a focused
        // link inside an off-screen card doesn't trigger the
        // "focused-aria-hidden" browser warning. Inert also blocks tabbing
        // and pointer events, which is what we want for slides you can't see.
        if (inView) {
          slide.removeAttribute("inert");
        } else {
          slide.setAttribute("inert", "");
        }
        slide.setAttribute("tabindex", i === activeIndex ? "0" : "-1");
      });
    }

    root._sliderDraggable = Draggable.create(track, {
      type: "x",
      inertia: true,
      bounds: { minX, maxX },
      throwResistance: 2000,
      dragResistance: 0.05,
      maxDuration: 0.6,
      minDuration: 0.2,
      edgeResistance: 0.75,
      snap: { x: snapPoints, duration: 0.4 },
      onPress() {
        track.setAttribute("data-gsap-slider-list-status", "grabbing");
        collectionRect = collection.getBoundingClientRect();
      },
      onDrag() {
        setX(this.x);
        updateStatus(this.x);
      },
      onThrowUpdate() {
        setX(this.x);
        updateStatus(this.x);
      },
      onThrowComplete() {
        setX(this.endX);
        updateStatus(this.endX);
        track.setAttribute("data-gsap-slider-list-status", "grab");
      },
      onRelease() {
        setX(this.x);
        updateStatus(this.x);
        track.setAttribute("data-gsap-slider-list-status", "grab");
      },
    })[0];

    setX(0);
    updateStatus(0);
  });
}

// Re-init on width changes so bounds + snap points match the new layout.
let _sliderResizeBound = false;
export function bindProjectsSliderResize() {
  if (_sliderResizeBound) return;
  _sliderResizeBound = true;
  let lastW = innerWidth;
  let timer;
  window.addEventListener("resize", () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (innerWidth !== lastW) {
        lastW = innerWidth;
        initProjectsSlider();
      }
    }, 200);
  });
}
