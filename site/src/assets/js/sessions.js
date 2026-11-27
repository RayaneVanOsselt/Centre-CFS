/* =========================================================================
   Centre CFS — sessions : données et mise en forme (aucun affichage ici, voir sessions-ui.js).

   Source des sessions, dans cet ordre :
     1. la liste publique en direct (CFS_CONFIG.sessionsUrl : GET /api/sessions du Worker, qui lit la feuille Google),
        si elle est configurée et répond en moins de 6 s ;
     2. le fichier de secours sessions-data.js (window.CFS_SESSIONS_FALLBACK), généré depuis client/sessions.csv.
   Seule la source en direct donne des places restantes ; le fichier de secours ne donne qu'une capacité.
   Les sessions passées et annulées sont toujours écartées, quelle que soit la source.
   En direct, la liste est relue toutes les 45 s tant que l'onglet est visible ; chaque changement émet l'événement
   « cfs:sessions » (detail : { sessions, live, changed: [identifiants] }). Après une réservation, apply() met
   immédiatement à jour les places renvoyées par le serveur.
   ========================================================================= */
(function (root) {
  "use strict";
  var cfg = root.CFS_CONFIG || {};
  var cat = root.CFS_CATALOG || {};
  var I = root.CfsI18n;
  var t = function (k, v) { return I ? I.t(k, v) : k; };

  var FORM = {};
  (cat.formations || []).forEach(function (f) { FORM[f.id] = f; });
  var DOM = {};
  (cat.domains || []).forEach(function (d) { DOM[d.id] = d; });

  var ISO = /^\d{4}-\d{2}-\d{2}$/;
  var TIME = /^\d{2}:\d{2}$/;
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function isoOf(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function todayIso() { return isoOf(new Date()); }
  function parse(iso) { var p = String(iso).split("-").map(Number); return new Date(p[0], p[1] - 1, p[2]); }
  function addDays(iso, n) { var d = parse(iso); d.setDate(d.getDate() + n); return isoOf(d); }
  function num(v) { return typeof v === "number" && isFinite(v) && v >= 0 ? v : null; }

  /** Session propre et complète, ou null si elle est invalide, passée ou annulée. */
  function clean(s, live, today) {
    if (!s || typeof s !== "object" || !FORM[s.training] || !ISO.test(s.date)) return null;
    var end = s.endDate && ISO.test(s.endDate) && s.endDate >= s.date ? s.endDate : null;
    if ((end || s.date) < today || s.status === "cancelled") return null;
    var f = FORM[s.training];
    return {
      id: String(s.id || s.date + "-" + s.training + "-" + (s.location || "")),
      training: s.training,
      domain: f.domain,
      date: s.date,
      endDate: end,
      startTime: TIME.test(s.startTime || "") ? s.startTime : null,
      endTime: TIME.test(s.endTime || "") ? s.endTime : null,
      location: cat.locations && cat.locations[s.location] ? s.location : "engis",
      language: s.language || "fr",
      capacity: num(s.capacity),
      seatsLeft: live ? num(s.seatsLeft != null ? s.seatsLeft : s.remaining) : null,
      status: ["open", "full", "closed"].indexOf(s.status) >= 0 ? s.status : "open",
      closesAt: typeof s.closesAt === "string" ? s.closesAt : null,
      price: num(s.price) !== null && s.price > 0 ? s.price : f.price,
      live: !!live
    };
  }

  function normalize(list, live) {
    var today = todayIso(), out = [];
    (Array.isArray(list) ? list : []).forEach(function (s) { var c = clean(s, live, today); if (c) out.push(c); });
    return out.sort(function (a, b) {
      var ka = a.date + (a.startTime || ""), kb = b.date + (b.startTime || "");
      return ka < kb ? -1 : ka > kb ? 1 : a.id < b.id ? -1 : 1;
    });
  }

  var loading = null, current = null, REFRESH_MS = 45000;

  function fallback(reason) {
    if (reason && root.console) root.console.info("[sessions] fichier de secours utilisé :", reason);
    var fb = root.CFS_SESSIONS_FALLBACK || {};
    return { sessions: normalize(fb.sessions, false), live: false };
  }

  /** Lecture de la liste en direct ; null si elle ne répond pas correctement. */
  function fetchLive() {
    var ctrl = typeof AbortController === "function" ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 6000) : null;
    return root.fetch(cfg.sessionsUrl, { headers: { Accept: "application/json" }, credentials: "omit", signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status)); })
      .then(function (d) {
        if (!d || !(d.ok === true || d.status === "ok") || !Array.isArray(d.sessions)) throw new Error("réponse inattendue");
        return { sessions: normalize(d.sessions, true), live: true };
      })
      .finally(function () { if (timer) clearTimeout(timer); });
  }

  /** Promesse { sessions: [...], live: bool }. Une seule requête au chargement de la page. */
  function load() {
    if (loading) return loading;
    if (!cfg.sessionsUrl || typeof root.fetch !== "function") {
      loading = Promise.resolve(fallback(cfg.sessionsUrl ? "fetch indisponible" : ""));
    } else {
      loading = fetchLive().catch(function (e) { return fallback(e && e.message); });
    }
    loading = loading.then(function (res) { current = res; if (res.live) schedule(); return res; });
    return loading;
  }

  /** Publie une nouvelle liste si des places ont changé (identifiants des sessions modifiées). */
  function publish(next) {
    var before = {};
    (current ? current.sessions : []).forEach(function (s) { before[s.id] = s.seatsLeft + "|" + s.status; });
    var changed = next.sessions.filter(function (s) { return before[s.id] !== s.seatsLeft + "|" + s.status; }).map(function (s) { return s.id; });
    current = next;
    loading = Promise.resolve(next);
    if (changed.length && root.document && typeof CustomEvent === "function") {
      root.document.dispatchEvent(new CustomEvent("cfs:sessions", { detail: { sessions: next.sessions, live: next.live, changed: changed } }));
    }
    return changed;
  }

  var timerId = null;
  function schedule() {
    if (timerId || !root.document || !root.setInterval) return;
    timerId = root.setInterval(function () {
      if (root.document.visibilityState === "hidden") return;
      fetchLive().then(publish).catch(function () { /* on garde la dernière liste connue */ });
    }, REFRESH_MS);
  }

  /** Places renvoyées par le serveur après une réservation : appliquées tout de suite (sans attendre le cache). */
  function apply(sessionId, remaining, capacity) {
    if (!current || !current.live || typeof remaining !== "number") return;
    var next = current.sessions.map(function (s) {
      if (s.id !== sessionId) return s;
      var c = {};
      Object.keys(s).forEach(function (k) { c[k] = s[k]; });
      c.seatsLeft = Math.max(0, remaining);
      if (typeof capacity === "number" && capacity > 0) c.capacity = capacity;
      if (c.seatsLeft === 0) c.status = "full";
      return c;
    });
    publish({ sessions: next, live: true });
  }

  /* ---------- État d'une session ---------- */
  function isToday(s) { var d = todayIso(); return s.date <= d && (s.endDate || s.date) >= d; }

  /** Les inscriptions sont-elles encore possibles ? (clôture donnée par la feuille, sinon : la veille du premier jour) */
  function isClosed(s) {
    if (s.status === "closed") return true;
    if (s.closesAt) {
      var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(s.closesAt);
      if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime() <= Date.now();
    }
    return s.date <= todayIso();
  }

  /** Seuil « dernières places » : max(3 ; 20 % de la capacité), comme le Worker (worker/src/routes/sessions.js). */
  function lowThreshold(capacity) { return Math.max(3, Math.ceil(capacity * 0.2)); }

  /** open | low | full | closed — même code couleur que le calendrier et la légende (mission, section 6.5). */
  function level(s) {
    if (isClosed(s)) return "closed";
    if (s.status === "full" || s.seatsLeft === 0) return "full";
    if (s.seatsLeft != null && s.capacity && s.seatsLeft <= lowThreshold(s.capacity)) return "low";
    return "open";
  }

  /** Texte de disponibilité (annexe B de la mission, clés availability.*). */
  function seatsText(s) {
    var lv = level(s);
    if (lv === "closed") return t("availability.closed");
    if (lv === "full") return t("availability.full");
    if (s.live && s.seatsLeft != null && s.capacity) {
      if (s.seatsLeft === 1) return t("availability.last");
      return t(lv === "low" ? "availability.low" : "availability.open", { remaining: s.seatsLeft, capacity: s.capacity });
    }
    return s.capacity ? t("sess.capacity", { total: s.capacity }) : t("availability.on_request");
  }

  /* ---------- Mise en forme ---------- */
  function locale() { return I ? I.locale() : "fr-BE"; }
  function fmt(iso, opts) { return parse(iso).toLocaleDateString(locale(), opts); }
  function shortDate(iso) { return fmt(iso, { day: "numeric", month: "short" }); }
  function longDate(iso) { return fmt(iso, { weekday: "long", day: "numeric", month: "long", year: "numeric" }); }

  /** « jeudi 26 novembre 2026 », « 10 et 11 décembre 2026 » ou « du 7 au 9 décembre 2026 ». */
  function dateText(s) {
    if (!s.endDate || s.endDate === s.date) return longDate(s.date);
    var a = fmt(s.date, { day: "numeric", month: "long" }), b = fmt(s.endDate, { day: "numeric", month: "long", year: "numeric" });
    return addDays(s.date, 1) === s.endDate ? t("sess.and", { a: a, b: b }) : t("sess.from_to", { a: a, b: b });
  }

  function days(s) {
    if (!s.endDate) return 1;
    return Math.round((parse(s.endDate) - parse(s.date)) / 86400000) + 1;
  }

  /** « 08:30 » → « 8 h 30 » en français (usage typographique), inchangé en néerlandais et en anglais. */
  function hm(v) { return I && I.lang() === "fr" ? v.replace(/^0(\d)/, "$1").replace(":", " h ").replace(/ h 00$/, " h") : v; }
  function timeText(s) {
    if (s.startTime && s.endTime) return hm(s.startTime) + " – " + hm(s.endTime);
    return s.startTime ? hm(s.startTime) : t("sess.all_day");
  }

  function training(id) { return FORM[id] || null; }
  function domain(id) { return DOM[id] || null; }
  function place(code) { return (cat.locations && cat.locations[code]) || { name: code, full: code, street: "", zip: "", city: "", maps: "" }; }
  function languageName(code) {
    var n = (cat.languages && cat.languages[code]) || code;
    return n.charAt(0).toUpperCase() + n.slice(1);
  }
  function priceText(s) { return s.price ? t("sess.price_excl", { price: I.money(s.price) }) : t("common.quote"); }
  function route(key) { return (cat.routes && cat.routes[key]) || "/"; }
  function bookUrl(s) {
    return route("inscription") + "?formation=" + encodeURIComponent(s.training) + "&session=" + encodeURIComponent(s.id);
  }

  /* ---------- Prochaines dates sur les cartes formation (catalogue, fiches liées) ---------- */
  function fillNextDates() {
    var els = Array.prototype.slice.call(document.querySelectorAll("[data-next-for]"));
    if (!els.length) return;
    load().then(function (res) {
      els.forEach(function (el) {
        var first = res.sessions.filter(function (s) { return s.training === el.getAttribute("data-next-for") && level(s) !== "closed"; })[0];
        if (!first) return;
        el.textContent = shortDate(first.date);
        el.classList.add("next");
        var card = el.closest("[data-item]");
        if (card) card.setAttribute("data-has-date", "1");
      });
    });
  }

  root.CfsSessions = {
    load: load, apply: apply, lowThreshold: lowThreshold, normalize: normalize, level: level, isClosed: isClosed, isToday: isToday, seatsText: seatsText,
    dateText: dateText, shortDate: shortDate, longDate: longDate, timeText: timeText, days: days, parse: parse, isoOf: isoOf,
    addDays: addDays, todayIso: todayIso, training: training, domain: domain, place: place, languageName: languageName,
    priceText: priceText, bookUrl: bookUrl, route: route
  };

  if (root.document) fillNextDates();
})(typeof self !== "undefined" ? self : this);
