// This needs to have layoutManager.js installed in the project for this to work
export function initLayoutManager() {
  if (!layoutManager) {
    console.warn(
      "layoutManager not found. Please ensure layoutManager.js is included in the project.",
    );
    return;
  }
  layoutManager.teleport([
    {
      // The ecosystem map goes below the text and the theme list.
      element: "[data-ecosystems-map-wrap]",
      target: "[data-ecosystem-info-col]",
      breakpoint: "(max-width: 991px)",
      position: 2,
    },
    {
      element: "[data-services-description-wrap]",
      target: "[data-services]",
      breakpoint: "(max-width: 991px)",
      position: 2,
    },
  ]);
}
