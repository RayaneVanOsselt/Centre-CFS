/* =========================================================================
   Centre CFS — numéro de TVA belge : BE + 10 chiffres commençant par 0 ou 1, contrôle modulo 97.
   (97 − (8 premiers chiffres mod 97)) doit être égal aux 2 derniers chiffres.
   Même règle dans le Worker (worker/src/lib/validation.js) et la feuille (belgianVat_).
   Module « dual-mode » : window.CfsVat et require().
   ========================================================================= */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.CfsVat = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  /** Numéro normalisé « BE0123456749 », ou null s'il est invalide. Accepte espaces, points et tirets. */
  function normalize(v) {
    var s = String(v == null ? "" : v).toUpperCase().replace(/[\s.\-]/g, "");
    if (s.indexOf("BE") === 0) s = s.slice(2);
    if (/^\d{9}$/.test(s)) s = "0" + s;
    if (!/^[01]\d{9}$/.test(s)) return null;
    var base = Number(s.slice(0, 8));
    var check = Number(s.slice(8));
    return 97 - (base % 97) === check ? "BE" + s : null;
  }
  /** Affichage lisible : « BE 0123.456.749 ». */
  function format(v) {
    var n = normalize(v);
    return n ? "BE " + n.slice(2, 6) + "." + n.slice(6, 9) + "." + n.slice(9) : String(v || "");
  }
  return { normalize: normalize, isValid: function (v) { return normalize(v) !== null; }, format: format };
});
