export function prepContactPage(next) {
  const page = document.querySelector("[data-contact]");
  const adoptionCurve = page.querySelector("[data-contact-adoption-curve]");

  gsap.set(adoptionCurve, {
    clipPath: "inset(0% 100% 0% 0%)",
  });
}

export function initContactPage() {
  const page = document.querySelector("[data-contact]");
  const adoptionCurve = page.querySelector("[data-contact-adoption-curve]");

  let tl = gsap.timeline({
    delay: 0.5,
  });

  tl.to(adoptionCurve, {
    clipPath: "inset(0% 0% 0% 0%)",
    duration: 2,
  });
}

export function initContactForm() {
  const form = document.getElementById("wf-form-Contact-Form");
  const submitBtn = document.querySelector("[data-contact-form-submit]");
  if (!form || !submitBtn) return;

  submitBtn.addEventListener("click", (e) => {
    e.preventDefault();
    form.requestSubmit();
  });

  form.addEventListener("submit", () => {
    console.log("hey alles is gelukt");
  });
}
