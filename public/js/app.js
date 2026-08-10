import { openDatabase } from "./db.js";
import { createRouter } from "./router.js";

const main = document.querySelector("#main-content");

function createElement(tagName, options = {}) {
  const element = document.createElement(tagName);
  if (options.className) element.className = options.className;
  if (options.text) element.textContent = options.text;
  return element;
}

function renderScreen(route) {
  const screen = createElement("section", { className: "screen" });
  const header = createElement("header", { className: "screen-header" });
  header.append(
    createElement("h2", { text: route.title }),
    createElement("p", { text: route.description })
  );
  screen.append(header);

  const cards = createElement("div", { className: "card-grid card-grid--two" });

  if (route.name === "today") {
    const welcome = createElement("article", { className: "card card--accent" });
    welcome.append(
      createElement("h3", { text: "Foundation ready" }),
      createElement("p", { text: "The tracking screens will be connected milestone by milestone. Core calculations and local storage are available without AI." })
    );

    const status = createElement("article", { className: "card" });
    status.append(createElement("h3", { text: "Local-first core" }));
    const list = createElement("ul", { className: "status-list" });
    ["Responsive application shell", "Versioned IndexedDB storage", "Deterministic raw-point calculations"].forEach((item) => {
      list.append(createElement("li", { text: item }));
    });
    status.append(list);
    cards.append(welcome, status);
  } else {
    const placeholder = createElement("article", { className: "card" });
    placeholder.append(
      createElement("h3", { text: `${route.title} is next` }),
      createElement("p", { text: "This navigation destination is in place. Its substantive workflow will arrive in the milestone assigned to it." })
    );
    cards.append(placeholder);
  }

  screen.append(cards);
  main.replaceChildren(screen);
  main.focus({ preventScroll: true });
}

async function startApplication() {
  await openDatabase();
  const router = createRouter({ onRouteChange: renderScreen });
  router.start();
}

startApplication().catch((error) => {
  console.error("Application startup failed", error);
  const message = createElement("p", {
    text: "Local storage could not be opened. Check this browser's storage permissions and reload."
  });
  main.replaceChildren(message);
});

