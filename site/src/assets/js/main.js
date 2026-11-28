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

  /* ---------- Thème clair / sombre (bouton de l'en-tête) ----------
     Sans choix du visiteur : préférence du système. Le choix est gardé dans ce navigateur (theme.js l'applique
     avant l'affichage des pages suivantes). Le libellé du bouton dit l'action : « Passer en mode clair / sombre ». */
  const themeBtn = $("[data-theme-toggle]");
  if (themeBtn) {
    const root = document.documentElement;
    const sys = window.matchMedia("(prefers-color-scheme: dark)");
    const isDark = () => { const v = root.getAttribute("data-theme"); return v ? v === "dark" : sys.matches; };
    const sync = () => {
      const dark = isDark();
      const label = t(dark ? "theme.light" : "theme.dark");
      themeBtn.setAttribute("aria-label", label);
      themeBtn.title = label;
    };
    sync();
    themeBtn.addEventListener("click", () => {
      const next = isDark() ? "light" : "dark";
      root.setAttribute("data-theme", next);
      store.set("cfs-theme", next);
      sync();
    });
    sys.addEventListener("change", sync);
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
    window.matchMedia("(min-width: 1061px)").addEventListener("change", (m) => { if (m.matches) setOpen(false); });
  }

  /* ---------- Méga-menu « Formations » et menu « Le centre » ----------
     Ordinateur : ouverture au clic, ou au survol de la souris (avec délai) ; domaines au survol, au focus ou au clic ;
     flèches haut/bas entre domaines, flèche droite vers les formations ; Échap ou clic à côté pour fermer.
     Mobile (tiroir) : « Formations » et « Le centre » s'ouvrent en accordéon. */
  const cfgAll = window.CFS_CONFIG || {};
  const cat = window.CFS_CATALOG || {};
  const desktop = window.matchMedia("(min-width: 1061px)");
  const hoverable = window.matchMedia("(hover: hover) and (pointer: fine)");
  const megaBtn = $(".nav-btn[aria-controls='mega']");
  const mega = $("#mega");
  const backdrop = $("[data-mega-backdrop]");
  const dropBtn = $(".nav-btn--drop");
  const drop = dropBtn ? document.getElementById(dropBtn.getAttribute("aria-controls")) : null;
  let hoverTimer = 0, leaveTimer = 0, nextDone = false;

  const loadScript = (src) => new Promise((resolve, reject) => {
    const el = document.createElement("script");
    el.src = src; el.onload = resolve; el.onerror = reject;
    document.head.appendChild(el);
  });
  /** Prochaines sessions (lues en direct par sessions.js, chargé à la demande) : 3 dates ouvertes, places restantes. */
  const fillNext = () => {
    const list = $("[data-mega-next]");
    if (!list || nextDone) return;
    nextDone = true;
    const scripts = cfgAll.sessionsScripts || [];
    const ready = window.CfsSessions ? Promise.resolve() : scripts.reduce((p, src) => p.then(() => loadScript(src)), Promise.resolve());
    ready.then(() => window.CfsSessions.load()).then((res) => {
      const S = window.CfsSessions;
      const next = res.sessions.filter((x) => S.level(x) !== "closed").slice(0, 3);
      list.textContent = "";
      if (!next.length) {
        const none = document.createElement("li");
        none.className = "mega-next-none";
        none.textContent = t("sess.none");
        list.append(none);
        return;
      }
      const loc = cat.locale || "fr-BE";
      next.forEach((x) => {
        const f = S.training(x.training) || { title: x.training, url: "#", bookable: false };
        const lv = S.level(x);
        const d = S.parse(x.date);
        const a = document.createElement("a");
        a.href = f.bookable && lv !== "full"
          ? cat.routes.inscription + "?formation=" + encodeURIComponent(x.training) + "&session=" + encodeURIComponent(x.id)
          : f.url;
        const day = document.createElement("span");
        day.className = "mega-day";
        day.setAttribute("aria-hidden", "true");
        const num = document.createElement("b");
        num.textContent = String(d.getDate());
        const mon = document.createElement("small");
        mon.textContent = new Intl.DateTimeFormat(loc, { month: "short" }).format(d).replace(".", "");
        day.append(num, mon);
        const txt = document.createElement("span");
        const title = document.createElement("span");
        title.className = "mega-next-t";
        title.textContent = f.title;
        const meta = document.createElement("span");
        meta.className = "mega-next-m is-" + lv;
        meta.textContent = S.place(x.location).name + " · " + S.seatsText(x);
        a.setAttribute("aria-label", f.title + ", " + S.dateText(x) + ", " + meta.textContent);
        txt.append(title, meta);
        a.append(day, txt);
        const item = document.createElement("li");
        item.append(a);
        list.append(item);
      });
    }).catch(() => { list.textContent = ""; nextDone = false; });
  };

  const showBackdrop = (on) => { if (backdrop) backdrop.hidden = !(on && desktop.matches); };
  const setDrop = (open) => {
    if (!dropBtn || !drop) return;
    dropBtn.setAttribute("aria-expanded", String(open));
    drop.classList.toggle("is-open", open);
  };
  const setMega = (open) => {
    if (!megaBtn || !mega) return;
    megaBtn.setAttribute("aria-expanded", String(open));
    mega.classList.toggle("is-open", open);
    showBackdrop(open);
    if (open) { setDrop(false); fillNext(); }
  };
  const activate = (slug) => {
    $$("[data-mega-dom]", mega).forEach((btn) => btn.setAttribute("aria-expanded", String(btn.dataset.megaDom === slug)));
    $$("[data-mega-panel]", mega).forEach((panel) => { panel.hidden = panel.dataset.megaPanel !== slug; });
  };

  if (megaBtn && mega) {
    megaBtn.addEventListener("click", () => setMega(megaBtn.getAttribute("aria-expanded") !== "true"));
    // Survol (souris, ordinateur) : ouverture après 120 ms, fermeture 250 ms après avoir quitté le menu
    const megaLi = megaBtn.closest("li");
    megaLi.addEventListener("pointerenter", (e) => {
      if (e.pointerType !== "mouse" || !desktop.matches || !hoverable.matches) return;
      clearTimeout(leaveTimer);
      hoverTimer = setTimeout(() => setMega(true), 120);
    });
    megaLi.addEventListener("pointerleave", (e) => {
      if (e.pointerType !== "mouse" || !desktop.matches) return;
      clearTimeout(hoverTimer);
      leaveTimer = setTimeout(() => setMega(false), 250);
    });
    let domTimer = 0;
    const doms = $$("[data-mega-dom]", mega);
    doms.forEach((btn, i) => {
      btn.addEventListener("click", () => activate(btn.dataset.megaDom));
      btn.addEventListener("focus", () => activate(btn.dataset.megaDom));
      btn.addEventListener("pointerenter", (e) => {
        if (e.pointerType !== "mouse") return;
        clearTimeout(domTimer);
        domTimer = setTimeout(() => activate(btn.dataset.megaDom), 70);
      });
      btn.addEventListener("keydown", (e) => {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          doms[(i + (e.key === "ArrowDown" ? 1 : doms.length - 1)) % doms.length].focus();
        } else if (e.key === "ArrowRight") {
          const first = $("#mega-p-" + btn.dataset.megaDom + " .mega-tr", mega);
          if (first) { e.preventDefault(); first.focus(); }
        }
      });
    });
    $$(".mega-tr", mega).forEach((link) => link.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowLeft") return;
      const panel = link.closest("[data-mega-panel]");
      const btn = panel ? doms.find((b) => b.dataset.megaDom === panel.dataset.megaPanel) : null;
      if (btn) { e.preventDefault(); btn.focus(); }
    }));
    if (backdrop) backdrop.addEventListener("click", () => setMega(false));
    desktop.addEventListener("change", () => showBackdrop(mega.classList.contains("is-open")));
  }
  if (dropBtn && drop) {
    dropBtn.addEventListener("click", () => setDrop(dropBtn.getAttribute("aria-expanded") !== "true"));
    const dropLi = dropBtn.closest("li");
    dropLi.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse" && desktop.matches && hoverable.matches) { setMega(false); setDrop(true); } });
    dropLi.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse" && desktop.matches) setDrop(false); });
  }
  document.addEventListener("click", (e) => {
    if (!desktop.matches) return;
    if (mega && megaBtn && mega.classList.contains("is-open") && !mega.contains(e.target) && !megaBtn.contains(e.target)) setMega(false);
    if (drop && dropBtn && drop.classList.contains("is-open") && !drop.contains(e.target) && !dropBtn.contains(e.target)) setDrop(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (mega && mega.classList.contains("is-open")) { setMega(false); megaBtn.focus(); }
    if (drop && drop.classList.contains("is-open")) { setDrop(false); dropBtn.focus(); }
  });
  // Focus sorti d'un menu au clavier (Tab) : il se referme
  [[megaBtn, setMega], [dropBtn, setDrop]].forEach(([btn, set]) => {
    const li = btn && btn.closest("li");
    if (!li) return;
    li.addEventListener("focusout", (e) => {
      if (desktop.matches && e.relatedTarget && !li.contains(e.relatedTarget)) set(false);
    });
  });

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

  /* ---------- Recherche : panneau (loupe de l'en-tête ou touche « / ») et page Résultats, chargés à la demande ---------- */
  const sc = cfg.search;
  if (sc && sc.module) {
    let mod = null;
    const load = () => (mod = mod || import(sc.module));
    $$("[data-search-open]").forEach((a) => {
      a.addEventListener("pointerenter", () => { load().catch(() => {}); }, { once: true });
      a.addEventListener("click", (e) => {
        if (e.ctrlKey || e.metaKey || e.shiftKey) return;          // nouvel onglet : page Résultats
        e.preventDefault();
        load().then((m) => m.open(a)).catch(() => { window.location.href = a.href; });
      });
    });
    document.addEventListener("keydown", (e) => {
      const tgt = e.target;
      const typing = tgt && (tgt.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(tgt.tagName));
      if (e.key === "/" && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        load().then((m) => m.open($("[data-search-open]"))).catch(() => {});
      }
    });
    const pageBox = $("[data-search-page]");
    if (pageBox) load().then((m) => m.initPage(pageBox)).catch(() => {});
  }

  /* ---------- Année du pied de page ---------- */
  $$("[data-year]").forEach((el) => { el.textContent = String(new Date().getFullYear()); });
})();
