/* Centre CFS — scripts communs à toutes les pages (vanilla JS, aucun framework, aucune dépendance).
   Textes d'interface : window.CfsI18n (langue de la page). Sessions, agenda et formulaires : fichiers dédiés. */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const t = (k, v) => (window.CfsI18n ? window.CfsI18n.t(k, v) : k);
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* stockage indisponible */ } },
  };
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const parseDate = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };

  /* ---------- Animation d'accueil : bouton « Passer » ---------- */
  const skip = $("[data-intro-skip]");
  if (skip) {
    const html = document.documentElement;
    const stop = () => html.classList.add("intro-skip");
    skip.addEventListener("click", stop);
    $("[data-intro]")?.addEventListener("click", stop);
    document.addEventListener("keydown", (e) => { if (html.classList.contains("intro-on")) stop(); }, { once: true });
  }

  /* ---------- Bandeau d'annonce ---------- */
  const annonce = $(".annonce");
  if (annonce) {
    const until = annonce.dataset.until;
    const key = "cfs-annonce-" + (until || "");
    if ((until && parseDate(until) <= today) || store.get(key)) annonce.hidden = true;
    const close = $("button", annonce);
    close && close.addEventListener("click", () => { annonce.hidden = true; store.set(key, "1"); });
  }

  /* ---------- En-tête : ombre au défilement ---------- */
  const header = $(".header");
  if (header) {
    const onScroll = () => header.classList.toggle("is-scrolled", window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  /* ---------- Menu mobile ---------- */
  const burger = $(".burger");
  const nav = $("#nav");
  if (burger && nav) {
    const setOpen = (open) => {
      burger.setAttribute("aria-expanded", String(open));
      burger.setAttribute("aria-label", open ? burger.dataset.labelClose : burger.dataset.labelOpen);
      if (open && header) document.documentElement.style.setProperty("--nav-top", Math.max(0, header.getBoundingClientRect().bottom) + "px");
      nav.classList.toggle("is-open", open);
      document.body.classList.toggle("nav-open", open);
      $(".i-open", burger).hidden = open;
      $(".i-close", burger).hidden = !open;
    };
    burger.addEventListener("click", () => setOpen(burger.getAttribute("aria-expanded") !== "true"));
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && nav.classList.contains("is-open")) { setOpen(false); burger.focus(); } });
    window.matchMedia("(min-width: 981px)").addEventListener("change", (m) => { if (m.matches) setOpen(false); });
  }

  /* ---------- Méga-menu Formations ---------- */
  const megaBtn = $(".nav-btn");
  const mega = $("#mega");
  if (megaBtn && mega) {
    const setMega = (open) => { megaBtn.setAttribute("aria-expanded", String(open)); mega.classList.toggle("is-open", open); };
    megaBtn.addEventListener("click", () => setMega(megaBtn.getAttribute("aria-expanded") !== "true"));
    document.addEventListener("click", (e) => {
      if (window.innerWidth > 980 && !mega.contains(e.target) && !megaBtn.contains(e.target)) setMega(false);
    });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && mega.classList.contains("is-open")) { setMega(false); megaBtn.focus(); } });
  }

  /* ---------- Sélecteur de langue ---------- */
  const langSwitch = $(".lang-switch");
  if (langSwitch) {
    document.addEventListener("click", (e) => { if (langSwitch.open && !langSwitch.contains(e.target)) langSwitch.open = false; });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && langSwitch.open) { langSwitch.open = false; $("summary", langSwitch).focus(); } });
    $$("[data-lang-link]", langSwitch).forEach((a) => a.addEventListener("click", () => store.set("cfs-lang", a.dataset.langLink)));
  }

  /* ---------- Bandeau « cette page existe dans votre langue » ---------- */
  const banner = $("[data-lang-banner]");
  const catalog = window.CFS_CATALOG;
  if (banner && catalog && catalog.bannerText && !store.get("cfs-lang")) {
    const page = document.documentElement.dataset.lang;
    const wanted = (navigator.languages || [navigator.language || ""]).map((l) => String(l).slice(0, 2).toLowerCase())
      .find((l) => catalog.bannerText[l]);
    const link = wanted && wanted !== page ? $(`[data-lang-link="${wanted}"]`) : null;
    if (link) {
      const tx = catalog.bannerText[wanted];
      const close = (catalog.icons && catalog.icons.close) || "×";
      const wrap = document.createElement("div");
      wrap.className = "wrap";
      wrap.lang = link.getAttribute("lang") || wanted;
      wrap.innerHTML = `<p></p><a class="btn btn--bleu btn--petit" data-lang-go></a><button class="close" type="button">${close}</button>`;
      $("p", wrap).textContent = tx.text;
      const go = $("[data-lang-go]", wrap);
      go.textContent = tx.go;
      go.href = link.getAttribute("href");
      go.hreflang = link.getAttribute("hreflang") || wanted;
      go.addEventListener("click", () => store.set("cfs-lang", wanted));
      const btn = $("button", wrap);
      btn.setAttribute("aria-label", tx.close);
      btn.addEventListener("click", () => { banner.hidden = true; store.set("cfs-lang", page); });
      banner.appendChild(wrap);
      banner.hidden = false;
    }
  }

  /* ---------- Filtres du catalogue ---------- */
  const filterRoot = $("[data-filter-root]");
  if (filterRoot) {
    const items = $$("[data-item]", filterRoot);
    const q = $("[data-filter-q]", filterRoot);
    const info = $("[data-results]", filterRoot);
    const none = $(".no-results", filterRoot);
    const state = { domain: "", lieu: "", dates: false, q: "" };
    const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const apply = () => {
      let n = 0;
      items.forEach((it) => {
        const okD = !state.domain || it.dataset.domain === state.domain;
        const okL = !state.lieu || (it.dataset.lieux || "").split(" ").includes(state.lieu);
        const okS = !state.dates || it.dataset.hasDate === "1";
        const okQ = !state.q || norm(it.dataset.search || it.textContent).includes(state.q);
        const show = okD && okL && okS && okQ;
        const li = it.closest("li") || it;
        li.hidden = !show;
        if (show) n++;
      });
      $$("[data-group]", filterRoot).forEach((g) => { g.hidden = !$$("[data-item]", g).some((it) => !(it.closest("li") || it).hidden); });
      if (info) info.textContent = n === 1 ? t("common.results_one") : t("common.results", { n });
      if (none) none.classList.toggle("is-visible", n === 0);
    };
    const run = () => (document.startViewTransition && !reduceMotion) ? document.startViewTransition(apply) : apply();
    $$("[data-filter]", filterRoot).forEach((btn) => {
      btn.addEventListener("click", () => {
        const k = btn.dataset.filter, v = btn.dataset.value || "";
        if (k === "dates") { state.dates = btn.getAttribute("aria-pressed") !== "true"; btn.setAttribute("aria-pressed", String(state.dates)); }
        else {
          state[k] = state[k] === v ? "" : v;
          $$(`[data-filter="${k}"]`, filterRoot).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.value === state[k] && !!state[k])));
          const all = $(`[data-filter="${k}"][data-value=""]`, filterRoot);
          if (all) all.setAttribute("aria-pressed", String(!state[k]));
        }
        run();
      });
    });
    if (q) q.addEventListener("input", () => { state.q = norm(q.value.trim()); apply(); });
    // Pré-filtrage depuis l'adresse (?domaine=incendie&lieu=engis&q=extincteur)
    const params = new URLSearchParams(location.search);
    const pd = params.get("domaine"), pl = params.get("lieu"), pq = params.get("q");
    if (pd) { const b = $(`[data-filter="domain"][data-value="${CSS.escape(pd)}"]`, filterRoot); b && b.click(); }
    if (pl) { const b = $(`[data-filter="lieu"][data-value="${CSS.escape(pl)}"]`, filterRoot); b && b.click(); }
    if (pq && q) { q.value = pq.slice(0, 80); state.q = norm(q.value.trim()); }
    apply();
  }

  /* ---------- Images manquantes : afficher un emplacement propre ---------- */
  $$(".photo img").forEach((img) => {
    const miss = () => img.classList.add("is-missing");
    if (img.complete && img.naturalWidth === 0) miss();
    img.addEventListener("error", miss);
  });

  /* ---------- Fiche formation : impression ---------- */
  $$("[data-print]").forEach((b) => { b.hidden = false; b.addEventListener("click", () => window.print()); });

  /* ---------- Halo qui suit le pointeur sur les cartes (.spot) ---------- */
  if (!reduceMotion && window.matchMedia("(hover: hover)").matches) {
    document.addEventListener("pointermove", (e) => {
      const card = e.target.closest && e.target.closest(".spot");
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty("--mx", (e.clientX - r.left) + "px");
      card.style.setProperty("--my", (e.clientY - r.top) + "px");
    }, { passive: true });
  }

  /* ---------- Héros 3D de l'accueil : chargé après la page, seulement si l'appareil s'y prête ---------- */
  const board3d = $("[data-board]");
  const cfg = window.CFS_CONFIG || {};
  const can3D = () => {
    if (reduceMotion || !window.WebGL2RenderingContext) return false;
    const c = navigator.connection;
    if (c && (c.saveData || /2g/.test(c.effectiveType || ""))) return false;
    if (navigator.deviceMemory && navigator.deviceMemory < 4) return false;
    return !(navigator.hardwareConcurrency && navigator.hardwareConcurrency < 4);
  };
  if (board3d && cfg.hero3d && can3D()) {
    const go = () => import(cfg.hero3d).then((m) => m.default(board3d)).catch(() => { /* le panneau HTML reste affiché */ });
    const idle = (fn) => (window.requestIdleCallback ? window.requestIdleCallback(fn, { timeout: 2500 }) : setTimeout(fn, 1200));
    if (document.readyState === "complete") idle(go); else window.addEventListener("load", () => idle(go), { once: true });
  }

  /* ---------- Année du pied de page ---------- */
  $$("[data-year]").forEach((el) => { el.textContent = String(new Date().getFullYear()); });
})();
