// ==========================================
// 📦 おとや Service Worker
// 殻（HTML・CSS・JS・アイコン）をキャッシュし、オフラインでも動くようにする。
// ==========================================

const CACHE_NAME = "otoya-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./js/mixer-core.js",
  "./app.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

// 📥 インストール時に殻をキャッシュする
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// 🧹 古いキャッシュを削除する
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
  );
  self.clients.claim();
});

// 🌐 同一オリジンの GET はキャッシュ優先で応答し、取得した分は保存する
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      });
    })
  );
});
