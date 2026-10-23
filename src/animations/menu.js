import { getVariableValue } from "../utils/helpers";

export function initScalingNavigation() {
  const navElement = document.querySelector("[data-nav-menu]");
  const navStatusEl = document.querySelector("[data-nav-status]");

  if (!navElement || !navStatusEl) return;

  // Navigation elements
  const navCloseIcon = navElement.querySelectorAll("[data-nav-close-icon]");
  const navContent = navElement.querySelector("[data-nav-elem-content]");
  const navLinkWrap = navContent.querySelector(
    "[data-nav-elem-content-link-wrap]",
  );
  const navExternalWrap = navContent.querySelector(
    "[data-nav-elem-content-external-wrap]",
  );
  const navLinks = navLinkWrap.querySelectorAll("a");
  const navExternals = navExternalWrap.querySelectorAll("a");

  let splitLinks = SplitText.create([navLinkWrap, navExternalWrap], {
    type: "lines",
    mask: "lines",
  });

  const BASE_WIDTH =
    getVariableValue("--_elements---menu--base-width", navElement) || "10em"; // Base width of nav menu
  const TARGET_WIDTH =
    getVariableValue("--_elements---menu--target-width", navElement) || "18em"; // Target width of nav menu

  function animateOpen() {
    const tl = gsap.timeline();

    tl.to(navCloseIcon, {
      rotate: 45,
      duration: 0.4,
    })
      .to(
        navElement,
        {
          width: TARGET_WIDTH,
          overwrite: true,
        },
        "<",
      )
      .to(
        navContent,
        {
          height: "auto",
          transformOrigin: "top",
        },
        "<50%",
      )
      .fromTo(
        splitLinks.lines,
        {
          yPercent: -100,
        },
        {
          yPercent: 0,
          stagger: 0.05,
        },
        "<50%",
      );
  }

  function animateClose() {
    const tl = gsap.timeline();

    tl.to(splitLinks.lines, {
      yPercent: -100,
      stagger: 0.05,
      overwrite: true,
    })
      .to(
        navContent,
        {
          height: "0",
          transformOrigin: "top",
        },
        "<50%",
      )
      .to(
        navElement,
        {
          width: BASE_WIDTH,
        },
        "<",
      )
      .to(
        navCloseIcon,
        {
          rotate: 0,
          duration: 0.4,
        },
        "<",
      );
  }

  const setNavStatus = (status) => {
    navStatusEl.setAttribute("data-nav-status", status);
  };

  const isActive = () =>
    navStatusEl.getAttribute("data-nav-status") === "active";

  const openNav = () => {
    setNavStatus("active");
    animateOpen();
    // If you use Lenis, you could pause the scroll here:
    // Lenis.stop?.();
  };

  const closeNav = () => {
    setNavStatus("not-active");
    animateClose();
    // If you use Lenis, you could resume scroll here:
    // Lenis.start?.();
  };

  const toggleNav = () => (isActive() ? closeNav() : openNav());

  const canHover = window.matchMedia(
    "(hover: hover) and (pointer: fine)",
  ).matches;

  document.querySelectorAll('[data-nav-toggle="toggle"]').forEach((btn) => {
    if (canHover) {
      btn.addEventListener("mouseenter", toggleNav);
      btn.addEventListener("mouseleave", closeNav);
    } else {
      btn.addEventListener("click", toggleNav);
    }
  });

  // Close buttons

  document.querySelectorAll('[data-nav-toggle="close"]').forEach((btn) => {
    btn.addEventListener("click", closeNav);
  });

  if (canHover) {
    const allLinks = [...navLinks, ...navExternals];
    allLinks.forEach((link) => {
      link.addEventListener("mouseenter", () => {
        gsap.to(
          allLinks.filter((l) => l !== link),
          { autoAlpha: 0.5 },
        );
      });
      link.addEventListener("mouseleave", () => {
        gsap.to(allLinks, { autoAlpha: 1 });
      });
    });
  }

  // ESC closes
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isActive()) closeNav();
  });

  // Click Outside to close
  document.addEventListener("click", (e) => {
    if (!isActive()) return;
    if (navElement.contains(e.target)) return;
    if (e.target.closest('[data-nav-toggle="toggle"]')) return;
    closeNav();
  });
}
