export function getVariableValue(variableName) {
  if (!variableName) {
    throw new Error("getVariableValue requires a CSS variable name.");
  }

  const value = getComputedStyle(document.documentElement).getPropertyValue(
    variableName,
  );

  const trimmed = value.trim();

  if (trimmed.startsWith(".")) {
    return `0${trimmed}`;
  }

  return trimmed;
}

export function getCurrentSectionInView(container = document) {
  const sections = container.querySelectorAll("section");
  if (!sections.length) return null;

  const viewportHeight = window.innerHeight;
  let bestSection = sections[0];
  let bestOverlap = 0;

  sections.forEach((section) => {
    const rect = section.getBoundingClientRect();
    const overlap =
      Math.max(0, Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0));
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      bestSection = section;
    }
  });

  return bestSection;
}

export function initLiveDate() {
  const liveDateElement = document.querySelectorAll("[data-live-date]");
  const date = new Date();
  const year = date.getFullYear();

  liveDateElement.forEach((elem) => {
    elem.textContent = year;
  });
}
