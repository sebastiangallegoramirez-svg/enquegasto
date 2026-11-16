// ¿En qué gasto? · guarda la pantalla para que abra rápido y muestra tus notificaciones.
// Tus datos NO se guardan aquí: siempre se piden a tu Apps Script.
const CACHE = 'enquegasto-v2';
const ARCHIVOS = ['./', './index.html', './manifest.json', './icono-192.png', './icono-512.png', './icono-maskable-512.png', './insignia-96.png'];

self.addEventListener('install', e => {
  // Si falta algún archivo (por ejemplo la insignia), igual se instala
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(ARCHIVOS.map(f => c.add(f).catch(() => null)))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== 'eqg-conf').map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Primero internet (para recibir siempre la versión nueva); si no hay, lo guardado
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then(r => { const copia = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copia)); return r; })
      .catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
  );
});

// ---------- Notificaciones ----------
// Tu Apps Script solo "toca la puerta" (sin contenido). Aquí se pide el texto con la llave de este celular.
async function avisosNuevos() {
  const c = await caches.open('eqg-conf');
  const rc = await c.match('conf');
  if (!rc) return null;
  const conf = await rc.json();
  const rd = await c.match('desde');
  const desde = rd ? Number(await rd.text()) || 0 : 0;
  const resp = await fetch(conf.a, {
    method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ fn: 'avisosNuevos', args: [desde], llave: conf.k })
  });
  const j = await resp.json();
  if (!j.ok) return null;
  await c.put('desde', new Response(String(j.r.hasta || desde)));
  return j.r.avisos || [];
}

async function mostrarAvisos() {
  let avisos = null;
  try { avisos = await avisosNuevos(); } catch (err) { avisos = null; }
  const base = { icon: 'icono-192.png', badge: 'insignia-96.png', lang: 'es-CO' };
  if (!avisos || !avisos.length) {
    return self.registration.showNotification('¿En qué gasto?',
      Object.assign({ body: 'Tienes algo nuevo. Toca para verlo.', tag: 'eqg-general', data: { ir: 'inicio' } }, base));
  }
  for (const a of avisos) {
    await self.registration.showNotification(a.titulo, Object.assign({ body: a.texto, tag: a.id, data: { ir: a.vista || 'inicio' } }, base));
  }
}

self.addEventListener('push', e => { e.waitUntil(mostrarAvisos()); });

// Al tocar la notificación: abre la app (o la trae al frente) en la pantalla del aviso
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const ir = (e.notification.data && e.notification.data.ir) || 'inicio';
  e.waitUntil((async () => {
    const ventanas = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const v of ventanas) {
      if (new URL(v.url).origin === self.location.origin) {
        await v.focus();
        v.postMessage({ ir });
        return;
      }
    }
    await clients.openWindow(new URL('./#ir=' + ir, self.registration.scope).href);
  })());
});
