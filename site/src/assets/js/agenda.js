/* =========================================================================
   Centre CFS — agenda : calendrier mensuel des sessions et liste filtrable (formation, domaine, lieu).
   Les filtres s'appliquent au calendrier ET à la liste. Pré-filtrage par l'adresse :
   ?formation=vca-base, ?domaine=incendie, ?lieu=engis (liens partagés, réseaux sociaux).
   ========================================================================= */
(function (root) {
  "use strict";
  var S = root.CfsSessions, UI = root.CfsSessionsUI, I = root.CfsI18n;
  if (!S || !UI || !I || !root.document) return;
  var cal = document.querySelector("[data-sessions-calendar]");
  var listRoot = document.querySelector("[data-session-root]");
  if (!cal && !listRoot) return;

  var t = I.t, esc = I.esc;
  var $ = function (sel, r) { return (r || document).querySelector(sel); };
  var $$ = function (sel, r) { return Array.prototype.slice.call((r || document).querySelectorAll(sel)); };
  var state = { training: "", domain: "", location: "" };
  var all = [], selected = null;
  var month = null; // premier jour du mois affiché (Date)

  function matches(s) {
    return (!state.training || s.training === state.training) && (!state.domain || s.domain === state.domain) &&
      (!state.location || s.location === state.location);
  }
  function filtered() { return all.filter(matches); }

  /* ---------- Liste ---------- */
  function renderList() {
    if (!listRoot) return;
    var list = $("[data-session-list]", listRoot);
    var shown = filtered();
    if (list) UI.renderList(list, shown);
    var info = $("[data-session-results]", listRoot);
    if (info) {
      var n = shown.length;
      info.textContent = n === 0 ? (all.length ? t("sess.no_results") : "") : n === 1 ? t("sess.results_one") : t("sess.results", { n: n });
    }
  }

  /* ---------- Calendrier ---------- */
  function monthStart(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
  function sameMonth(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth(); }

  /** Sessions d'un jour donné (une session de plusieurs jours apparaît chaque jour). */
  function sessionsOn(iso, list) {
    return list.filter(function (s) { return s.date <= iso && (s.endDate || s.date) >= iso; });
  }

  function chip(s) {
    var lv = S.level(s), f = S.training(s.training), d = S.domain(s.domain);
    var n = s.live && s.seatsLeft != null && lv !== "closed" ? String(s.seatsLeft) : "";
    var label = (f ? f.title : s.training) + " – " + S.dateText(s) + " – " + S.place(s.location).name + " – " + S.seatsText(s);
    return '<button class="wsc-chip wsc-chip--' + lv + '" type="button" data-id="' + esc(s.id) + '" aria-pressed="' + (selected === s.id) +
      '" aria-label="' + esc(label) + '">' + (d ? d.sign : "") + '<span class="wsc-chip__t">' + esc(f ? f.title : s.training) + "</span>" +
      (n ? '<span class="wsc-chip__n">' + n + "</span>" : "") + "</button>";
  }

  function renderCalendar() {
    if (!cal) return;
    var grid = $("[data-wsc-grid]", cal), label = $("[data-wsc-month]", cal), status = $("[data-wsc-status]", cal);
    var prev = $("[data-wsc-prev]", cal), next = $("[data-wsc-next]", cal);
    var list = filtered(), today = S.todayIso(), now = monthStart(new Date());
    var name = month.toLocaleDateString(I.locale(), { month: "long", year: "numeric" });
    label.textContent = name.charAt(0).toUpperCase() + name.slice(1);

    // En-tête : lundi → dimanche, dans la langue de la page
    var head = '<div class="wsc-head" aria-hidden="true">';
    var monday = new Date(2024, 0, 1); // un lundi
    for (var i = 0; i < 7; i++) {
      var wd = new Date(monday.getFullYear(), 0, 1 + i).toLocaleDateString(I.locale(), { weekday: "short" });
      head += "<span>" + esc(wd.replace(/\.$/, "")) + "</span>";
    }
    head += "</div>";

    var first = new Date(month), offset = (first.getDay() + 6) % 7; // lundi = 0
    var cursor = new Date(first.getFullYear(), first.getMonth(), 1 - offset);
    var html = head, inMonth = 0;
    for (var w = 0; w < 6; w++) {
      if (w > 3 && cursor.getMonth() !== month.getMonth()) break;
      html += '<div class="wsc-week">';
      for (var d = 0; d < 7; d++) {
        var iso = S.isoOf(cursor), out = cursor.getMonth() !== month.getMonth();
        var day = out ? [] : sessionsOn(iso, list);
        inMonth += day.length;
        var cls = "wsc-day" + (out ? " is-out" : "") + (iso < today ? " is-past" : "") + (iso === today ? " is-today" : "") + (day.length ? " has-sess" : "");
        var dateLabel = cursor.toLocaleDateString(I.locale(), { weekday: "long", day: "numeric", month: "long" });
        html += '<div class="' + cls + '"' + (iso === today ? ' aria-current="date"' : "") + '><span class="wsc-day__n"><span aria-hidden="true">' +
          cursor.getDate() + '</span><span class="sr-only">' + esc(dateLabel) + "</span></span>" + day.map(chip).join("") + "</div>";
        cursor.setDate(cursor.getDate() + 1);
      }
      html += "</div>";
    }
    grid.innerHTML = html;
    if (status) { status.hidden = inMonth > 0; status.textContent = inMonth ? "" : t("sess.cal_empty_month"); }

    var last = list.length ? monthStart(S.parse(list[list.length - 1].endDate || list[list.length - 1].date)) : now;
    prev.disabled = month <= now;
    next.disabled = month >= last && month >= now;
  }

  function renderDetail() {
    var box = cal && $("[data-wsc-detail]", cal);
    if (!box) return;
    var s = selected && all.filter(function (x) { return x.id === selected; })[0];
    if (!s) {
      box.innerHTML = '<div class="wss-card wss-card--empty">' + (root.CFS_CATALOG.icons.calendar || "") + "<p>" + esc(t("sess.cal_pick")) + "</p></div>";
      return;
    }
    box.innerHTML = UI.card(s, "div");
    UI.paintGauges(box, all);
  }

  function renderAll() { renderList(); if (cal) { renderCalendar(); renderDetail(); } }

  /* ---------- Filtres ---------- */
  function setChip(kind, value) {
    state[kind] = value;
    $$('[data-sf="' + kind + '"]').forEach(function (b) { b.setAttribute("aria-pressed", String((b.getAttribute("data-value") || "") === value)); });
  }

  function bindFilters() {
    var sel = $('[data-sf-select="training"]');
    if (sel) {
      sel.addEventListener("change", function () { state.training = sel.value; renderAll(); });
    }
    $$("[data-sf]").forEach(function (b) {
      b.addEventListener("click", function () {
        var kind = b.getAttribute("data-sf"), v = b.getAttribute("data-value") || "";
        setChip(kind, state[kind] === v ? "" : v);
        renderAll();
      });
    });
    // Seuls les domaines et lieux qui ont au moins une session sont proposés
    var doms = {}, locs = {}, trainings = {};
    all.forEach(function (s) { doms[s.domain] = locs[s.location] = trainings[s.training] = true; });
    $$('[data-sf="domain"]').forEach(function (b) { var v = b.getAttribute("data-value"); if (v) b.hidden = !doms[v]; });
    $$('[data-sf="location"]').forEach(function (b) { var v = b.getAttribute("data-value"); if (v) b.hidden = !locs[v]; });
    if (sel) $$("option", sel).forEach(function (o) { if (o.value) o.disabled = !trainings[o.value]; });

    // Pré-filtrage depuis l'adresse
    var q = new URLSearchParams(location.search);
    var f = q.get("formation"), d = q.get("domaine"), l = q.get("lieu");
    if (f && sel && trainings[f]) { sel.value = f; state.training = f; }
    if (d && doms[d]) setChip("domain", d);
    if (l && locs[l]) setChip("location", l);
  }

  function bindCalendar() {
    if (!cal) return;
    $("[data-wsc-prev]", cal).addEventListener("click", function () { month = new Date(month.getFullYear(), month.getMonth() - 1, 1); renderCalendar(); });
    $("[data-wsc-next]", cal).addEventListener("click", function () { month = new Date(month.getFullYear(), month.getMonth() + 1, 1); renderCalendar(); });
    $("[data-wsc-grid]", cal).addEventListener("click", function (e) {
      var b = e.target.closest(".wsc-chip");
      if (!b) return;
      selected = selected === b.getAttribute("data-id") ? null : b.getAttribute("data-id");
      $$(".wsc-chip", cal).forEach(function (c) { c.setAttribute("aria-pressed", String(c.getAttribute("data-id") === selected)); });
      renderDetail();
      if (selected && window.matchMedia("(max-width: 980px)").matches) {
        var box = $("[data-wsc-detail]", cal);
        box.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest" });
      }
    });
  }

  S.load().then(function (res) {
    all = res.sessions;
    UI.showLive(res, "[data-wsc-live]");
    bindFilters();
    // Mois affiché : celui de la première session à venir (sinon le mois en cours)
    var firstOpen = all.filter(function (s) { return S.level(s) !== "closed"; })[0] || all[0];
    var now = monthStart(new Date());
    month = firstOpen ? monthStart(S.parse(firstOpen.date)) : now;
    if (month < now) month = now;
    bindCalendar();
    renderAll();
    // Places relues (toutes les 45 s) : calendrier, liste et fiche ouverte mis à jour, mois et sélection conservés
    document.addEventListener("cfs:sessions", function (e) {
      all = e.detail.sessions;
      renderAll();
    });
  });
})(typeof self !== "undefined" ? self : this);
