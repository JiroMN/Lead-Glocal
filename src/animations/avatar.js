export function initAvatar() {
  document.querySelectorAll("[data-avatar]").forEach((avatar) => {
    const ring = avatar.querySelector("[data-avatar-ring]");

    let tl = gsap.timeline({
      repeat: -1,
    });

    tl.to(ring, { rotate: 360, duration: 25, ease: "none" });
  });
}
