/* =========================================================================
   Centre CFS — page de retour du paiement (/paiement/?ref=CFS-…).

   L'état affiché est l'état RÉEL lu dans la feuille par le Worker (GET /api/payments/status), jamais un paramètre
   de l'adresse. Tant que la banque n'a pas confirmé, la page se relit toute seule (toutes les 3 s pendant 1 minute,
   puis toutes les 15 s). Aucune donnée personnelle n'est affichée.
   ========================================================================= */
(function (root) {
  "use strict";
  var I = root.CfsI18n;
  var card = root.document && document.querySelector("[data-payment]");
  if (!I || !card) return;
  var t = I.t;
  var text = card.querySelector("[data-pay-text]"), title = card.querySelector("h1"), actions = card.querySelector("[data-pay-actions]");
  var spinner = card.querySelector(".pay-spinner");
  var ref = new URLSearchParams(root.location.search).get("ref") || "";
  var STATES = { paid: "paid", confirmed: "paid", pending: "pending", invoice: "invoice", failed: "failed", canceled: "failed", expired: "expired", refund: "refund" };
  var started = Date.now(), timer = null;

  function show(state) {
    var k = STATES[state] || "unknown";
    title.textContent = t("pay." + k + "_title");
    text.textContent = t("pay." + k + "_text", { ref: ref });
    var final = k !== "pending";
    if (spinner) spinner.setAttribute("aria-hidden", "true");  // pastille d'état (couleur selon data-state, account.css)
    card.setAttribute("data-state", k);
    actions.hidden = !final;
    return final;
  }

  function poll() {
    root.fetch("/api/payments/status?ref=" + encodeURIComponent(ref), { headers: { Accept: "application/json" }, credentials: "same-origin" })
      .then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (d) {
        var final = show(d.ok ? d.state : d.state === "unknown" ? "unknown" : "pending");
        if (!final) timer = root.setTimeout(poll, Date.now() - started < 60000 ? 3000 : 15000);
      })
      .catch(function () { timer = root.setTimeout(poll, 15000); });
  }

  if (!/^CF[SD]-\d{4}-[A-Z2-9]{5,6}$/.test(ref)) { show("unknown"); return; }
  poll();
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && card.getAttribute("data-state") === "pending") { root.clearTimeout(timer); poll(); }
  });
})(typeof self !== "undefined" ? self : this);
