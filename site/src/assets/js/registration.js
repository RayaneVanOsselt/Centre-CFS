/* =========================================================================
   Centre CFS — page d'inscription : choix de la session, participants, facturation, récapitulatif.

   Avec le Worker (CFS_CONFIG.api) : POST /api/registrations. La feuille vérifie les places SOUS VERROU et calcule le
   montant ; selon le cas, la réponse est une réservation sur facture (entreprise avec n° de TVA, places bloquées 72 h),
   un paiement en ligne (redirection Mollie, places bloquées 30 min) ou une demande (particulier sans paiement en ligne,
   date à convenir). Les places restantes renvoyées sont appliquées tout de suite (CfsSessions.apply).
   Sans Worker (site statique), l'inscription est une DEMANDE envoyée par CfsForms.deliver (e-mail pré-rempli).
   Le montant affiché est indicatif (même calcul que la feuille : centimes entiers, TVA arrondie au centime).
   Pré-remplissage : ?formation=vca-base&session=2026-12-10-vca-base-charleroi
   ========================================================================= */
(function (root) {
  "use strict";
  var I = root.CfsI18n, F = root.CfsForms, S = root.CfsSessions, cfg = root.CFS_CONFIG || {};
  var box = root.document && document.querySelector("[data-registration]");
  if (!I || !F || !S || !box) return;
  var form = box.querySelector("[data-reg-form]");
  if (!form) return;
  var t = I.t, esc = I.esc;
  var $ = function (sel, r) { return (r || document).querySelector(sel); };
  var $$ = function (sel, r) { return Array.prototype.slice.call((r || document).querySelectorAll(sel)); };
  var MAX_PEOPLE = 20;
  var startedAt = Date.now();
  var q = new URLSearchParams(location.search);
  var wanted = q.get("session");
  var sessions = [];

  var trainingSel = form.elements.training;
  var picks = $("[data-session-picks]", form);
  var hint = $("[data-session-hint]", form);
  var people = $("[data-participants]", form);
  var tpl = document.getElementById("tpl-participant");
  var addBtn = $("[data-add-participant]", form);
  var companyFields = $("[data-company-fields]", form);

  /* ---------- Sessions de la formation choisie ---------- */
  function pickHtml(s) {
    var lv = S.level(s), off = lv === "full" || lv === "closed";
    var meta = [S.timeText(s), S.place(s.location).full, S.languageName(s.language)].join(" · ");
    return '<label class="session-pick' + (off ? " is-disabled" : "") + '"><input type="radio" name="sessionId" value="' + esc(s.id) + '"' + (off ? " disabled" : "") + ">" +
      "<span><strong>" + esc(S.dateText(s)) + "</strong><small>" + esc(meta) + "</small></span>" +
      '<span class="seat-pill seat-pill--' + (lv === "open" && !(s.live && s.seatsLeft != null) ? "unknown" : lv) + '">' + esc(S.seatsText(s)) + "</span></label>";
  }

  function renderPicks() {
    var slug = trainingSel.value;
    var mine = sessions.filter(function (s) { return s.training === slug && S.level(s) !== "closed"; });
    var tbd = '<label class="session-pick"><input type="radio" name="sessionId" value=""><span><strong>' + esc(t("reg.session_tbd")) + "</strong></span><span></span></label>";
    picks.innerHTML = slug ? mine.map(pickHtml).join("") + tbd : "";
    var radios = $$('input[name="sessionId"]', picks);
    var target = radios.filter(function (r) { return r.value === wanted && !r.disabled; })[0] || radios.filter(function (r) { return r.value && !r.disabled; })[0] || radios[radios.length - 1];
    if (target) target.checked = true;
    var msg = "";
    if (slug && wanted && !radios.some(function (r) { return r.value === wanted && !r.disabled; })) msg = t("reg.session_unavailable");
    else if (slug && !mine.length) msg = t("reg.no_sessions");
    hint.textContent = msg || sessionHint();
    wanted = null; // la session demandée dans l'adresse ne sert qu'au premier affichage
    updateRecap();
  }

  function selectedSession() {
    var r = $('input[name="sessionId"]:checked', picks);
    return r && r.value ? sessions.filter(function (s) { return s.id === r.value; })[0] || null : null;
  }

  /** Indication sous les sessions : places restantes (en direct) ou confirmation par l'équipe. */
  function sessionHint() {
    var s = selectedSession();
    if (!s) return "";
    if (!s.live) return t("reg.session_not_live");
    if (s.seatsLeft != null && s.capacity) return t("availability.remaining_hint", { remaining: s.seatsLeft });
    return "";
  }

  /** Mode de paiement choisi ; « invoice » si le paiement en ligne n'est pas proposé. */
  function payMode() {
    var r = $('input[name="payMode"]:checked', form);
    return r && r.value === "online" && cfg.onlinePayment ? "online" : "invoice";
  }

  /** La réservation bloquera-t-elle des places ? (sinon : demande traitée par l'équipe) */
  function firmBooking() {
    var s = selectedSession();
    if (!cfg.api || !s || !s.live) return false;
    if (payMode() === "online") return true;
    return billingType() === "company" && !!form.elements.vat.value.trim();
  }

  function syncSubmit() {
    var b = $("[data-reg-submit]", form);
    if (!b || b.disabled) return;
    b.textContent = t(!firmBooking() ? "reg.submit_request" : payMode() === "online" ? "reg.submit_pay" : "reg.submit_invoice");
  }

  /* ---------- Participants ---------- */
  function renumber() {
    var items = $$(".participant", people);
    items.forEach(function (p, i) {
      $(".participant-title", p).textContent = t("reg.participant", { n: i + 1 });
      $$("[data-name]", p).forEach(function (inp) { inp.name = inp.getAttribute("data-name") + "[" + i + "]"; inp.id = inp.getAttribute("data-name") + "-" + i; });
      $$("label[data-for]", p).forEach(function (l) { l.htmlFor = l.getAttribute("data-for") + "-" + i; });
      var rm = $(".remove", p);
      if (rm) { rm.hidden = i === 0; rm.setAttribute("aria-label", t("reg.remove") + " – " + t("reg.participant", { n: i + 1 })); }
    });
    if (addBtn) addBtn.disabled = items.length >= MAX_PEOPLE;
    updateRecap();
  }
  function addPerson(focus) {
    if (!tpl || $$(".participant", people).length >= MAX_PEOPLE) return;
    people.appendChild(tpl.content.cloneNode(true));
    renumber();
    if (focus) { var last = $$(".participant", people).pop(); $("input", last).focus(); }
  }

  /* ---------- Facturation ---------- */
  function billingType() { var r = $('input[name="billingType"]:checked', form); return r ? r.value : "individual"; }
  function syncBilling() {
    var company = billingType() === "company";
    companyFields.hidden = !company;
    form.elements.company.required = company;
    var lab = $('label[for="company"]', companyFields);
    if (lab && company && !$(".req", lab)) lab.insertAdjacentHTML("beforeend", ' <span class="req" aria-hidden="true">*</span>');
  }

  /* ---------- Récapitulatif ---------- */
  function amounts() {
    var o = trainingSel.selectedOptions[0];
    var price = o && o.getAttribute("data-price") ? Number(o.getAttribute("data-price")) : null;
    var s = selectedSession();
    if (s && s.price) price = s.price;
    var n = Math.max(1, $$(".participant", people).length);
    var a = price && root.CfsPricing ? root.CfsPricing.compute([{ unitPrice: price, quantity: n }], cfg.vatRate) : null;
    return { price: price, seats: n, a: a };
  }

  function updateRecap() {
    var r = $("[data-recap]");
    if (!r) return;
    var s = selectedSession(), m = amounts();
    $("[data-r-training]", r).textContent = F.optionText(trainingSel) || "—";
    $("[data-r-session]", r).textContent = s ? S.dateText(s) + " – " + S.place(s.location).name : (trainingSel.value ? t("reg.session_tbd") : "—");
    $("[data-r-seats]", r).textContent = String(m.seats);
    $("[data-r-excl]", r).textContent = m.a ? I.cents(m.a.exclCents) : trainingSel.value ? t("common.quote") : "—";
    $("[data-r-vat]", r).textContent = m.a ? I.cents(m.a.vatCents) : "—";
    $("[data-r-incl]", r).textContent = m.a ? I.cents(m.a.inclCents) : trainingSel.value ? t("common.quote") : "—";
    syncSubmit();
  }

  /* ---------- Envoi au Worker (réservation réelle) ---------- */
  function statusBox() { return $("[data-status]", form.parentElement) || $("[data-status]"); }

  function sendToWorker(payload, s) {
    var btn = $("[data-reg-submit]", form), label = btn ? btn.textContent : "";
    if (btn) { btn.disabled = true; btn.textContent = t("form.sending"); }
    var token = F.turnstileToken(form);
    if (token) payload.turnstileToken = token;
    return root.fetch(cfg.registrationEndpoint || "/api/registrations", {
      method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(payload)
    }).then(function (res) {
      return res.json().catch(function () { return {}; });
    }).then(function (data) {
      if (s && typeof data.remaining === "number") S.apply(s.id, data.remaining, data.capacity);
      if (data.ok !== true) {
        var first = data.fields ? F.markServerFields(form, data.fields) : null;
        F.showStatus(statusBox(), "err", t("form.error_title"), "<p>" + esc(data.message || t("form.error_text")) + "</p>");
        if (first) first.focus();
        if (root.turnstile && $("[data-turnstile]", form) && $("[data-turnstile]", form).dataset.widget) root.turnstile.reset($("[data-turnstile]", form).dataset.widget);
        return false;
      }
      delete form.dataset.requestId;
      if (data.paymentUrl && /^https:\/\//.test(data.paymentUrl)) {
        F.showStatus(statusBox(), "info", t("reg.redirecting"), "");
        root.location.href = data.paymentUrl;
        return true;
      }
      form.hidden = true;
      var invoice = data.status === "pending_invoice";
      F.showStatus(statusBox(), "ok", t(invoice ? "reg.ok_invoice_title" : "reg.ok_request_title"),
        "<p>" + esc(t(invoice ? "reg.ok_invoice_text" : "reg.ok_request_text", { ref: data.reference || "—" })) + "</p>");
      return true;
    }).catch(function () {
      F.showStatus(statusBox(), "err", t("form.error_title"), "<p>" + esc(t("availability.form_error")) + "</p>");
      return false;
    }).then(function (r) {
      if (btn) { btn.disabled = false; btn.textContent = label; syncSubmit(); }
      return r;
    });
  }

  /* ---------- Envoi ---------- */
  function submit(e) {
    e.preventDefault();
    if (!F.validate(form)) return;
    var el = form.elements, s = selectedSession(), m = amounts();
    var trainingLabel = F.optionText(trainingSel);
    var langLabel = F.optionText(el.trainingLanguage);
    var list = $$(".participant", people).map(function (p) {
      return { firstName: $('[data-name="p-first"]', p).value.trim(), lastName: $('[data-name="p-last"]', p).value.trim(), email: $('[data-name="p-email"]', p).value.trim() };
    });
    var company = billingType() === "company";
    var vat = company && el.vat.value.trim() && root.CfsVat ? root.CfsVat.format(el.vat.value) : "";
    // Jamais plus de participants que de places restantes (la feuille revérifie de toute façon sous verrou)
    if (s && s.live && s.seatsLeft != null && list.length > s.seatsLeft) {
      hint.textContent = s.seatsLeft === 0 ? t("availability.error_full") : t("availability.error_not_enough", { remaining: s.seatsLeft });
      hint.classList.add("is-error");
      picks.scrollIntoView({ block: "nearest" });
      return;
    }
    hint.classList.remove("is-error");
    if (cfg.api) {
      sendToWorker({
        requestId: F.requestId(form), lang: I.lang(), training: trainingSel.value, sessionId: s ? s.id : null, payMode: payMode(),
        trainingLanguage: el.trainingLanguage.value, participants: list, notes: el.notes.value.trim(),
        customer: { firstName: el.firstName.value.trim(), lastName: el.lastName.value.trim(), email: el.email.value.trim(), phone: el.phone.value.trim() },
        billing: { type: company ? "company" : "individual", company: company ? el.company.value.trim() : "", vat: vat.replace(/[\s.]/g, ""),
          street: el.street.value.trim(), zip: el.zip.value.trim(), city: el.city.value.trim(), country: el.country.value.trim() || "BE" },
        terms: el.terms.checked, website: el.website ? el.website.value : "", elapsedMs: Date.now() - startedAt
      }, s);
      return;
    }
    var when = s ? S.dateText(s) + " · " + S.timeText(s) + " · " + S.place(s.location).full : t("reg.session_tbd");
    var subject = t("form.mail_subject_registration", { training: trainingLabel }) + (s ? " – " + S.shortDate(s.date) + " (" + S.place(s.location).name + ")" : "");
    var total = m.a ? t("reg.recap_excl") + " : " + I.cents(m.a.exclCents) + " · " + t("reg.recap_vat", { rate: root.CfsPricing.vatPercent(cfg.vatRate) }) + " : " +
      I.cents(m.a.vatCents) + " · " + t("reg.recap_incl") + " : " + I.cents(m.a.inclCents) : t("common.quote");
    var text = F.lines([
      [t("reg.training"), trainingLabel],
      [t("reg.session"), when],
      [t("reg.training_lang"), langLabel],
      [t("reg.recap_seats"), String(list.length)]
    ]) + "\n\n" + t("reg.step_people") + " :\n" + list.map(function (p, i) {
      return " " + (i + 1) + ". " + p.firstName + " " + p.lastName + (p.email ? " (" + p.email + ")" : "");
    }).join("\n") + "\n\n" + F.lines([
      [t("reg.who"), company ? t("reg.who_company") : t("reg.who_individual")],
      [t("form.company"), company ? el.company.value : ""],
      [t("reg.vat"), vat],
      [t("reg.contact"), el.firstName.value.trim() + " " + el.lastName.value.trim()],
      [t("form.email"), el.email.value],
      [t("form.phone"), el.phone.value],
      [t("reg.street"), el.street.value],
      [t("reg.zip") + " / " + t("reg.city"), el.zip.value.trim() + " " + el.city.value.trim()],
      [t("reg.country"), el.country.value],
      [t("reg.step_payment"), t("reg.pay_invoice")],
      [t("reg.recap"), total + " (" + t("form.mail_indicative") + ")"]
    ]) + (el.notes.value.trim() ? "\n\n" + t("reg.notes") + " :\n" + el.notes.value.trim() : "") + "\n\n— " + t("form.mail_footer", { url: F.pageUrl() });

    F.deliver(form, {
      kind: "inscription", startedAt: startedAt, subject: subject, text: text,
      okTitle: t("reg.ok_request_title"), okText: t("reg.ok_request_text"),
      payload: {
        training: trainingSel.value, sessionId: s ? s.id : null, trainingLanguage: el.trainingLanguage.value, payMode: "invoice",
        participants: list, notes: el.notes.value.trim(), vatRate: cfg.vatRate,
        customer: { firstName: el.firstName.value.trim(), lastName: el.lastName.value.trim(), email: el.email.value.trim(), phone: el.phone.value.trim() },
        billing: { type: company ? "company" : "individual", company: company ? el.company.value.trim() : "", vat: vat.replace(/[\s.]/g, ""),
          street: el.street.value.trim(), zip: el.zip.value.trim(), city: el.city.value.trim(), country: el.country.value.trim() || "BE" },
        amounts: m.a, terms: el.terms.checked
      }
    });
  }

  /* ---------- Mise en route ---------- */
  var note = $("[data-recap] .muted");
  if (note && !cfg.onlinePayment && !cfg.api) note.textContent = t("reg.recap_note_request");
  var f0 = q.get("formation");
  if (f0 && $$("option", trainingSel).some(function (o) { return o.value === f0; })) trainingSel.value = f0;

  trainingSel.addEventListener("change", renderPicks);
  picks.addEventListener("change", function () {
    hint.classList.remove("is-error");
    hint.textContent = sessionHint();
    updateRecap();
  });
  form.addEventListener("change", function (e) { if (e.target && (e.target.name === "payMode" || e.target.name === "vat")) syncSubmit(); });
  form.addEventListener("input", function (e) { if (e.target && e.target.name === "vat") syncSubmit(); });
  // Places relues pendant la saisie : liste des sessions et indication mises à jour, choix conservé
  document.addEventListener("cfs:sessions", function (e) {
    var keep = selectedSession();
    sessions = e.detail.sessions;
    wanted = keep ? keep.id : null;
    renderPicks();
  });
  if (addBtn) addBtn.addEventListener("click", function () { addPerson(true); });
  people.addEventListener("click", function (e) {
    var b = e.target.closest(".remove");
    if (!b) return;
    var p = b.closest(".participant"), prev = p.previousElementSibling;
    p.remove();
    renumber();
    if (prev) $("input", prev).focus();
  });
  $$('input[name="billingType"]', form).forEach(function (r) { r.addEventListener("change", function () { syncBilling(); syncSubmit(); }); });
  F.liveCheck(form);
  F.turnstile(form);
  form.addEventListener("submit", submit);

  addPerson(false);
  syncBilling();
  updateRecap();
  S.load().then(function (res) { sessions = res.sessions; renderPicks(); });
})(typeof self !== "undefined" ? self : this);
