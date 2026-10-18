// 快取版本號：以後更新網頁內容時，把這個數字改一下（例如 v9, v10...）
// 才能讓使用者的手機抓到新版本並清掉舊快取
const CACHE_NAME = 'study-countdown-v8';

// 開啟時要預先快取的本機檔案
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// 可以存進快取、讓 App 離線也能開的外部資源（Firebase 程式庫、字型）
const CACHEABLE_CDN_HOSTS = ['www.gstatic.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

// 安裝：把基本檔案存進快取
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

// 啟用：清掉舊版本的快取
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

// 攔截請求：網路優先（永遠拿最新版），斷網才退回快取
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // Firebase 寫入等請求不處理

  const url = new URL(req.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isCdn = CACHEABLE_CDN_HOSTS.includes(url.hostname);

  // 其他外部請求（Firestore 連線、Google 登入、YouTube）直接交給瀏覽器
  if (!isSameOrigin && !isCdn) return;

  event.respondWith(
    fetch(req)
      .then((response) => {
        if (response && (response.ok || response.type === 'opaque')) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        }
        return response;
      })
      .catch(() =>
        caches.match(req, { ignoreSearch: isSameOrigin }).then(
          (cached) => cached || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error())
        )
      )
  );
});
