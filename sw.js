/* Уулзварын зайн хэмжилт — Service Worker

   Зорилго:
     • Шинэчлэлт нэн даруй хүрэх — HTML-ийг СҮЛЖЭЭНЭЭС эхлэн авна.
       (Өмнө нь blob URL-аар бүртгэдэг байсан тул хөтөч зөвшөөрөхгүй,
        service worker огт ажилладаггүй байсан.)
     • Сүлжээгүй үед кэшнээсээ ажиллана.
     • Firebase-ийн өгөгдлийн хүсэлтэд ОГТ хүрэхгүй — тэдгээрийг
       Firestore өөрөө офлайнд зохицуулна.
*/
const CACHE = 'uulzvar-v26';
const CDN = ['cdn.jsdelivr.net', 'www.gstatic.com'];
/* Интро бичлэгийн сан. Хуудас өөрөө удирддаг тул service worker
   энэ санг УСТГАХГҮЙ — эс тэгвэл SW шинэчлэх бүрд 4МБ бичлэг дахин
   татагдана. Мөн бичлэгийн хүсэлтэд ОГТ хүрэхгүй: видеог хөтөч өөрөө
   хэсэгчлэн (Range) татдаг бөгөөд SW дундуур нь орвол тасалдана. */
const KEEP = /^intro-/;

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(['./', './index.html'])).catch(() => {}));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE && !KEEP.test(k)).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  /* Шинэчлэлт шалгах хүсэлт (cache: 'no-store') — кэшнээс хариулбал
     хуучин хувилбарыг буцаагаад шалгалт нь утгагүй болно. Шууд сүлжээнд.
     Хуудсын навигаци (refresh г.м) энд хамаарахгүй — тэр нь доор
     сүлжээ-эхэлж/кэш-нөөцлөх замаар явж, офлайнд ажиллах ёстой. */
  if (req.mode !== 'navigate' && (req.cache === 'no-store' || req.cache === 'reload')) return;

  let url;
  try { url = new URL(req.url); } catch { return; }
  // Видео — хөтөч өөрөө зохицуулна (Range хүсэлт)
  if (/\.(mp4|webm|mov|m4v)$/i.test(url.pathname)) return;
  // Зөвхөн өөрийн сайт ба хэрэглэдэг CDN — бусдыг нь хөндөхгүй
  if (url.origin !== self.location.origin && !CDN.includes(url.hostname)) return;

  // Хуудас өөрөө: сүлжээ эхэлж, чадахгүй бол кэшнээс
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const res = await fetch(req, { cache: 'no-store' });
        const c = await caches.open(CACHE);
        c.put('./index.html', res.clone());
        return res;
      } catch {
        const c = await caches.open(CACHE);
        return (await c.match('./index.html')) || (await c.match('./')) ||
               new Response('Офлайн байна', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      }
    })());
    return;
  }

  // Бусад файл (ExcelJS, Firebase SDK): кэшнээс шууд өгөөд ард нь шинэчилнэ
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    const hit = await c.match(req);
    const net = fetch(req).then(res => {
      if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone());
      return res;
    }).catch(() => null);
    return hit || (await net) || new Response('', { status: 504 });
  })());
});
