export function prepContactPage(next) {
  const page = document.querySelector("[data-contact]");
  const adoptionCurve = page.querySelector("[data-contact-adoption-curve]");
  const successResponse = page.querySelector(
    "[data-contact-form-success-response]",
  );

  gsap.set(successResponse, {
    visibility: "visible",
    autoAlpha: 0,
    yPercent: 100,
    onComplete: () => console.log("SuccessResponse has been prepped"),
  });

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

  const formBlock = form.closest(".w-form");
  const doneBlock = formBlock?.querySelector(".w-form-done");
  const failBlock = formBlock?.querySelector(".w-form-fail");

  submitBtn.addEventListener("click", (e) => {
    e.preventDefault();
    form.requestSubmit();
  });

  form.addEventListener("submit", () => {
    submitBtn.classList.add("is-submitting");
  });

  // Webflow toggles display on .w-form-done / .w-form-fail when the AJAX
  // submit resolves. We observe each separately so the success and fail
  // paths run their own handlers — styling + tweens live in those.
  function observeVisibility(el, onShow) {
    if (!el) return;
    const observer = new MutationObserver(() => {
      if (getComputedStyle(el).display !== "none") onShow();
    });
    observer.observe(el, { attributes: true, attributeFilter: ["style"] });
  }

  observeVisibility(doneBlock, () => onFormDone(form, submitBtn, doneBlock));
  observeVisibility(failBlock, () => onFormFail(form, submitBtn, failBlock));
}

function onFormDone(form, submitBtn, doneBlock) {
  const successResponse = document.querySelector(
    "[data-contact-form-success-response]",
  );
  const formHeader = document.querySelector(
    "[data-contact-form-succes-heading]",
  );

  let tl = gsap.timeline();

  tl.to(submitBtn, {
    yPercent: -50,
    autoAlpha: 0,
  })
    .to(
      form,
      {
        autoAlpha: 0,
      },
      "<50%",
    )
    .to(
      formHeader,
      {
        autoAlpha: 0,
      },
      "<",
    )
    .add(
      () =>
        (formHeader.textContent = formHeader.getAttribute(
          "data-contact-form-succes-heading",
        )),
      ">",
    )
    .to(
      formHeader,
      {
        autoAlpha: 0.5,
      },
      ">",
    )
    .to(
      successResponse,
      {
        yPercent: 0,
        autoAlpha: 1,
      },
      "<50%",
    );
}

function onFormFail(form, submitBtn, failBlock) {
  // Re-enable the submit button so the user can retry without refreshing.
  submitBtn.classList.remove("is-submitting");

  const failResponse = document.querySelector(
    "[data-contact-form-fail-response]",
  );

  // → styling + tweens hier (form blijft staan zodat user kan retry'en;
  //    eventueel een inline error-overlay tonen via failResponse).
}
