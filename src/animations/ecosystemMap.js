import { registerCleanup } from "../utils/lifecycle";

// The ecosystem map in [data-ecosystems]: a map of Northern Europe made of
// cells (see ../3d/ecosystemMap), with the projects as pins. It follows the
// theme the theme selector puts on the section, and the selected countries.
//
// In Webflow:
//   [data-ecosystem-map]            where the map goes; without it the map
//                                   fills [data-ecosystems-map-wrap]
//   [data-ecosystem-projects]       the wrap of the CMS list of projects;
//                                   hidden on the live site (CSS embed)
//   [data-ecosystem-project]        one per project (the CMS item), with:
//       data-title, data-place      texts in the tooltip
//       data-coordinates            "52.3676, 4.9041": latitude, longitude,
//                                   as copied from Google Maps; or data-lat
//                                   and data-lon. Without them the project
//                                   is not on the map.
//       data-slug                   the project page becomes /projecten/slug;
//                                   or data-url with the whole address
//       data-logo                   optional, image in the tooltip; without
//                                   it the image in the card is used
//       data-themes                 theme slugs, comma separated; or inside
//                                   the item one [data-ecosystem-project-theme="slug"]
//                                   per theme (a nested CMS list)
//       [data-ecosystem-tooltip]    inside the item: its card, shown as the
//                                   tooltip of its pin (hooks further down)
//   [data-ecosystem-theme-projects="theme-slug"]  the other way round, per
//                                   theme (a nested CMS list in the theme
//                                   item), with one
//       [data-ecosystem-theme-project="project-slug"] per project
//   Without any project the demo list below is shown.
//
//   On [data-ecosystems]:
//   [data-ecosystem-selected-theme="slug"]       set by the theme selector;
//                                                empty = every theme
//   [data-ecosystem-selected-countries="NL,BE"]  the selected countries;
//                                                empty = all. The map keeps
//                                                it up to date, and follows
//                                                it when something else
//                                                changes it.
//   [data-ecosystem-dot-size="5"]                px or em ("0.3em") between
//                                                the dots, at least
//   [data-ecosystem-pulse-interval="10"]         seconds between pulses
//   [data-ecosystem-pulses="off"]                no pulses
//   [data-ecosystem-country-selector="off"]      no pill in the map
//
//   An own country selector, anywhere in the section:
//   [data-ecosystem-country="NL"]         a click switches that country on or
//                                         off; gets aria-pressed="true/false"
//                                         and data-ecosystem-country-status
//                                         ="active" / "not-active"
//   [data-ecosystem-region="NL,BE"]       a region: a click selects exactly
//                                         these countries ("all" = every
//                                         country). Gets
//                                         data-ecosystem-region-status
//                                         ="active" while exactly its
//                                         countries are selected, however
//                                         they got selected; "not-active"
//                                         otherwise
//   [data-ecosystem-country-dot]          inside a country: filled in while
//                                         the country is selected
//   [data-ecosystem-country-count]        inside a country: its number of
//                                         projects within the selected theme
//   [data-ecosystem-countries-label]      gets "Alle landen", "3 landen" or
//                                         the name of the one country
//   With any of these in the section the pill in the map is left out.
//   [data-ecosystem-filter]               the wrap of the selector; gets
//                                         data-ecosystem-filter-status="open"
//                                         / "closed"
//   [data-ecosystem-filter-toggle]        the button that opens and closes it
//   [data-ecosystem-filter-options]       the panel with the countries
//   How open, closed and a selected country look is in the CSS embed in the
//   section in Webflow.
//   [data-ecosystem-back]                 an own back button, shown while
//                                         zoomed in on a cluster
//
//   An own tooltip, designed in Webflow. Inside a [data-ecosystem-project]
//   it is the card of that project and keeps its own texts; outside the
//   projects it is one template the map copies for every pin and fills in.
//   Without any the map draws its own.
//   [data-ecosystem-tooltip]              the card of one project, with inside:
//       [data-ecosystem-tooltip-title]    the title
//       [data-ecosystem-tooltip-place]    place and country
//       [data-ecosystem-tooltip-logo]     an image (or a div that gets the
//                                         logo as background); hidden
//                                         without a logo
//       [data-ecosystem-tooltip-initials] the initials, hidden with a logo
//       [data-ecosystem-tooltip-link]     the link to the project page, only
//                                         shown once the pin is clicked
//   [data-ecosystem-cluster-tooltip]      optional, the card of a cluster:
//       [data-ecosystem-tooltip-count]    the number of projects
//       [data-ecosystem-tooltip-title]    "7 projecten"
//       [data-ecosystem-tooltip-place]    the places
//
//   Add ?map-debug to the URL to see the cell and coordinates under the
//   mouse and where every project ended up.
const settings = {
  map: {
    // The least distance between two dots, in px or in em of the map
    // ("0.3em"). The cells are fixed in the geography, so the distance on
    // screen lies between this and this × range.
    dot: { target: 5, min: 5, widthDivisor: 58, range: 1.5, scale: 0.36 },
    colors: { dot: "#C2BFD2", accent: "#2430B8", active: "#2D1C59" },
    // Only the selected countries are drawn, and the view fits them whole.
    contextCountries: false,
    pin: { minHead: 9, headScale: 2.3, clusterScale: 1.22, mergeFactor: 2.9 },
    clusterZoom: true,
    frame: {
      top: 64,
      side: 22,
      bottom: 22,
      marginKm: 35,
      marginFraction: 0.1,
      minExtentKm: 160,
      fit: "countries",
      // Countries no larger than this are shown whole once they hold a
      // project in view, so the Netherlands never loses Zeeland or Limburg.
      wholeCountryKm: 450,
    },
    pulse: { enabled: true, interval: 10, travel: 2.8, radius: 230, strength: 0.32 },
    reveal: { enabled: true, threshold: 0.25 },
    cameraDuration: 0.9,
  },
  themeAttribute: "data-ecosystem-selected-theme",
  countriesAttribute: "data-ecosystem-selected-countries",
  debugParameter: "map-debug",
  // Where the project pages live: this + the slug of the project.
  projectPath: "/projecten/",
  // The height of the map when the layout gives it none of its own.
  height: "clamp(600px, 60vw, 900px)",
  heightMobile: "clamp(380px, 105vw, 620px)", // below 992 px
  // Projects until they come from the CMS: [title, place, lat, lon, themes].
  demoProjects: [
    ["Waterstofhaven-coalitie", "Rotterdam", 51.92, 4.48, "energie-transitie,netwerk-kennis-facilitatie"],
    ["Digitale overheid-lab", "Den Haag", 52.08, 4.3, "technologisering"],
    ["Warmte-innovatiecampus", "Delft", 52.01, 4.36, "energie-transitie,technologisering"],
    ["Life sciences-talent", "Leiden", 52.16, 4.49, "leven-lang-ontwikkelen,arbeidsmarkt"],
    ["Klimaatadaptieve delta", "Dordrecht", 51.81, 4.67, "groene-en-circulaire-transities"],
    ["Circulaire metropool", "Amsterdam", 52.37, 4.9, "groene-en-circulaire-transities,netwerk-kennis-facilitatie"],
    ["Regionale energiestrategie", "Utrecht", 52.09, 5.12, "energie-transitie"],
    ["Eiwittransitie-netwerk", "Wageningen", 51.97, 5.66, "groene-en-circulaire-transities,netwerk-kennis-facilitatie"],
    ["Arbeidsmarkt Brainport", "Eindhoven", 51.44, 5.47, "arbeidsmarkt,technologisering"],
    ["Waterstofvallei Noord", "Groningen", 53.22, 6.57, "energie-transitie"],
    ["Circulaire havenregio", "Gent", 51.05, 3.72, "groene-en-circulaire-transities"],
    ["Chemiecluster in transitie", "Antwerpen", 51.22, 4.4, "energie-transitie,arbeidsmarkt"],
    ["Zorgwerk van morgen", "Leuven", 50.88, 4.7, "leven-lang-ontwikkelen,arbeidsmarkt"],
    ["Wind-naar-waterstof", "Hamburg", 53.55, 9.99, "energie-transitie"],
    ["Van kolen naar kennis", "Essen", 51.46, 7.01, "leven-lang-ontwikkelen,arbeidsmarkt"],
    ["Warmtenet-alliantie", "Kopenhagen", 55.68, 12.57, "energie-transitie,netwerk-kennis-facilitatie"],
    ["Food Valley Jutland", "Aarhus", 56.16, 10.2, "groene-en-circulaire-transities"],
    ["Elektrische mobiliteit", "Oslo", 59.91, 10.75, "technologisering,energie-transitie"],
    ["Offshore wind-cluster", "Stavanger", 58.97, 5.73, "energie-transitie"],
    ["Fossielvrij staal", "Stockholm", 59.33, 18.07, "technologisering,groene-en-circulaire-transities"],
    ["Haven als energiehub", "Göteborg", 57.71, 11.97, "energie-transitie"],
    ["Circulaire bio-economie", "Helsinki", 60.17, 24.94, "groene-en-circulaire-transities"],
    ["Skills-coalitie Pirkanmaa", "Tampere", 61.5, 23.76, "leven-lang-ontwikkelen,arbeidsmarkt"],
  ],
};

