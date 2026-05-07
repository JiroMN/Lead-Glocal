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
    const overlap = Math.max(
      0,
      Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0),
    );
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

export function debounce(fn, delay = 200) {
  let timeout;
  return () => {
    clearTimeout(timeout);
    timeout = setTimeout(fn, delay);
  };
}

// Parse a Webflow date string into a Date object. Handles common Webflow
// formats including:
//   • "April 24, 2026"
//   • "April 24, 2026 14:30"   (when format includes time)
//   • "Apr 24, 2026"
//   • "2026-04-24"
//   • ISO 8601
//
// Returns null on empty/unparseable input so callers can do `if (!d) return`
// without surprise NaN comparisons.
export function parseWebflowDate(str) {
  if (!str) return null;
  const trimmed = String(str).trim();

  // Try native parser first — handles most formats in modern browsers.
  const native = new Date(trimmed);
  if (!isNaN(native.getTime())) return native;

  // Fallback for strict browsers: explicitly parse "Month D, YYYY [HH:mm]".
  const match = trimmed.match(
    /^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/,
  );
  if (!match) return null;

  const [, monthName, day, year, hour, minute] = match;
  const months = {
    january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
    july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
    jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, aug: 7,
    sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
  };
  const monthIdx = months[monthName.toLowerCase()];
  if (monthIdx === undefined) return null;

  const fallback = new Date(
    parseInt(year, 10),
    monthIdx,
    parseInt(day, 10),
    hour ? parseInt(hour, 10) : 0,
    minute ? parseInt(minute, 10) : 0,
  );
  return isNaN(fallback.getTime()) ? null : fallback;
}
