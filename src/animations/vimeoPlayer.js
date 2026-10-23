export function initVimeoLightboxAdvanced() {
  // Single lightbox container
  const lightbox = document.querySelector("[data-vimeo-lightbox-init]");
  if (!lightbox) return;

  // Open & close buttons
  const openButtons = document.querySelectorAll(
    '[data-vimeo-lightbox-control="open"]',
  );
  const closeButtons = document.querySelectorAll(
    '[data-vimeo-lightbox-control="close"]',
  );

  // Core elements inside lightbox
  let iframe = lightbox.querySelector("iframe"); // ← now let
  const placeholder = lightbox.querySelector(".vimeo-lightbox__placeholder");
  const calcEl = lightbox.querySelector(".vimeo-lightbox__calc");
  const wrapEl = lightbox.querySelector(".vimeo-lightbox__calc-wrap");
  const playerContainer = lightbox.querySelector(
    "[data-vimeo-lightbox-player]",
  );

  // State
  let player = null;
  let currentVideoID = null;
  let videoAspectRatio = null;
  let globalMuted = lightbox.getAttribute("data-vimeo-muted") === "true";
  const isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  const playedOnce = new Set(); // track first play on touch

  // Format time (seconds → "m:ss")
  function formatTime(s) {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60)
      .toString()
      .padStart(2, "0");
    return `${m}:${sec}`;
  }

  // Clamp wrap height
  function clampWrapSize(ar) {
    const w = calcEl.offsetWidth;
    const h = calcEl.offsetHeight;
    wrapEl.style.maxWidth = Math.min(w, h / ar) + "px";
  }

  // Adjust sizing in "cover" mode
  function adjustCoverSizing() {
    if (!videoAspectRatio) return;
    const cH = playerContainer.offsetHeight;
    const cW = playerContainer.offsetWidth;
    const r = cH / cW;
    const wEl = lightbox.querySelector(".vimeo-lightbox__iframe");
    if (r > videoAspectRatio) {
      wEl.style.width = (r / videoAspectRatio) * 100 + "%";
      wEl.style.height = "100%";
    } else {
      wEl.style.height = (videoAspectRatio / r) * 100 + "%";
      wEl.style.width = "100%";
    }
  }

  // Close & pause lightbox
  function closeLightbox() {
    lightbox.setAttribute("data-vimeo-activated", "false");
    if (player) {
      player.pause();
      lightbox.setAttribute("data-vimeo-playing", "false");
    }
  }

  // Wire Escape key & close buttons
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeLightbox();
  });
  closeButtons.forEach((btn) => btn.addEventListener("click", closeLightbox));

  // Setup Vimeo Player event handlers
  function setupPlayerEvents() {
    // Hide placeholder when playback starts
    player.on("play", () => {
      lightbox.setAttribute("data-vimeo-loaded", "true");
      lightbox.setAttribute("data-vimeo-playing", "true");
    });
    // Close on video end
    player.on("ended", closeLightbox);

    // Paused
    player.on("pause", () => {
      lightbox.setAttribute("data-vimeo-playing", "false");
    });

    // Duration UI
    const durEl = lightbox.querySelector("[data-vimeo-duration]");
    player.getDuration().then((d) => {
      if (durEl) durEl.textContent = formatTime(d);
      lightbox
        .querySelectorAll('[data-vimeo-control="timeline"],progress')
        .forEach((el) => (el.max = d));
    });

    // Timeline & progress updates
    const tl = lightbox.querySelector('[data-vimeo-control="timeline"]');
    const pr = lightbox.querySelector("progress");
    player.on("timeupdate", (data) => {
      if (tl) tl.value = data.seconds;
      if (pr) pr.value = data.seconds;
      if (durEl) durEl.textContent = formatTime(Math.trunc(data.seconds));
    });
    if (tl) {
      ["input", "change"].forEach((evt) =>
        tl.addEventListener(evt, (e) => {
          const v = e.target.value;
          player.setCurrentTime(v);
          if (pr) pr.value = v;
        }),
      );
    }

    // Hover → hide controls after a timeout
    let hoverTimer;
    playerContainer.addEventListener("mousemove", () => {
      lightbox.setAttribute("data-vimeo-hover", "true");
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(() => {
        lightbox.setAttribute("data-vimeo-hover", "false");
      }, 3000);
    });

    // Fullscreen toggle on player container
    const fsBtn = lightbox.querySelector('[data-vimeo-control="fullscreen"]');
    if (fsBtn) {
      const isFS = () =>
        document.fullscreenElement || document.webkitFullscreenElement;
      if (!(document.fullscreenEnabled || document.webkitFullscreenEnabled)) {
        fsBtn.style.display = "none";
      }
      fsBtn.addEventListener("click", () => {
        if (isFS()) {
          lightbox.setAttribute("data-vimeo-fullscreen", "false");
          (document.exitFullscreen || document.webkitExitFullscreen).call(
            document,
          );
        } else {
          lightbox.setAttribute("data-vimeo-fullscreen", "true");
          (
            playerContainer.requestFullscreen ||
            playerContainer.webkitRequestFullscreen
          ).call(playerContainer);
        }
      });
      ["fullscreenchange", "webkitfullscreenchange"].forEach((evt) =>
        document.addEventListener(evt, () =>
          lightbox.setAttribute(
            "data-vimeo-fullscreen",
            isFS() ? "true" : "false",
          ),
        ),
      );
    }
  }

  // Run sizing logic
  async function runSizing() {
    const mode = lightbox.getAttribute("data-vimeo-update-size");
    const w = await player.getVideoWidth();
    const h = await player.getVideoHeight();
    const ar = h / w;
    const bef = lightbox.querySelector(".vimeo-lightbox__before");

    if (mode === "true") {
      if (bef) bef.style.paddingTop = ar * 100 + "%";
      clampWrapSize(ar);
    } else if (mode === "cover") {
      videoAspectRatio = ar;
      if (bef) bef.style.paddingTop = "0%";
      adjustCoverSizing();
    } else {
      clampWrapSize(ar);
    }
  }

  // Re-run sizing on viewport resize
  window.addEventListener("resize", () => {
    if (player) runSizing();
  });

  // Open or switch video
  async function openLightbox(id, placeholderBtn) {
    // Enter loading state immediately
    lightbox.setAttribute("data-vimeo-activated", "loading");
    lightbox.setAttribute("data-vimeo-loaded", "false");

    // — FULL RESET if new video ID —
    if (player && id !== currentVideoID) {
      await player.pause();
      await player.unload();

      // Replace old iframe with a fresh one
      const oldIframe = iframe;
      const newIframe = document.createElement("iframe");
      newIframe.className = oldIframe.className;
      newIframe.setAttribute("allow", oldIframe.getAttribute("allow"));
      newIframe.setAttribute("frameborder", "0");
      newIframe.setAttribute("allowfullscreen", "true");
      newIframe.setAttribute("allow", "autoplay; encrypted-media");
      oldIframe.parentNode.replaceChild(newIframe, oldIframe);

      // Reset state
      iframe = newIframe;
      player = null;
      currentVideoID = null;
      lightbox.setAttribute("data-vimeo-playing", "false");
    }

    // Update placeholder image attributes
    if (placeholderBtn) {
      ["src", "srcset", "sizes", "alt", "width"].forEach((attr) => {
        const val = placeholderBtn.getAttribute(attr);
        if (val != null) placeholder.setAttribute(attr, val);
      });
    }

    // Build a brand-new player if needed
    if (!player) {
      iframe.src = `https://player.vimeo.com/video/${id}?api=1&background=1&autoplay=0&loop=0&muted=0`;
      player = new Vimeo.Player(iframe);
      setupPlayerEvents();
      currentVideoID = id;
      await runSizing();
    }

    // Now sizing is ready — show lightbox
    lightbox.setAttribute("data-vimeo-activated", "true");

    // Autoplay logic
    if (!isTouch) {
      player.setVolume(globalMuted ? 0 : 1).then(() => {
        lightbox.setAttribute("data-vimeo-playing", "true");
        setTimeout(() => player.play(), 50);
      });
    } else if (playedOnce.has(currentVideoID)) {
      player.setVolume(globalMuted ? 0 : 1).then(() => {
        lightbox.setAttribute("data-vimeo-playing", "true");
        player.play();
      });
    }
  }

  // Internal controls
  lightbox
    .querySelector('[data-vimeo-control="play"]')
    .addEventListener("click", () => {
      if (isTouch) {
        if (!playedOnce.has(currentVideoID)) {
          player.setVolume(0).then(() => {
            lightbox.setAttribute("data-vimeo-playing", "true");
            player.play();
            if (!globalMuted) {
              setTimeout(() => {
                player.setVolume(1);
                lightbox.setAttribute("data-vimeo-muted", "false");
              }, 100);
            }
            playedOnce.add(currentVideoID);
          });
        } else {
          player.setVolume(globalMuted ? 0 : 1).then(() => {
            lightbox.setAttribute("data-vimeo-playing", "true");
            player.play();
          });
        }
      } else {
        player.setVolume(globalMuted ? 0 : 1).then(() => {
          lightbox.setAttribute("data-vimeo-playing", "true");
          setTimeout(() => player.play(), 50);
        });
      }
    });

  lightbox
    .querySelector('[data-vimeo-control="pause"]')
    .addEventListener("click", () => {
      player.pause();
    });

  lightbox
    .querySelector('[data-vimeo-control="mute"]')
    .addEventListener("click", () => {
      globalMuted = !globalMuted;
      player
        .setVolume(globalMuted ? 0 : 1)
        .then(() =>
          lightbox.setAttribute(
            "data-vimeo-muted",
            globalMuted ? "true" : "false",
          ),
        );
    });

  // Wire up open buttons
  openButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const vid = btn.getAttribute("data-vimeo-lightbox-id");
      const img = btn.querySelector("[data-vimeo-lightbox-placeholder]");
      openLightbox(vid, img);
    });
  });
}

export function initThumbnail() {
  const thumbnail = document.querySelector("[data-vimeo-player-thumbnail]");
  const button = thumbnail.querySelector("[data-vimeo-player-button]");

  thumbnail.addEventListener("mouseenter", function () {
    gsap.to(button, {
      scale: 1.1,
    });
  });
  thumbnail.addEventListener("mouseleave", function () {
    gsap.to(button, {
      scale: 1,
    });
  });
}
