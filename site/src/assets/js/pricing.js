/* =========================================================================
   Centre CFS — calcul des montants (HTVA, TVA, TVAC), en CENTIMES entiers.
   Même règle que la feuille Google (apps-script/reservations.gs, amounts_) et que le Worker :
   chaque prix est converti en centimes, la TVA est arrondie au centime le plus proche.
   Dans le navigateur, le récapitulatif n'est qu'indicatif : le Worker recalcule toujours le montant.
   Module « dual-mode » : window.CfsPricing et require().
   ========================================================================= */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.CfsPricing = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function toCents(euros) { return Math.round(Number(euros) * 100); }

  /**
   * @param {{unitPrice: number|null, quantity: number}[]} lines  prix HTVA unitaire (euros) et nombre de places
   * @param {number} vatRate  par exemple 0.21
   * @returns {{exclCents: number, vatCents: number, inclCents: number, vatRate: number}|null}  null si un prix manque
   */
  function compute(lines, vatRate) {
    if (!Array.isArray(lines) || !lines.length) return null;
    if (!(vatRate >= 0 && vatRate <= 0.3)) throw new Error("taux de TVA invalide");
    var excl = 0;
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i];
      var q = Number(l.quantity);
      if (!(l.unitPrice > 0) || !(q >= 1) || Math.floor(q) !== q) return null;
      excl += toCents(l.unitPrice) * q;
    }
    var vat = Math.round(excl * vatRate);
    return { exclCents: excl, vatCents: vat, inclCents: excl + vat, vatRate: vatRate };
  }

  /** Montant au format attendu par Mollie : « 302.50 ». */
  function mollieValue(cents) {
    if (!(Number.isInteger(cents) && cents >= 0)) throw new Error("montant invalide");
    var c = cents % 100;
    return Math.floor(cents / 100) + "." + (c < 10 ? "0" : "") + c;
  }

  /** « 302.50 » (Mollie) → 30250. */
  function fromMollieValue(v) {
    var m = /^(\d+)\.(\d{2})$/.exec(String(v || ""));
    return m ? Number(m[1]) * 100 + Number(m[2]) : NaN;
  }

  function vatPercent(rate) { return Math.round(rate * 1000) / 10; }

  return { toCents: toCents, compute: compute, mollieValue: mollieValue, fromMollieValue: fromMollieValue, vatPercent: vatPercent };
});
