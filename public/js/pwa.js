export async function registerServiceWorker(options = {}) {
  const navigatorObject = options.navigatorObject ?? globalThis.navigator;
  const windowObject = options.windowObject ?? globalThis.window;
  if (!navigatorObject?.serviceWorker || !windowObject?.addEventListener) return undefined;

  const register = async () => {
    try {
      return await navigatorObject.serviceWorker.register("./service-worker.js");
    } catch (error) {
      console.warn("Offline support could not be enabled.", error);
      return undefined;
    }
  };

  if (options.immediate || globalThis.document?.readyState === "complete") return register();
  windowObject.addEventListener("load", register, { once: true });
  return undefined;
}
