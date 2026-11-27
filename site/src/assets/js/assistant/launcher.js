/* =========================================================================
   Centre CFS — lanceur de l'assistant (seul script chargé d'emblée, quelques centaines d'octets utiles).
   Le moteur, la base de connaissances et le panneau sont chargés À LA DEMANDE : préchargement à basse priorité
   quelques secondes après le chargement (sauf économie de données), puis à l'intention (survol, focus, toucher),
   puis au clic (état « chargement » ; un clic n'est jamais perdu). Le panneau ne s'ouvre jamais tout seul.
   ========================================================================= */
(function (root) {
  "use strict";
  var cfg = root.CFS_CONFIG || {}, a = cfg.assistant;
  var btn = root.document && document.querySelector("[data-chat-open]");
  if (!btn || !a || !a.module) return;
  btn.hidden = false;
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
  var saveData = root.navigator && root.navigator.connection && root.navigator.connection.saveData;
  if (!saveData) {
    root.addEventListener("load", function () {
      root.setTimeout(function () { (root.requestIdleCallback || root.setTimeout)(function () { load().catch(function () {}); }); }, 4000);
    });
  }
  ["pointerenter", "focus", "touchstart"].forEach(function (ev) { btn.addEventListener(ev, function () { load().catch(function () {}); }, { passive: true, once: true }); });
  btn.addEventListener("click", function () {
    btn.setAttribute("aria-busy", "true");
    load().then(function (m) { btn.removeAttribute("aria-busy"); m.open(btn); }).catch(function () {
      btn.removeAttribute("aria-busy");
      root.location.href = (root.CFS_CATALOG && root.CFS_CATALOG.routes && root.CFS_CATALOG.routes.contact) || "/contact/";
    });
  });
})(typeof self !== "undefined" ? self : this);
