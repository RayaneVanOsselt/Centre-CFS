/* =========================================================================
   Centre CFS — sessions : données et mise en forme (aucun affichage ici, voir sessions-ui.js).

   Source des sessions, dans cet ordre :
     1. la liste publique en direct (CFS_CONFIG.sessionsUrl), si elle est configurée et répond en moins de 6 s ;
     2. le fichier de secours sessions-data.js (window.CFS_SESSIONS_FALLBACK), généré depuis client/sessions.csv.
   Seule la source en direct donne des places restantes ; le fichier de secours ne donne qu'une capacité.
   Les sessions passées et annulées sont toujours écartées, quelle que soit la source.
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
      seatsLeft: live ? num(s.seatsLeft) : null,
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

  var loading = null;
  /** Promesse { sessions: [...], live: bool }. Une seule requête par page. */
  function load() {
    if (loading) return loading;
    var fallback = function () {
      var fb = root.CFS_SESSIONS_FALLBACK || {};
      return { sessions: normalize(fb.sessions, false), live: false };
    };
    if (!cfg.sessionsUrl || typeof root.fetch !== "function") {
      loading = Promise.resolve(fallback());
      return loading;
    }
    var ctrl = typeof AbortController === "function" ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 6000) : null;
    loading = root.fetch(cfg.sessionsUrl, { headers: { Accept: "application/json" }, credentials: "omit", signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        return d && d.status === "ok" && Array.isArray(d.sessions) ? { sessions: normalize(d.sessions, true), live: true } : fallback();
      })
      .catch(fallback)
      .then(function (res) { if (timer) clearTimeout(timer); return res; });
    return loading;
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

  /** open | low | full | closed — même code couleur que le calendrier et la légende. */
  function level(s) {
    if (isClosed(s)) return "closed";
    if (s.status === "full" || s.seatsLeft === 0) return "full";
    if (s.seatsLeft != null && s.capacity && s.seatsLeft <= Math.max(2, Math.ceil(s.capacity * 0.2))) return "low";
    return "open";
  }

  function seatsText(s) {
    var lv = level(s);
    if (lv === "closed") return t("sess.closed");
    if (lv === "full") return t("sess.full");
    if (s.live && s.seatsLeft != null && s.capacity) {
      return s.seatsLeft === 1 ? t("sess.seats_one", { total: s.capacity }) : t("sess.seats_of", { n: s.seatsLeft, total: s.capacity });
    }
    return s.capacity ? t("sess.capacity", { total: s.capacity }) : t("sess.capacity_unknown");
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
    load: load, normalize: normalize, level: level, isClosed: isClosed, isToday: isToday, seatsText: seatsText,
    dateText: dateText, shortDate: shortDate, longDate: longDate, timeText: timeText, days: days, parse: parse, isoOf: isoOf,
    addDays: addDays, todayIso: todayIso, training: training, domain: domain, place: place, languageName: languageName,
    priceText: priceText, bookUrl: bookUrl, route: route
  };

  if (root.document) fillNextDates();
})(typeof self !== "undefined" ? self : this);
