// 快取版本號：以後更新網頁內容時，把這個數字改一下（例如 v2, v3...）
// 才能讓使用者的手機抓到新版本，否則會一直讀到舊的快取
const CACHE_NAME = 'study-countdown-v1';

// 開啟時要預先快取的檔案（放最基本、不常變動的東西）
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './bg.jpg'
];

// 安裝階段：把基本檔案存進快取
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

// 啟用階段：清掉舊版本的快取
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names.map((name) => {
          if (name !== CACHE_NAME) return caches.delete(name);
        })
      )
    )
  );
  self.clients.claim();
});

// 攔截網路請求：
// 本機檔案（HTML/CSS/圖示）→ 網路優先，永遠拿最新版；斷網才退回快取
// 外部資源（Firebase、FullCalendar CDN）→ 直接連網，失敗才退回快取
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const isSameOrigin = url.origin === self.location.origin;

  if (isSameOrigin) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
  } else {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
  }
});
