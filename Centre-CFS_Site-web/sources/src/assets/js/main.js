/* Centre CFS — scripts du site (vanilla JS, aucun framework, aucune dépendance) */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* stockage indisponible */ } },
  };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const parseDate = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };

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
      burger.setAttribute("aria-label", open ? "Fermer le menu" : "Ouvrir le menu");
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

  /* ---------- Sessions : masquer les dates passées, signaler « aujourd'hui » ---------- */
  $$("[data-session-date]").forEach((el) => {
    const d = parseDate(el.dataset.sessionDate);
    if (d < today) { el.hidden = true; el.dataset.past = "1"; }
    else if (d.getTime() === today.getTime()) {
      const slot = $(".ticket-tags", el);
      if (slot) slot.insertAdjacentHTML("beforeend", '<span class="tag tag--jaune">Aujourd\'hui</span>');
    }
  });
  $$("[data-sessions]").forEach((box) => {
    const visible = $$("[data-session-date]", box).filter((t) => !t.hidden);
    const empty = $("[data-empty]", box);
    if (empty) empty.hidden = visible.length > 0;
    const limit = Number(box.dataset.limit || 0);
    if (limit) visible.forEach((t, i) => { if (i >= limit) t.hidden = true; });
  });
  // Prochaine date sur les cartes du catalogue
  $$("[data-next]").forEach((el) => {
    const dates = (el.dataset.next || "").split(",").filter(Boolean).map(parseDate).filter((d) => d >= today).sort((a, b) => a - b);
    if (dates.length) {
      el.textContent = dates[0].toLocaleDateString("fr-BE", { day: "numeric", month: "short" });
      el.classList.add("next");
    }
  });
  // Prochaine session du héros
  const heroNext = $("[data-hero-next]");
  if (heroNext) {
    const items = JSON.parse(heroNext.dataset.heroNext || "[]").filter((s) => parseDate(s.d) >= today);
    if (items.length) {
      const s = items[0];
      const d = parseDate(s.d).toLocaleDateString("fr-BE", { weekday: "long", day: "numeric", month: "long" });
      heroNext.innerHTML = `Prochaine session : <strong>${s.t}</strong>, ${d}, ${s.l}`;
    }
  }

  /* ---------- Filtres (catalogue et agenda) ---------- */
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
        const okS = !state.dates || $$("[data-next]", it).some((x) => x.classList.contains("next")) || (it.dataset.sessionDate && !it.dataset.past);
        const okQ = !state.q || norm(it.dataset.search || it.textContent).includes(state.q);
        const show = okD && okL && okQ && (!state.dates || okS) && !it.dataset.past;
        const li = it.closest("li") || it;
        li.hidden = !show;
        if (show) n++;
      });
      $$("[data-group]", filterRoot).forEach((g) => { g.hidden = !$$("[data-item]", g).some((it) => !(it.closest("li") || it).hidden); });
      if (info) info.textContent = n === 1 ? "1 résultat" : `${n} résultats`;
      if (none) none.classList.toggle("is-visible", n === 0);
    };
    const run = () => (document.startViewTransition && !matchMedia("(prefers-reduced-motion: reduce)").matches) ? document.startViewTransition(apply) : apply();
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
    // Pré-filtrage depuis l'URL (?domaine=incendie&lieu=engis)
    const params = new URLSearchParams(location.search);
    const pd = params.get("domaine"), pl = params.get("lieu");
    if (pd) { const b = $(`[data-filter="domain"][data-value="${CSS.escape(pd)}"]`, filterRoot); b && b.click(); }
    if (pl) { const b = $(`[data-filter="lieu"][data-value="${CSS.escape(pl)}"]`, filterRoot); b && b.click(); }
    apply();
  }

  /* ---------- Images manquantes : afficher un emplacement propre ---------- */
  $$(".photo img").forEach((img) => {
    const miss = () => img.classList.add("is-missing");
    if (img.complete && img.naturalWidth === 0) miss();
    img.addEventListener("error", miss);
  });

  /* ---------- Formulaires ---------- */
  const forms = $$("form[data-form]");
  const params = new URLSearchParams(location.search);
  forms.forEach((form) => {
    const pWrap = $("[data-participants]", form);
    const addBtn = $("[data-add-participant]", form);
    const tpl = $("#tpl-participant");
    // Pré-remplissage depuis l'URL
    ["type", "formation", "session"].forEach((k) => {
      const v = params.get(k); const f = form.elements[k];
      if (v && f) { f.value = v; f.dispatchEvent(new Event("change")); }
    });
    const startedAt = Date.now();

    // Inscription : sessions liées à la formation choisie
    const fSel = form.elements["formation"], sSel = form.elements["session"];
    if (fSel && sSel && sSel.tagName === "SELECT") {
      const allOpts = $$("option", sSel).filter((o) => o.value);
      const refresh = () => {
        const keep = sSel.value;
        allOpts.forEach((o) => {
          const past = parseDate(o.dataset.date) < today;
          const match = !fSel.value || o.dataset.formation === fSel.value;
          o.hidden = past || !match; o.disabled = past || !match;
        });
        if (keep && $(`option[value="${CSS.escape(keep)}"]`, sSel)?.disabled) sSel.value = "";
        const any = allOpts.some((o) => !o.disabled);
        const hint = $("[data-session-hint]", form);
        if (hint) hint.textContent = any ? "" : "Aucune date programmée pour cette formation : nous vous proposerons la prochaine session.";
        updateRecap();
      };
      fSel.addEventListener("change", refresh);
      sSel.addEventListener("change", () => {
        const o = sSel.selectedOptions[0];
        if (o && o.dataset.formation && fSel.value !== o.dataset.formation) { fSel.value = o.dataset.formation; }
        updateRecap();
      });
      refresh();
      if (params.get("session")) { sSel.value = params.get("session"); sSel.dispatchEvent(new Event("change")); }
    }

    // Participants dynamiques
    const renumber = () => {
      $$(".participant", pWrap).forEach((p, i) => {
        $("h4", p).textContent = `Participant ${i + 1}`;
        $$("input", p).forEach((inp) => { inp.name = inp.dataset.name + "[" + i + "]"; inp.id = inp.dataset.name + "-" + i; });
        $$("label", p).forEach((l) => { l.htmlFor = l.dataset.for + "-" + i; });
        const rm = $(".remove", p); if (rm) rm.hidden = i === 0;
      });
      updateRecap();
    };
    if (pWrap && addBtn && tpl) {
      const add = () => { pWrap.appendChild(tpl.content.cloneNode(true)); renumber(); };
      addBtn.addEventListener("click", () => { add(); const last = $$(".participant", pWrap).pop(); $("input", last)?.focus(); });
      pWrap.addEventListener("click", (e) => { const b = e.target.closest(".remove"); if (b) { b.closest(".participant").remove(); renumber(); } });
      add();
    }

    function updateRecap() {
      const box = $("[data-recap]");
      if (!box || !fSel) return;
      const fo = fSel.selectedOptions[0];
      const so = sSel && sSel.selectedOptions ? sSel.selectedOptions[0] : null;
      const n = pWrap ? $$(".participant", pWrap).length : 1;
      const price = fo && fo.dataset.prix ? Number(fo.dataset.prix) : 0;
      $("[data-r-formation]", box).textContent = fo && fo.value ? fo.textContent : "À choisir";
      $("[data-r-session]", box).textContent = so && so.value ? so.textContent : "Prochaine date disponible";
      $("[data-r-n]", box).textContent = String(n);
      $("[data-r-total]", box).textContent = price ? `${(price * n).toLocaleString("fr-BE")} € HTVA` : "Sur devis";
    }

    // Validation accessible
    const validate = () => {
      let first = null;
      $$("[required]", form).forEach((el) => {
        const field = el.closest(".field") || el.closest(".check");
        let ok = el.type === "checkbox" ? el.checked : el.value.trim() !== "";
        if (ok && el.type === "email") ok = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(el.value.trim());
        if (ok && el.type === "tel") ok = /^[+0-9 ()./-]{8,20}$/.test(el.value.trim());
        if (field) field.classList.toggle("has-error", !ok);
        el.setAttribute("aria-invalid", String(!ok));
        if (!ok && !first) first = el;
      });
      if (first) first.focus();
      return !first;
    };
    $$("input, select, textarea", form).forEach((el) => el.addEventListener("input", () => {
      const field = el.closest(".field"); if (field && field.classList.contains("has-error") && el.value.trim()) { field.classList.remove("has-error"); el.removeAttribute("aria-invalid"); }
    }));

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const status = $("[data-status]", form.parentElement) || $("[data-status]");
      if (!validate()) return;
      if (form.elements["_t"]) form.elements["_t"].value = String(Date.now() - startedAt);
      const btn = $("button[type=submit]", form);
      const label = btn.innerHTML;
      btn.disabled = true; btn.textContent = "Envoi en cours…";
      try {
        const res = await fetch(form.action, { method: "POST", body: new FormData(form), headers: { Accept: "application/json" } });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) throw new Error(data.message || "Erreur d'envoi");
        form.hidden = true;
        status.className = "form-status is-ok";
        status.innerHTML = `<h3>${form.dataset.okTitle}</h3><p>${form.dataset.okText}</p>`;
        status.focus();
      } catch (err) {
        status.className = "form-status is-err";
        status.innerHTML = `<h3>Le message n'est pas parti</h3><p>Vérifiez votre connexion et réessayez, ou contactez-nous directement : <a href="tel:+32475340289">0475 34 02 89</a> ou <a href="mailto:info@centrecfs.be">info@centrecfs.be</a>.</p>`;
        status.focus();
      } finally {
        btn.disabled = false; btn.innerHTML = label;
      }
    });
  });

  /* ---------- Année du pied de page ---------- */
  $$("[data-year]").forEach((el) => { el.textContent = String(new Date().getFullYear()); });
})();
