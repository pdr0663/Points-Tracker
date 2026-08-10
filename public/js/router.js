const routes = new Map([
  ["today", { title: "Today", description: "Your daily ProPoints summary will live here." }],
  ["diary", { title: "Diary", description: "Review and edit food entries by local calendar date." }],
  ["foods", { title: "Foods", description: "Shared household foods and serving sizes." }],
  ["recipes", { title: "Recipes", description: "Build recipes from saved foods and calculate raw points per serving." }],
  ["progress", { title: "Progress", description: "Weigh-ins, tracking periods and goal progress." }],
  ["settings", { title: "Settings", description: "Profiles, display preferences, backup and application status." }]
]);

function routeFromHash() {
  const requestedRoute = window.location.hash.slice(1).toLowerCase();
  return routes.has(requestedRoute) ? requestedRoute : "today";
}

export function createRouter({ onRouteChange }) {
  function navigate() {
    const routeName = routeFromHash();
    const route = routes.get(routeName);

    document.querySelectorAll("[data-route]").forEach((link) => {
      if (link.dataset.route === routeName) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    });

    document.title = `${route.title} · ProPoints Tracker`;
    onRouteChange({ name: routeName, ...route });
  }

  return {
    start() {
      window.addEventListener("hashchange", navigate);
      navigate();
    },
    stop() {
      window.removeEventListener("hashchange", navigate);
    }
  };
}

