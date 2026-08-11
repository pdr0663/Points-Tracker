import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

import { registerServiceWorker } from "../public/js/pwa.js";

const workerSource = await readFile(new URL("../public/service-worker.js", import.meta.url), "utf8");
const manifest = JSON.parse(await readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"));

function workerHarness(options = {}) {
  const listeners = {};
  const deleted = [];
  let added = [];
  let claimed = false;
  let skipped = false;
  let fetched = 0;
  const cachedResponses = options.cachedResponses ?? new Map();
  const cache = {
    async addAll(urls) { added = [...urls]; },
    async put(request, response) { cachedResponses.set(typeof request === "string" ? request : request.url, response); }
  };
  const context = {
    URL,
    Response,
    console,
    self: {
      location: { origin: "https://example.test" },
      addEventListener(type, listener) { listeners[type] = listener; },
      async skipWaiting() { skipped = true; },
      clients: { async claim() { claimed = true; } }
    },
    caches: {
      async open() { return cache; },
      async keys() { return options.cacheNames ?? []; },
      async delete(name) { deleted.push(name); return true; },
      async match(request) { return cachedResponses.get(typeof request === "string" ? request : request.url); }
    },
    async fetch(request) {
      fetched += 1;
      if (options.fetchImpl) return options.fetchImpl(request);
      throw new Error("offline");
    }
  };
  vm.runInNewContext(`${workerSource}\n;globalThis.__worker = { CACHE_NAME, PRECACHE_URLS };`, context);
  return {
    context,
    listeners,
    state: () => ({ added, claimed, deleted, fetched, skipped }),
    constants: context.__worker
  };
}

function lifetimeEvent(listener) {
  let completion;
  listener({ waitUntil(promise) { completion = promise; } });
  return completion;
}

test("manifest is subpath-safe and supplies installable maskable icons", async () => {
  assert.equal(manifest.start_url, "./");
  assert.equal(manifest.scope, "./");
  assert.equal(manifest.display, "standalone");
  assert.deepEqual(manifest.icons.map((icon) => icon.sizes), ["192x192", "512x512"]);
  assert.ok(manifest.icons.every((icon) => icon.purpose.includes("maskable")));

  for (const icon of manifest.icons) {
    const bytes = await readFile(new URL(`../public/${icon.src.slice(2)}`, import.meta.url));
    assert.equal(bytes.subarray(1, 4).toString("ascii"), "PNG");
    const expected = Number(icon.sizes.split("x")[0]);
    assert.equal(bytes.readUInt32BE(16), expected);
    assert.equal(bytes.readUInt32BE(20), expected);
  }
});

test("install precaches every application module and required offline asset", async () => {
  const harness = workerHarness();
  await lifetimeEvent(harness.listeners.install);
  const state = harness.state();
  assert.equal(state.skipped, true);

  const modules = (await readdir(new URL("../public/js/", import.meta.url)))
    .filter((name) => name.endsWith(".js"))
    .map((name) => `./js/${name}`);
  const required = [
    "./", "./index.html", "./manifest.webmanifest",
    "./css/app.css", "./css/app-muted.css",
    "./data/afcd-reference.json",
    "./schemas/food-import-v1.schema.json", "./schemas/recipe-import-v1.schema.json",
    "./icons/icon.svg", "./icons/icon-192.png", "./icons/icon-512.png",
    ...modules
  ];
  required.forEach((url) => assert.ok(state.added.includes(url), `Missing offline asset: ${url}`));
});

test("activation removes only stale Points Tracker caches and claims clients", async () => {
  const harness = workerHarness({ cacheNames: ["points-tracker-m18", "points-tracker-m19-v1", "unrelated-cache"] });
  await lifetimeEvent(harness.listeners.activate);
  assert.deepEqual(harness.state().deleted, ["points-tracker-m18"]);
  assert.equal(harness.state().claimed, true);
});

test("offline navigation and assets recover from the completed install cache", async () => {
  const shell = new Response("cached shell", { status: 200 });
  const asset = new Response("cached module", { status: 200 });
  const cachedResponses = new Map([
    ["./index.html", shell],
    ["https://example.test/js/app.js", asset]
  ]);
  const harness = workerHarness({ cachedResponses });

  let navigationResponse;
  harness.listeners.fetch({
    request: { method: "GET", mode: "navigate", url: "https://example.test/foods" },
    respondWith(promise) { navigationResponse = promise; }
  });
  assert.equal(await (await navigationResponse).text(), "cached shell");

  let assetResponse;
  harness.listeners.fetch({
    request: { method: "GET", mode: "same-origin", url: "https://example.test/js/app.js" },
    respondWith(promise) { assetResponse = promise; }
  });
  assert.equal(await (await assetResponse).text(), "cached module");
  assert.equal(harness.state().fetched, 1);
});

test("uncached offline requests fail explicitly without affecting cross-origin traffic", async () => {
  const harness = workerHarness();
  let responsePromise;
  harness.listeners.fetch({
    request: { method: "GET", mode: "same-origin", url: "https://example.test/missing.json" },
    respondWith(promise) { responsePromise = promise; }
  });
  assert.equal((await responsePromise).status, 503);

  let intercepted = false;
  harness.listeners.fetch({
    request: { method: "GET", mode: "same-origin", url: "https://other.test/private" },
    respondWith() { intercepted = true; }
  });
  assert.equal(intercepted, false);
});

test("service worker registration is optional and uses a relative GitHub Pages-safe URL", async () => {
  const calls = [];
  const registration = { scope: "https://example.test/Points-Tracker/" };
  const result = await registerServiceWorker({
    immediate: true,
    navigatorObject: { serviceWorker: { async register(url) { calls.push(url); return registration; } } },
    windowObject: { addEventListener() {} }
  });
  assert.equal(result, registration);
  assert.deepEqual(calls, ["./service-worker.js"]);
  assert.equal(await registerServiceWorker({ navigatorObject: {}, windowObject: {} }), undefined);
});
