// Service worker du banc d'essai de bout en bout (tests/browser/e2e.html) : les appels /api/* (fetch ou formulaire)
// sont confiés à l'onglet du banc, qui les fait traiter par le vrai code du Worker et le vrai moteur Apps Script ;
// les appels …/gas/exec (accès direct, D-018) vont directement au vrai moteur Apps Script.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // /api/* : Worker ; …/gas/exec : application Web Google simulée (site construit avec GOOGLE_SCRIPT_URL=/gas/exec)
  if (url.origin !== self.location.origin || !(url.pathname.startsWith("/api/") || url.pathname.endsWith("/gas/exec"))) return;
  e.respondWith(forward(e.request));
});

async function forward(req) {
  const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const host = all.find((c) => new URL(c.url).pathname.endsWith("/tests/browser/e2e.html"));
  if (!host) {
    return new Response(JSON.stringify({ ok: false, code: "NO_BENCH", message: "Ouvrir d'abord tests/browser/e2e.html" }), {
      status: 503, headers: { "Content-Type": "application/json" },
    });
  }
  const body = req.method === "GET" || req.method === "HEAD" ? null : await req.text();
  const ch = new MessageChannel();
  const reply = new Promise((resolve) => { ch.port1.onmessage = (m) => resolve(m.data); });
  host.postMessage({ url: req.url, method: req.method, headers: [...req.headers], body }, [ch.port2]);
  const r = await reply;
  const empty = r.status === 204 || r.status === 304;
  return new Response(empty ? null : r.body, { status: r.status, headers: r.headers });
}
