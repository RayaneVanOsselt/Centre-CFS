/* Centre CFS — décide AVANT l'affichage si l'animation d'accueil est jouée (une fois par session, jamais si
   l'utilisateur a demandé de réduire les animations). Sans JavaScript, il n'y a pas d'animation. */
(function () {
  "use strict";
  try {
    var html = document.documentElement;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (sessionStorage.getItem("cfs-intro")) return;
    sessionStorage.setItem("cfs-intro", "1");
    html.classList.add("intro-on");
    setTimeout(function () { html.classList.remove("intro-on", "intro-skip"); }, 2600);
  } catch (e) { /* stockage indisponible : pas d'animation */ }
})();
