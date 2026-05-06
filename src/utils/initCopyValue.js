export function initCopyValue() {
  document.querySelectorAll("[data-copy-value]").forEach((copy) => {
    let value = copy.dataset.copyValue;

    copy.style.cursor = "copy";

    copy.addEventListener("click", () => {
      gsap
        .timeline({ defaults: { duration: 0.4 } })
        .to(copy, { scale: 0.95 })
        .to(copy, { scale: 1 });
      copy.style.cursor = "wait";
      navigator.clipboard.writeText(value);
      setTimeout(() => (copy.style.cursor = "copy"), 500);
    });
  });
}
