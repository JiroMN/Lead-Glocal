export function initCustomCursor() {
  document.querySelectorAll("[data-follow-mouse]").forEach((cursor) => {
    let offset = cursor.dataset.followMouse.split(",");
    // let offset = [10, -110];

    console.log(offset);

    gsap.set(cursor, {
      xPercent: parseInt(offset[0]),
      yPercent: parseInt(offset[1]),
    });

    let xTo = gsap.quickTo(cursor, "x", { duration: 0.6, ease: "power3" });
    let yTo = gsap.quickTo(cursor, "y", { duration: 0.6, ease: "power3" });

    window.addEventListener("mousemove", (e) => {
      xTo(e.clientX);
      yTo(e.clientY);
    });
  });
}
