/*! coi-service-worker v0.1.7 - Guido Zuidhof and contributors, licensed under MIT */
let coepCredentialless = false;
if (typeof window === 'undefined') {
  self.addEventListener("install", () => self.skipWaiting());
  self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
  self.addEventListener("message", (ev) => {
    if (ev.data && ev.data.type === "deregister") {
      self.registration
        .unregister()
        .then(() => self.clients.matchAll())
        .then((clients) => clients.forEach((client) => client.navigate(client.url)));
    }
  });
  self.addEventListener("fetch", function (e) {
    const r = e.request;
    if (r.cache === "only-if-cached" && r.mode !== "same-origin") return;
    e.respondWith(
      fetch(r).then((response) => {
        if (response.status === 0) return response;
        const newHeaders = new Headers(response.headers);
        newHeaders.set("Cross-Origin-Embedder-Policy",
          coepCredentialless ? "credentialless" : "require-corp"
        );
        newHeaders.set("Cross-Origin-Opener-Policy", "same-origin");
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: newHeaders,
        });
      }).catch((err) => console.error(err))
    );
  });
} else {
  (() => {
    const reloadedByCoi = window.sessionStorage.getItem("coiReloadedByCoi");
    window.sessionStorage.removeItem("coiReloadedByCoi");
    const coiError = () => {
      console.error(
        "COOP/COEP Service Worker: Unable to register. Is the Service Worker file accessible?"
      );
    };
    if (window.crossOriginIsolated !== false || reloadedByCoi === "true") return;
    if (!window.isSecureContext) {
      !window.crossOriginIsolated && coiError();
      return;
    }
    if (navigator.serviceWorker) {
      navigator.serviceWorker.register(window.document.currentScript.src).then(
        (registration) => {
          registration.addEventListener("updatefound", () => {
            const newWorker = registration.installing;
            newWorker.addEventListener("statechange", () => {
              if (newWorker.state === "activated") {
                window.sessionStorage.setItem("coiReloadedByCoi", "true");
                window.location.reload();
              }
            });
          });
          if (registration.active && !navigator.serviceWorker.controller) {
            window.sessionStorage.setItem("coiReloadedByCoi", "true");
            window.location.reload();
          }
        },
        coiError
      );
    }
  })();
}
