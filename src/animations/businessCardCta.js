import { registerCleanup } from "../utils/lifecycle";

let contactCardPromise = null;
const loadContactCard = () =>
  (contactCardPromise ??= import(
    /* webpackChunkName: "business-card" */ "../docs/erwin.vcf"
  ).then((module) => module.default));

export function prepBusinessCardCta(next = document) {
  const buttonWrap = next.querySelector("[data-business-card-button-wrap]");
  gsap.set(buttonWrap.children, { autoAlpha: 0 });
  loadContactCard();
}

export function initBusinessCardCta(next = document) {
  const buttonWrap = next.querySelector("[data-business-card-button-wrap]");
  const indicator = next.querySelector("[data-business-card-indicator-inner]");

  document.addEventListener(
    "business-card:ready",
    () => {
      // Animate In
      gsap.fromTo(
        buttonWrap.children,
        { autoAlpha: 0, yPercent: 50, filter: "blur(10px)" },
        {
          autoAlpha: 1,
          yPercent: 0,
          filter: "blur(0px)",
          stagger: 0.1,
          duration: 0.8,
        },
      );

      if (indicator) animateSwipeIndicator(indicator);
    },
    { once: true },
  );

  initAddToContacts(next);
}

const isIOS = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

// iPhone opens the vCard as a contact card; everywhere else it downloads
// as "<Full Name>.vcf".
function initAddToContacts(next) {
  const button = next.querySelector("[data-add-to-contacts-btn]");
  if (!button) return;

  async function openContactCard(event) {
    event.preventDefault();
    const vcard = await loadContactCard();
    const file = new Blob([vcard], { type: "text/vcard;charset=utf-8" });
    const url = URL.createObjectURL(file);

    if (isIOS()) {
      window.location.href = url;
      return;
    }

    const link = document.createElement("a");
    link.href = url;
    link.download = `${getFullName(vcard)}.vcf`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  button.addEventListener("click", openContactCard);
  registerCleanup(() => button.removeEventListener("click", openContactCard));
}

// A short segment (35% of the line) slides through from left to right.
function animateSwipeIndicator(indicator) {
  const swipe = gsap.fromTo(
    indicator,
    { clipPath: "inset(0% 100% 0% -35%)" },
    {
      clipPath: "inset(0% -35% 0% 100%)",
      duration: 1.08,
      ease: CustomEase.create("swipeIndicator", "0.6, 0, 0.2, 1"),
      delay: 0.5,
      repeat: -1,
      repeatDelay: 0.72,
    },
  );

  registerCleanup(() => swipe.kill());
}

const getFullName = (vcard) =>
  vcard.match(/^FN:(.+)$/m)?.[1].trim() || "Contact";