let map = null;

let mapEngine = null;
const loadMapEngine = () =>
  (mapEngine ??= import(
    /* webpackChunkName: "ecosystem-map" */ "../3d/ecosystemMap"
  ));

export function initEcosystemMap(next = document) {
  const section = next.querySelector("[data-ecosystems]");
  const host =
    section?.querySelector("[data-ecosystem-map]") ||
    section?.querySelector("[data-ecosystems-map-wrap]");
  if (!host) return;

  const { themeAttribute, countriesAttribute } = settings;
  const ownSelectors = [
    ...section.querySelectorAll("[data-ecosystem-country], [data-ecosystem-region]"),
  ];
  const label = section.querySelector("[data-ecosystem-countries-label]");
  const readList = (attribute) =>
    (section.getAttribute(attribute) || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

  let active = true;
  let observer = null;
  // What was in the wrap as a still of the map makes room for the map; the
  // selector, back button and tooltips stay.
  const previous = [...host.children].filter((element) =>
    element.matches(
      "svg, img, picture, .w-embed, [data-ecosystems-map], [data-ecosystem-map-fallback]",
    ),
  );
  const filter = section.querySelector("[data-ecosystem-filter]");
  const filterToggle = section.querySelector("[data-ecosystem-filter-toggle]");
  const filterOptions = section.querySelector("[data-ecosystem-filter-options]");
  const back = section.querySelector("[data-ecosystem-back]");
  const listeners = [];
  const listen = (target, type, handler) => {
    target.addEventListener(type, handler);
    listeners.push(() => target.removeEventListener(type, handler));
  };
  registerCleanup(() => {
    active = false;
    observer?.disconnect();
    map?.destroy();
    map = null;
    host.removeAttribute("data-ecosystem-map-host");
    previous.forEach((element) => (element.style.display = ""));
    listeners.forEach((remove) => remove());
  });

  addLayoutStyles();
  if (back) gsap.set(back, { autoAlpha: 0 });
  // Open and closed are styled in the CSS embed in Webflow, on this attribute.
  const statusAttribute = "data-ecosystem-filter-status";
  const filterState = filter || filterOptions;
  filterState?.setAttribute(statusAttribute, "closed");
  host.setAttribute("data-ecosystem-map-host", "");

  // Own tooltips designed in Webflow: the map copies them, the originals
  // are taken out of sight.
  const tooltips = Object.fromEntries(
    [
      ["project", "[data-ecosystem-tooltip]"],
      ["cluster", "[data-ecosystem-cluster-tooltip]"],
    ].map(([kind, selector]) => {
      // The cards inside the projects belong to those projects.
      const element = [...section.querySelectorAll(selector)].find(
        (candidate) => !candidate.closest("[data-ecosystem-project]"),
      );
      const copy = element?.cloneNode(true) || null;
      if (element) element.style.display = "none";
      return [kind, copy];
    }),
  );

  loadMapEngine().then(({ createEcosystemMap, defaults }) => {
    if (!active) return;
    const all = defaults.countries;
    const names = defaults.labels.names;
    const isRegion = (element) => element.hasAttribute("data-ecosystem-region");
    // The countries of a selector that are on the map; "all" is every country.
    const codesOf = (element) => {
      const codes = (
        element.getAttribute("data-ecosystem-region") ??
        element.getAttribute("data-ecosystem-country")
      )
        .split(",")
        .map((code) => code.trim().toUpperCase());
      return codes.includes("ALL") ? all : all.filter((code) => codes.includes(code));
    };

    // Keeps the attribute and an own selector in step with the map.
    function reflect({ countries }) {
      const value = countries.length === all.length ? "" : countries.join(",");
      if ((section.getAttribute(countriesAttribute) || "") !== value)
        section.setAttribute(countriesAttribute, value);
      const counts = map?.countPerCountry() || {};
      ownSelectors.forEach((element) => {
        const codes = codesOf(element);
        const region = isRegion(element);
        // A region is active while exactly its countries are selected,
        // whichever way they got selected.
        const pressed = region
          ? codes.length === countries.length &&
            codes.every((code) => countries.includes(code))
          : countries.includes(codes[0]);
        element.setAttribute("aria-pressed", pressed);
        element.setAttribute(
          `data-ecosystem-${region ? "region" : "country"}-status`,
          pressed ? "active" : "not-active",
        );
        if (region) return;
        const code = codes[0];
        const count = element.querySelector("[data-ecosystem-country-count]");
        if (count) count.textContent = counts[code] ?? 0;
      });
      if (label)
        label.textContent =
          countries.length === all.length
            ? defaults.labels.all
            : countries.length === 1
              ? names[countries[0]]
              : `${countries.length} ${defaults.labels.countries}`;
    }

    map = createEcosystemMap(host, {
      ...settings.map,
      ...readMapSettings(section),
      projects: readProjects(next),
      selected: readList(countriesAttribute).map((code) => code.toUpperCase()),
      countrySelector:
        !ownSelectors.length &&
        section.getAttribute("data-ecosystem-country-selector") !== "off",
      debug: new URLSearchParams(location.search).has(settings.debugParameter),
      tooltip: tooltips,
      onChange: reflect,
      backButton: !back,
      onFocus: (focused) =>
        back &&
        gsap.to(back, { autoAlpha: focused ? 1 : 0, duration: 0.25, overwrite: true }),
    });
    if (!map) {
      // No WebGL2: what was in the wrap (a still of the map) stays in place.
      host.removeAttribute("data-ecosystem-map-host");
      return;
    }
    // Whatever was in the wrap makes room for the map.
    previous.forEach((element) => (element.style.display = "none"));
    map.setTheme(section.getAttribute(themeAttribute));
    reflect(map.state);

    observer = new MutationObserver(() => {
      map.setTheme(section.getAttribute(themeAttribute));
      map.setCountries(
        readList(countriesAttribute).map((code) => code.toUpperCase()),
        { silent: true },
      );
      reflect(map.state);
    });
    observer.observe(section, {
      attributes: true,
      attributeFilter: [themeAttribute, countriesAttribute],
    });

    if (back) listen(back, "click", () => map.back());

    // The own buttons are divs in Webflow: reachable and usable by keyboard.
    [back, filterToggle, ...ownSelectors].filter(Boolean).forEach((element) => {
      if (element.matches("button, a")) return;
      element.setAttribute("role", "button");
      element.setAttribute("tabindex", "0");
      listen(element, "keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        element.click();
      });
    });

    // The own selector opens and closes on its button, and closes on a click
    // next to it or on Escape.
    if (filterToggle && filterOptions) {
      let open = false;
      const setOpen = (value) => {
        if (open === value) return;
        open = value;
        filterState.setAttribute(statusAttribute, open ? "open" : "closed");
        filterToggle.setAttribute("aria-expanded", open);
      };
      listen(filterToggle, "click", () => setOpen(!open));
      listen(document, "click", (event) => {
        if (!(filter || filterOptions).contains(event.target) &&
            !filterToggle.contains(event.target)) setOpen(false);
      });
      listen(document, "keydown", (event) => {
        if (event.key === "Escape") setOpen(false);
      });
    }

    ownSelectors.forEach((element) =>
      listen(element, "click", () => {
        const codes = codesOf(element);
        if (!codes.length) return;
        // A region only selects its countries; what lights up follows from
        // the selection.
        if (isRegion(element)) return map.setCountries(codes);
        const code = codes[0];
        const selected = map.state.countries;
        const nextSelection = selected.includes(code)
          ? selected.filter((other) => other !== code)
          : [...selected, code];
        // At least one country always stays selected.
        if (nextSelection.length) map.setCountries(nextSelection);
      }),
    );
  });
}

