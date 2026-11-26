/* =========================================================================
   Centre CFS — textes d'interface et formats (Intl) dans la langue de la page.
   Les chaînes viennent de window.CFS_I18N (généré par site/build.py depuis site/content/ui.{fr,nl,en}.json).
   Module « dual-mode » : navigateur (window.CfsI18n) et Node (require) pour les tests.
   ========================================================================= */
(function (root, factory) {
  "use strict";
  var api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.CfsI18n = api;
})(typeof self !== "undefined" ? self : this, function (root) {
  "use strict";
  var LOCALES = { fr: "fr-BE", nl: "nl-BE", en: "en-BE" };

  /** Langue de la page : fr, nl ou en. */
  function lang() {
    var d = root.document;
    var l = d && d.documentElement ? d.documentElement.getAttribute("data-lang") : null;
    return LOCALES[l] ? l : "fr";
  }
  function locale(l) { return LOCALES[l || lang()] || "fr-BE"; }
  /** Remplace {clé} par la valeur correspondante. */
  function fill(s, vars) {
    return String(s).replace(/\{(\w+)\}/g, function (m, k) { return vars && vars[k] != null ? String(vars[k]) : m; });
  }
  /** Texte d'interface (clé absente : texte de secours, sinon la clé elle-même). */
  function t(key, vars, fallback) {
    var dict = root.CFS_I18N || {};
    var s = dict[key];
    if (s == null) s = fallback != null ? fallback : key;
    return fill(s, vars);
  }
  /** Montant en euros (nombre) → « 250 € », « € 250 », « €250 » selon la langue. */
  function money(euros, l, forceDecimals) {
    if (euros == null || !isFinite(euros)) return "";
    var dec = forceDecimals || Math.round(euros * 100) % 100 !== 0 ? 2 : 0;
    return new Intl.NumberFormat(locale(l), { style: "currency", currency: "EUR", minimumFractionDigits: dec, maximumFractionDigits: 2 }).format(euros);
  }
  /** Montant en centimes → texte (toujours 2 décimales s'il y a des centimes). */
  function cents(c, l) { return c == null ? "" : money(c / 100, l); }
  /** Échappe un texte pour l'insérer dans du HTML. */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  }
  return { LOCALES: LOCALES, lang: lang, locale: locale, fill: fill, t: t, money: money, cents: cents, esc: esc };
});
