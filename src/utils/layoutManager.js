// This needs to have layoutManager.js installed in the project for this to work
export function initLayoutManager() {
  layoutManager.teleport([
    {
      element: "[data-ecosystems-map-wrap]",
      target: "[data-ecosystem-info-col]",
      breakpoint: "(max-width: 991px)",
      position: 1,
    },
    {
      element: "[data-services-description-wrap]",
      target: "[data-services]",
      breakpoint: "(max-width: 991px)",
      position: 2,
    },
  ]);
}
