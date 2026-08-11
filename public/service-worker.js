const CACHE_PREFIX = "points-tracker-";
const CACHE_NAME = `${CACHE_PREFIX}m19-v1`;
const APP_SHELL = "./index.html";
const PRECACHE_URLS = [
  "./",
  APP_SHELL,
  "./manifest.webmanifest",
  "./css/app.css",
  "./css/app-muted.css",
  "./js/app.js",
  "./js/backup.js",
  "./js/db.js",
  "./js/diary.js",
  "./js/food-import.js",
  "./js/foods.js",
  "./js/form-values.js",
  "./js/json-import.js",
  "./js/points.js",
  "./js/progress.js",
  "./js/pwa.js",
  "./js/recipe-import.js",
  "./js/recipes.js",
  "./js/reference-foods.js",
  "./js/router.js",
  "./js/users.js",
  "./schemas/food-import-v1.schema.json",
  "./schemas/recipe-import-v1.schema.json",
  "./examples/food-import-v1.json",
  "./examples/recipe-import-v1.json",
  "./data/afcd-reference.json",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(PRECACHE_URLS);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

async function navigationResponse(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(APP_SHELL, response.clone());
    }
    return response;
  } catch {
    return (await caches.match(request)) ?? caches.match(APP_SHELL);
  }
}

async function assetResponse(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok && response.type !== "opaque") {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response("Offline", { status: 503, statusText: "Offline" });
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  event.respondWith(request.mode === "navigate" ? navigationResponse(request) : assetResponse(request));
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") void self.skipWaiting();
});
