/* =========================================================================
   Centre CFS — affichage des sessions : tickets « permis de travail » (accueil, domaines, agenda),
   fiches de session (pages formation, panneau du calendrier) et prochaine session du héros.
   Aucune date n'est écrite dans le HTML généré : tout vient de CfsSessions.load().
   Tout le texte inséré est échappé (CfsI18n.esc) ; aucun attribut style (compatible CSP stricte).
   ========================================================================= */
(function (root) {
  "use strict";
  var S = root.CfsSessions, I = root.CfsI18n, cat = root.CFS_CATALOG || {}, cfg = root.CFS_CONFIG || {};
  if (!S || !I || !root.document) return;
  var t = I.t, esc = I.esc;
  var ICON = cat.icons || {};
  var $$ = function (sel, r) { return Array.prototype.slice.call((r || document).querySelectorAll(sel)); };

  function sign(s) { var d = S.domain(s.domain); return d ? d.sign : ""; }
  function domainName(s) { var d = S.domain(s.domain); return d ? d.name : ""; }
  function title(s) { var f = S.training(s.training); return f ? f.title : s.training; }
  function trainingUrl(s) { var f = S.training(s.training); return f ? f.url : S.route("formations"); }

  /** Bouton d'action : réservation ferme (places en direct + paiement en ligne) ou demande de place. */
  function action(s, cls) {
    var lv = S.level(s);
    if (lv === "closed" || lv === "full") {
      return '<a class="btn btn--contour ' + cls + '" href="' + esc(trainingUrl(s)) + '">' + esc(t("sess.view")) + "</a>";
    }
    var firm = s.live && cfg.onlinePayment;
    // Bouton bleu : le seul bouton jaune de l'écran reste l'action principale de la page (charte, un seul jaune).
    return '<a class="btn btn--bleu ' + cls + '" href="' + esc(S.bookUrl(s)) + '">' + esc(t(firm ? "sess.book" : "sess.request")) + "</a>";
  }

  function pill(s) {
    var lv = S.level(s);
    var cls = lv === "open" && !(s.live && s.seatsLeft != null) ? "unknown" : lv;
    var out = '<span class="seat-pill seat-pill--' + cls + '">' + esc(S.seatsText(s)) + "</span>";
    if (S.isToday(s)) out = '<span class="seat-pill seat-pill--today">' + esc(t("sess.today")) + "</span>" + out;
    return out;
  }

  function priceHtml(s) {
    return s.price ? esc(I.money(s.price)) + " <small>" + esc(t("common.htva")) + "</small>" : esc(t("common.quote"));
  }

  /** Ticket « permis de travail ». */
  function permit(s) {
    var d = S.parse(s.date), n = S.days(s), lv = S.level(s);
    var wd = d.toLocaleDateString(I.locale(), { weekday: "short" }), mo = d.toLocaleDateString(I.locale(), { month: "short" });
    var span = n > 1 ? '<span class="permit__span">' + esc(I.lang() === "en" ? n + " days" : I.lang() === "nl" ? n + " dagen" : n + " jours") + "</span>" : "";
    var p = S.place(s.location);
    return '<li class="permit permit--' + lv + '" data-session-id="' + esc(s.id) + '">' +
      '<div class="permit__date" aria-hidden="true"><span class="permit__wd">' + esc(wd) + '</span><span class="permit__d">' + d.getDate() +
      '</span><span class="permit__m">' + esc(mo) + "</span>" + span + "</div>" +
      '<div class="permit__body">' +
      '<p class="permit__top">' + sign(s) + "<span>" + esc(domainName(s)) + "</span></p>" +
      '<h3 class="permit__title"><a href="' + esc(trainingUrl(s)) + '">' + esc(title(s)) + "</a></h3>" +
      '<ul class="permit__meta">' +
      "<li>" + (ICON.calendar || "") + "<span>" + esc(S.dateText(s)) + "</span></li>" +
      "<li>" + (ICON.clock || "") + "<span>" + esc(S.timeText(s)) + "</span></li>" +
      "<li>" + (ICON.pin || "") + "<span>" + esc(p.full) + "</span></li>" +
      "<li>" + (ICON.globe || "") + "<span>" + esc(S.languageName(s.language)) + "</span></li></ul>" +
      '<div class="permit__foot"><div class="permit__status"><span class="permit__price">' + priceHtml(s) + "</span>" + pill(s) + "</div>" +
      action(s, "btn--petit") + "</div>" +
      "</div></li>";
  }

  /** Fiche de session détaillée (pages formation et panneau du calendrier). */
  function card(s, tag) {
    tag = tag || "li";
    var lv = S.level(s), p = S.place(s.location);
    var addr = p.street ? p.street + ", " + p.zip + " " + p.city : p.full;
    var seats;
    if (s.live && s.capacity && s.seatsLeft != null) {
      seats = '<p class="wss-count"><b>' + s.seatsLeft + "</b><span>/ " + s.capacity + "</span></p>" +
        (s.capacity <= 30
          ? '<div class="wss-gauge" data-gauge="' + s.capacity + '" aria-hidden="true">' + new Array(s.capacity + 1).join("<i></i>") + "</div>"
          : '<div class="wss-gauge wss-gauge--bar" data-gauge-bar aria-hidden="true"><i></i></div>');
    } else {
      seats = "";
    }
    var note = s.live ? '<p class="wss-card__note">' + esc(t("sess.indicative")) + "</p>" : "";
    return "<" + tag + ' class="wss-card wss-card--' + lv + '" data-session-id="' + esc(s.id) + '">' +
      '<div class="wss-card__top">' + sign(s) + '<div><p class="wss-card__eyebrow">' + esc(S.dateText(s)) + "</p>" +
      '<h3 class="wss-card__title"><a href="' + esc(trainingUrl(s)) + '">' + esc(title(s)) + "</a></h3></div></div>" +
      '<ul class="wss-card__meta">' +
      "<li>" + (ICON.clock || "") + "<span>" + esc(S.timeText(s)) + "</span></li>" +
      "<li>" + (ICON.pin || "") + "<span>" + esc(p.full) + (p.street ? " – " + esc(addr) : "") + "</span></li>" +
      "<li>" + (ICON.globe || "") + "<span>" + esc(S.languageName(s.language)) + "</span></li></ul>" +
      '<div class="wss-card__seats">' + seats + '<p class="wss-card__seatstxt">' + pill(s) + "</p></div>" +
      '<p class="wss-card__price">' + priceHtml(s) + "</p>" +
      action(s, "btn--bloc") + note +
      "</" + tag + ">";
  }

  /** Jauges : nombre de cases et proportion prise posées par CSSOM (pas d'attribut style, CSP stricte). */
  function paintGauges(scope, sessions) {
    $$("[data-session-id]", scope).forEach(function (el) {
      var s = sessions.filter(function (x) { return x.id === el.getAttribute("data-session-id"); })[0];
      if (!s || !s.capacity || s.seatsLeft == null) return;
      var g = el.querySelector("[data-gauge]");
      if (g) {
        g.style.setProperty("--wss-n", String(s.capacity));
        var taken = s.capacity - s.seatsLeft;
        Array.prototype.forEach.call(g.children, function (i, k) { if (k < taken) i.className = "is-taken"; });
      }
      var b = el.querySelector("[data-gauge-bar]");
      if (b) b.style.setProperty("--wss-taken", Math.round((1 - s.seatsLeft / s.capacity) * 100) + "%");
    });
  }

  /** Remplit une liste de tickets ; affiche le bloc « aucune session » voisin si elle est vide. */
  function renderList(list, sessions) {
    var limit = Number(list.getAttribute("data-limit") || 0);
    var shown = limit ? sessions.slice(0, limit) : sessions;
    list.innerHTML = shown.map(permit).join("");
    list.setAttribute("aria-busy", "false");
    list.hidden = !shown.length;
    var box = list.parentElement, empty = box && box.querySelector("[data-session-empty]");
    if (empty) empty.hidden = shown.length > 0;
    return shown.length;
  }

  function showLive(res, sel) { $$(sel).forEach(function (el) { el.hidden = !res.live; }); }

  /* ---------- Rendu automatique selon les blocs présents dans la page ---------- */
  S.load().then(function (res) {
    var all = res.sessions;
    var upcoming = all.filter(function (s) { return S.level(s) !== "closed"; });
    showLive(res, "[data-live]");

    // Listes simples (accueil, domaines) : sessions encore ouvertes. Celle de l'agenda (data-filters) est gérée par agenda.js.
    $$("[data-session-list]").forEach(function (list) {
      if (list.hasAttribute("data-filters")) return;
      var dom = list.getAttribute("data-domain");
      renderList(list, (dom ? upcoming.filter(function (s) { return s.domain === dom; }) : upcoming));
    });

    // Fiche formation : sessions encore ouvertes de cette formation
    $$("[data-sessions-for]").forEach(function (sec) {
      var slug = sec.getAttribute("data-sessions-for");
      var mine = upcoming.filter(function (s) { return s.training === slug; });
      var ul = sec.querySelector("[data-wss-list]");
      if (ul) { ul.innerHTML = mine.map(function (s) { return card(s); }).join(""); paintGauges(ul, mine); }
      sec.hidden = !mine.length;
      var live = sec.querySelector("[data-wss-live]");
      if (live) live.hidden = !res.live;
      $$('[data-sessions-empty-for="' + slug + '"]').forEach(function (e) { e.hidden = mine.length > 0; });
    });

    // Héros de l'accueil : prochaine session ouverte
    var hero = document.querySelector("[data-hero-next]");
    if (hero && upcoming.length) {
      hero.innerHTML = '<p class="board-next-label">' + (ICON.calendar || "") + esc(hero.getAttribute("data-label") || t("sess.next")) + "</p>" +
        '<ul class="permits">' + permit(upcoming[0]) + "</ul>";
    }
  });

  root.CfsSessionsUI = { permit: permit, card: card, renderList: renderList, paintGauges: paintGauges, showLive: showLive };
})(typeof self !== "undefined" ? self : this);