// One entry point to steer the map from elsewhere:
//   ecosystemMapController("countries", ["NL", "BE"])
//   ecosystemMapController("theme", "energie-transitie")   ("" = every theme)
//   ecosystemMapController("replay")                       build up again
//   ecosystemMapController("pause") / ("resume")
//   ecosystemMapController("set", { pulse: { interval: 14 } })
export function ecosystemMapController(command, value) {
  if (!map) return;
  const commands = {
    countries: (codes) => map.setCountries(codes),
    theme: (slug) => map.setTheme(slug),
    replay: () => map.replay(),
    pause: () => map.pause(),
    resume: () => map.resume(),
    set: (changes) => map.set(changes),
  };
  if (!commands[command]) {
    console.warn(`ecosystemMapController: unknown command "${command}"`);
    return;
  }
  return commands[command](value);
}

function readProjects(scope) {
  // The themes of a project, as listed per theme.
  const themesOf = {};
  scope.querySelectorAll("[data-ecosystem-theme-projects]").forEach((list) => {
    const theme = list.getAttribute("data-ecosystem-theme-projects");
    list.querySelectorAll("[data-ecosystem-theme-project]").forEach((item) => {
      const slug = item.getAttribute("data-ecosystem-theme-project");
      (themesOf[slug] ??= []).push(theme);
    });
  });
  const projects = [...scope.querySelectorAll("[data-ecosystem-project]")].map(
    (element) => {
      const { title, place, coordinates, slug, url, logo, themes } =
        element.dataset;
      const nested = [
        ...element.querySelectorAll("[data-ecosystem-project-theme]"),
      ].map((theme) => theme.getAttribute("data-ecosystem-project-theme"));
      const card = element.querySelector("[data-ecosystem-tooltip]");
      // "52.3676, 4.9041"; Webflow may write a decimal comma.
      const [lat, lon] = (
        (coordinates || "").match(/-?\d+(?:[.,]\d+)?/g) || [
          element.dataset.lat,
          element.dataset.lon,
        ]
      ).map((value) => String(value ?? "").replace(",", "."));
      return {
        title,
        place,
        lat,
        lon,
        url: url || (slug ? settings.projectPath + slug : ""),
        logo:
          logo ||
          card
            ?.querySelector("img[data-ecosystem-tooltip-logo]:not(.w-condition-invisible)")
            ?.getAttribute("src") ||
          "",
        card,
        themes: [...(themes || "").split(","), ...nested, ...(themesOf[slug] || [])],
      };
    },
  );
  if (projects.length) return projects;
  return settings.demoProjects.map(([title, place, lat, lon, themes]) => ({
    title,
    place,
    lat,
    lon,
    themes,
  }));
}

