/* =========================================================================
   Centre CFS — lanceur de l'assistant (seul script chargé d'emblée).

   - Apparaît une fois la page stable (load + inactivité), en fondu ; pastille « IA » si la couche IA est active.
   - Bulle d'invitation « Besoin d'aide ? » une seule fois par visite (sessionStorage), 3 s après l'apparition,
     visible 9 s ; jamais sur les pages compte ni sur les pages de formulaire ; fermable (×, Échap) ; le panneau ne
     s'ouvre JAMAIS tout seul.
   - Moteur, base de connaissances et panneau chargés À LA DEMANDE : préchargement à basse priorité (sauf économie de
     données), puis à l'intention (survol, focus, toucher), puis au clic (état « chargement », aucun clic perdu).
   - Événements d'usage anonymes (CustomEvent « cfs:analytics », aucun contenu de conversation) : rien n'est envoyé.
   ========================================================================= */
(function (root) {
  "use strict";
  var cfg = root.CFS_CONFIG || {}, a = cfg.assistant, I = root.CfsI18n;
  var btn = root.document && document.querySelector("[data-chat-open]");
  if (!btn || !a || !a.module) return;
  var t = function (k) { return I ? I.t(k) : k; };
  var INTRO_KEY = "cfs-assistant-intro";
  var reduce = root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function track(name, data) {
    try { document.dispatchEvent(new CustomEvent("cfs:analytics", { detail: Object.assign({ event: name }, data || {}) })); } catch (e) { /* sans importance */ }
  }

  var loading = null;
  function load() {
    if (!loading) {
      var link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = a.css;
      document.head.appendChild(link);
      loading = import(a.module);
    }
    return loading;
  }

  /* ---------- Apparition, une fois la page stable ---------- */
  function reveal() {
    btn.hidden = false;
    var badge = btn.querySelector("[data-chat-badge]");
    if (badge) badge.hidden = !a.ai;
    track("assistant_launcher_viewed");
    maybeIntro();
  }
  function whenIdle(fn, delay) {
    root.setTimeout(function () { (root.requestIdleCallback || root.setTimeout)(fn); }, delay);
  }
  if (document.readyState === "complete") whenIdle(reveal, 300);
  else root.addEventListener("load", function () { whenIdle(reveal, 300); }, { once: true });

  /* ---------- Bulle d'invitation (une fois par visite) ---------- */
  var bubble = null;
  function seen() { try { return root.sessionStorage.getItem(INTRO_KEY) === "1"; } catch (e) { return true; } }
  function markSeen() { try { root.sessionStorage.setItem(INTRO_KEY, "1"); } catch (e) { /* stockage indisponible */ } }
  function hideBubble() { if (bubble) { bubble.remove(); bubble = null; } }
  function maybeIntro() {
    var body = document.body;
    var onForm = document.querySelector("form[data-api-form], form[data-reg-form], form[data-auth]");
    if (seen() || body.classList.contains("is-account") || onForm) return;
    root.setTimeout(function () {
      if (btn.getAttribute("aria-expanded") === "true" || seen()) return;
      markSeen();
      bubble = document.createElement("div");
      bubble.className = "chat-bubble";
      bubble.setAttribute("role", "note");
      var strong = document.createElement("strong");
      strong.textContent = t("chat.bubble_title");
      var span = document.createElement("span");
      span.textContent = t("chat.bubble_text");
      bubble.append(strong, span);
      var close = document.createElement("button");
      close.type = "button";
      close.className = "chat-bubble-close";
      close.setAttribute("aria-label", t("chat.bubble_close"));
      close.textContent = "×";
      bubble.append(close);
      bubble.addEventListener("click", function (e) {
        if (e.target === close) { hideBubble(); return; }
        hideBubble();
        btn.click();
      });
      document.body.appendChild(bubble);
      track("assistant_intro_shown");
      root.setTimeout(hideBubble, reduce ? 12000 : 9000);
    }, 3000);
  }
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") hideBubble(); });

  /* ---------- Chargement à la demande ---------- */
  var saveData = root.navigator && root.navigator.connection && root.navigator.connection.saveData;
  if (!saveData) {
    root.addEventListener("load", function () { whenIdle(function () { load().catch(function () {}); }, 4000); });
  }
  ["pointerenter", "focus", "touchstart"].forEach(function (ev) { btn.addEventListener(ev, function () { load().catch(function () {}); }, { passive: true, once: true }); });
  btn.addEventListener("click", function () {
    hideBubble();
    markSeen();
    if (btn.getAttribute("aria-expanded") === "true") {      // deuxième clic : fermeture
      load().then(function (m) { if (m.close) m.close(); });
      return;
    }
    btn.setAttribute("aria-busy", "true");
    track("assistant_launcher_clicked");
    load().then(function (m) { btn.removeAttribute("aria-busy"); m.open(btn); }).catch(function () {
      btn.removeAttribute("aria-busy");
      root.location.href = (root.CFS_CATALOG && root.CFS_CATALOG.routes && root.CFS_CATALOG.routes.contact) || "/contact/";
    });
  });
})(typeof self !== "undefined" ? self : this);
