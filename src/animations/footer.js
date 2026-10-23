import { getVariableValue } from "../utils/helpers";

export function initFooter() {
  document.querySelectorAll("[data-footer]").forEach((footer) => {
    // Live Footer Data Elements
    const country = footer.querySelector("[data-footer-country]"); // e.g. "NED"
    const time = footer.querySelector("[data-footer-time]"); // hh:mm:ss
    const timezone = footer.querySelector("[data-footer-time-zone]"); // e.g. "(GMT+1)"
    const year = footer.querySelector("[data-footer-year]"); // e.g. "2024"'

    function updateTime() {
      const now = new Date();
      const options = { hour: "2-digit", minute: "2-digit", second: "2-digit" };
      time.textContent = now.toLocaleTimeString([], options);
    }

    function updateTimezone() {
      const offsetMin = -new Date().getTimezoneOffset();
      const sign = offsetMin >= 0 ? "+" : "-";
      const abs = Math.abs(offsetMin);
      const hours = Math.floor(abs / 60);
      const minutes = abs % 60;
      timezone.textContent =
        minutes === 0
          ? `(GMT${sign}${hours})`
          : `(GMT${sign}${hours}:${String(minutes).padStart(2, "0")})`;
    }

    // Set the year once on load
    if (year) {
      year.textContent = new Date().getFullYear();
    }

    // Update the time every second
    if (time) {
      updateTime();
      setInterval(updateTime, 1000);
    }

    if (timezone) {
      updateTimezone();
    }

    async function updateCountry() {
      try {
        const res = await fetch("https://ipapi.co/json/");
        if (!res.ok) throw new Error("ipapi failed");
        const data = await res.json();
        // Prefer 3-letter ISO (NLD, DEU, USA) for visual weight; fall back
        // to the 2-letter code if that's all the API returns.
        const code = data.country_code_iso3 || data.country_code;
        if (code) {
          country.textContent = code.toUpperCase();
          return;
        }
        throw new Error("no country in response");
      } catch {
        // Browser locale fallback — e.g. "nl-NL" → "NL". Less accurate
        // (it's the user's preferred region, not their actual location)
        // but always available.
        const region = (navigator.language || "").split("-")[1];
        if (region) country.textContent = region.toUpperCase();
      }
    }

    if (country) {
      updateCountry();
    }

    // AOS animation
    const brandmark = footer.querySelector("[data-footer-brandmark]");
    const wordmark = footer.querySelector("[data-footer-wordmark]");
    const linkWrap = footer.querySelectorAll("[data-footer-p-wrap]");
    const links = footer.querySelectorAll("[data-footer-p]");
    const linkClips = footer.querySelectorAll("[data-footer-p]");

    const linksSplit = SplitText.create(links, {
      type: "lines",
      mask: "lines",
    });

    const dynamicLinkWrappers = footer.querySelectorAll(
      "[data-footer-live-data]",
    );
    let dynamicLinks = [];
    dynamicLinkWrappers.forEach((wrapper) => {
      dynamicLinks.push(...wrapper.children);
    });

    const TL_ST_CONFIG = {
      trigger: footer,
      start: "top-=20% 80%",
      end: "bottom bottom",
      scrub: 1,
    };

    let aosTl = gsap.timeline({
      scrollTrigger: TL_ST_CONFIG,
      defaults: {
        ease: "power1.out",
      },
    });

    aosTl
      .from(brandmark, {
        scale: 0.7,
      })
      .from(
        wordmark,
        {
          yPercent: 75,
        },
        ">",
      );

    let aosLinkTl = gsap.timeline({
      scrollTrigger: { ...TL_ST_CONFIG, start: "top 80%", once: false },
      defaults: {
        ease: "power1.out",
      },
    });

    aosLinkTl
      .from(linksSplit.lines, {
        yPercent: 101,
      })
      .from(
        dynamicLinks,
        {
          yPercent: 101,
        },
        "<",
      );
  });

  // Hover animations
  const TARGET_COLOR = getVariableValue("--_colors---secondary");
  const BASE_COLOR = getVariableValue("--_colors---foreground-tones--75");

  document.querySelectorAll("[data-footer-p-wrap]").forEach((linkWrap) => {
    const link = linkWrap.querySelectorAll("[data-footer-p]");
    const linkClip = linkWrap.querySelectorAll("[data-footer-p-clip]");

    linkWrap.addEventListener("mouseenter", () => {
      gsap.fromTo(
        linkClip,
        {
          clipPath: "inset(0% 100% 0% 0%)",
        },
        {
          clipPath: "inset(0% 0% 0% 0%)",
        },
      );
    });
    linkWrap.addEventListener("mouseleave", () => {
      gsap.to(linkClip, {
        clipPath: "inset(0% 0% 0% 100%)",
      });
    });
  });
}