function readMapSettings(section) {
  const { ecosystemDotSize, ecosystemPulseInterval, ecosystemPulses } =
    section.dataset;
  const interval = parseFloat(ecosystemPulseInterval);
  const pulse = {
    ...settings.map.pulse,
    ...(Number.isFinite(interval) && interval > 0 && { interval }),
    ...(ecosystemPulses === "off" && { enabled: false }),
  };
  if (!parseFloat(ecosystemDotSize)) return { pulse };
  const size = ecosystemDotSize.trim().endsWith("em")
    ? ecosystemDotSize.trim()
    : parseFloat(ecosystemDotSize);
  return { pulse, dot: { ...settings.map.dot, target: size, min: size } };
}

// The map fills its column; this only gives it a height where the layout
// has none. Below 992 px it runs from edge to edge of the screen.
function addLayoutStyles() {
  if (document.getElementById("ecosystem-map-layout")) return;
  const style = document.createElement("style");
  style.id = "ecosystem-map-layout";
  style.textContent = `[data-ecosystem-filter],[data-ecosystem-back]{z-index:6}[data-ecosystem-filter-toggle],[data-ecosystem-country],[data-ecosystem-back]{cursor:pointer;user-select:none}[data-ecosystem-map-host]{align-self:stretch;min-height:${settings.height}}@media (max-width:991px){[data-ecosystem-map-host]{align-self:center;flex:none;width:100vw;max-width:100vw;min-height:${settings.heightMobile}}}`;
  document.head.appendChild(style);
}
