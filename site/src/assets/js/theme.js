/* Centre CFS — thème clair / sombre, appliqué dans <head> AVANT l'affichage (aucun flash de la mauvaise couleur).
   Choix du visiteur (bouton de l'en-tête, gardé dans ce navigateur) ; sans choix, la préférence du système s'applique
   par la règle CSS « prefers-color-scheme ». Le bouton lui-même est géré par main.js. */
(function () {
  "use strict";
  try {
    var v = localStorage.getItem("cfs-theme");
    if (v === "dark" || v === "light") document.documentElement.setAttribute("data-theme", v);
  } catch (e) { /* stockage indisponible : préférence du système */ }
})();
