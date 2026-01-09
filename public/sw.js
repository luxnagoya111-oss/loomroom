// public/sw.js
const CACHE_NAME = "loomroom-pwa-v2";

// ※ OAuth系やログインはキャッシュしない（最重要）
function isAuthPath(pathname) {
  return (
    pathname.startsWith("/auth/") ||
    pathname === "/login" ||
    pathname.startsWith("/messages")
  );
}

// ★ API はキャッシュしない（POSTや認可絡みで事故りやすい）
function isApiPath(pathname) {
  return pathname.startsWith("/api/");
}

const APP_SHELL = [
  "/",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.map((k) =>
            k !== CACHE_NAME ? caches.delete(k) : Promise.resolve(true)
          )
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (url.origin !== self.location.origin) return;

  // ★ POST/PUT/DELETE 等は cache.put できないので必ず直通
  if (req.method !== "GET") {
    event.respondWith(fetch(req));
    return;
  }

  // OAuth/認証・ログイン関連は常にネットワーク直通
  if (isAuthPath(url.pathname) || isApiPath(url.pathname)) {
    event.respondWith(fetch(req));
    return;
  }

  // HTML
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() =>
          caches.match(req).then((cached) => cached || caches.match("/"))
        )
    );
    return;
  }

  // 静的
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => cached);

      return cached || fetchPromise;
    })
  );
});