/* =========================================================================
   Centre CFS — formulaires : validation accessible, envoi, formulaire de contact / devis.

   Deux modes d'envoi, choisis à la construction du site (site/build.py) :
     - CFS_CONFIG.formEndpoint renseigné (POST /api/contact du Worker) : la demande part en JSON avec un requestId
       (gardé en cas de nouvel essai : jamais de doublon). « Merci… Référence » n'est affiché QUE si la réponse
       contient ok: true ; sinon le message traduit du serveur et les champs en défaut sont affichés ;
     - sinon (GitHub Pages, aucun serveur) : le formulaire est vérifié puis prépare un e-mail complet adressé à
       CFS_CONFIG.formEmail (variable FORM_EMAIL). La messagerie du visiteur s'ouvre ; le message reste affiché
       avec un bouton « Copier ».
   Champ piège (« website ») et durée minimale de saisie contre les robots dans les deux modes.
   ========================================================================= */
(function (root) {
  "use strict";
  var I = root.CfsI18n, cfg = root.CFS_CONFIG || {}, cat = root.CFS_CATALOG || {};
  if (!I || !root.document) return;
  var t = I.t, esc = I.esc;
  var $ = function (sel, r) { return (r || document).querySelector(sel); };
  var $$ = function (sel, r) { return Array.prototype.slice.call((r || document).querySelectorAll(sel)); };

  var EMAIL = /^[^@\s"<>]+@[^@\s"<>]+\.[^@\s"<>]{2,}$/;
  var PHONE = /^\+?[0-9 ()./-]{8,25}$/;

  function fieldOf(el) { return el.closest(".field") || el.closest(".check"); }

  function setError(el, bad) {
    var f = fieldOf(el);
    if (f) f.classList.toggle("has-error", bad);
    if (bad) el.setAttribute("aria-invalid", "true"); else el.removeAttribute("aria-invalid");
  }

  /** Contrôle d'un champ (obligatoire, e-mail, téléphone, TVA belge). */
  function check(el) {
    if (el.disabled || el.closest("[hidden]") || el.type === "hidden" || el.closest(".hp")) return true;
    var v = el.type === "checkbox" || el.type === "radio" ? "" : String(el.value || "").trim();
    if (el.required) {
      if (el.type === "checkbox") { if (!el.checked) return false; }
      else if (el.type === "radio") { if (!$$('input[name="' + el.name + '"]', el.form).some(function (r) { return r.checked; })) return false; }
      else if (!v) return false;
    }
    if (!v) return true;
    if (el.type === "email") return EMAIL.test(v) && v.length <= 160;
    if (el.type === "tel") return PHONE.test(v) && v.replace(/\D/g, "").length >= 8;
    if (el.name === "vat" && root.CfsVat) return root.CfsVat.isValid(v);
    return true;
  }

  /** Valide tout le formulaire, signale chaque champ fautif et place le focus sur le premier. */
  function validate(form) {
    var first = null;
    $$("input, select, textarea", form).forEach(function (el) {
      if (!el.name && !el.hasAttribute("data-name")) return;
      var ok = check(el);
      setError(el, !ok);
      if (!ok && !first) first = el;
    });
    if (first) first.focus();
    return !first;
  }

  /** Efface l'erreur d'un champ dès qu'il est corrigé. */
  function liveCheck(form) {
    form.addEventListener("input", function (e) { var el = e.target; if (fieldOf(el) && fieldOf(el).classList.contains("has-error") && check(el)) setError(el, false); });
    form.addEventListener("change", function (e) { var el = e.target; if (fieldOf(el) && fieldOf(el).classList.contains("has-error") && check(el)) setError(el, false); });
  }

  function showStatus(box, kind, title, html) {
    if (!box) return;
    box.className = "form-status is-" + kind;
    box.innerHTML = "<h3>" + esc(title) + "</h3>" + html;
    box.focus();
  }

  function pageUrl() { return location.href.split("#")[0].split("?")[0]; }

  function recipient() { return cfg.formEmail || cfg.email || ""; }

  function mailtoUrl(subject, body) {
    return "mailto:" + recipient() + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
  }

  function copy(text, btn) {
    var done = function () { btn.textContent = t("form.mail_copied"); };
    if (navigator.clipboard && root.isSecureContext) {
      navigator.clipboard.writeText(text).then(done, function () { selectPreview(btn); });
    } else {
      selectPreview(btn);
    }
  }
  function selectPreview(btn) {
    var pre = btn.closest(".form-status") && btn.closest(".form-status").querySelector(".mail-preview");
    if (!pre) return;
    var r = document.createRange();
    r.selectNodeContents(pre);
    var sel = root.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
  }

  /** Lignes « Libellé : valeur » (les valeurs vides sont omises). */
  function lines(pairs) {
    return pairs.filter(function (p) { return p && p[1] != null && String(p[1]).trim() !== ""; })
      .map(function (p) { return p[0] + " : " + String(p[1]).trim(); }).join("\n");
  }

  var turnstileReady = null;
  function turnstile(form) {
    var box = $("[data-turnstile]", form);
    if (!box || !cfg.turnstileSiteKey || !cfg.formEndpoint) return null;
    if (!turnstileReady) {
      turnstileReady = new Promise(function (resolve) {
        root.onCfsTurnstile = function () { resolve(root.turnstile); };
        var s = document.createElement("script");
        s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onCfsTurnstile";
        s.async = true;
        document.head.appendChild(s);
      });
    }
    turnstileReady.then(function (ts) { box.dataset.widget = ts.render(box, { sitekey: cfg.turnstileSiteKey, language: I.lang() }); });
    return box;
  }
  /** Identifiant de la demande : créé une fois, réutilisé si l'envoi est réessayé, oublié après un succès. */
  function requestId(form) {
    if (!form.dataset.requestId) {
      form.dataset.requestId = root.crypto && root.crypto.randomUUID ? root.crypto.randomUUID()
        : "r" + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
    }
    return form.dataset.requestId;
  }

  /** Erreurs de champs renvoyées par le serveur ({ fields: { email: "invalid" } }) : marquées comme les erreurs locales. */
  function markServerFields(form, fields) {
    var first = null;
    Object.keys(fields || {}).forEach(function (name) {
      var el = form.elements[name];
      if (!el || !el.nodeType) return;
      setError(el, true);
      if (!first) first = el;
    });
    return first;
  }

  function turnstileToken(form) {
    var box = $("[data-turnstile]", form);
    var input = box && box.querySelector('input[name="cf-turnstile-response"]');
    return input ? input.value : "";
  }

  /**
   * Envoie une demande.
   * @param {HTMLFormElement} form
   * @param {{kind: string, payload: object, subject: string, text: string, okTitle: string, okText: string, startedAt: number}} o
   */
  function deliver(form, o) {
    var box = $("[data-status]", form.parentElement) || $("[data-status]");
    var btn = $('button[type="submit"]', form);
    // Robot : champ piège rempli ou formulaire envoyé trop vite → on fait comme si tout allait bien, sans rien envoyer.
    var hp = form.elements.website;
    if ((hp && hp.value) || Date.now() - o.startedAt < 800) {
      form.hidden = true;
      showStatus(box, "ok", o.okTitle, "<p>" + esc(o.okText.replace("{ref}", "—")) + "</p>");
      return Promise.resolve(false);
    }

    if (!cfg.formEndpoint) {
      var url = mailtoUrl(o.subject, o.text);
      form.hidden = true;
      showStatus(box, "info", t("form.mail_title"),
        "<p>" + esc(t("form.mail_text", { email: recipient() })) + "</p>" +
        '<div class="btn-row"><a class="btn btn--signal" href="' + esc(url) + '">' + (cat.icons && cat.icons.mail || "") + " " + esc(t("form.mail_open")) + "</a>" +
        '<button class="btn btn--contour" type="button" data-mail-copy>' + esc(t("form.mail_copy")) + "</button>" +
        '<button class="btn btn--contour" type="button" data-mail-edit>' + esc(t("form.mail_edit")) + "</button></div>" +
        '<p class="hint mail-hint">' + esc(t("form.mail_fallback", { email: recipient() })) + "</p>" +
        '<pre class="mail-preview" tabindex="0">' + esc(t("form.mail_subject_label") + " : " + o.subject + "\n\n" + o.text) + "</pre>");
      $("[data-mail-copy]", box).addEventListener("click", function (e) { copy(t("form.mail_subject_label") + " : " + o.subject + "\n\n" + o.text, e.currentTarget); });
      $("[data-mail-edit]", box).addEventListener("click", function () { form.hidden = false; box.className = "form-status"; box.innerHTML = ""; btn && btn.focus(); });
      api.openMail(url);
      return Promise.resolve(true);
    }

    var label = btn ? btn.innerHTML : "";
    if (btn) { btn.disabled = true; btn.textContent = t("form.sending"); }
    var payload = Object.assign({ form: o.kind, requestId: requestId(form), lang: I.lang(), page: location.pathname, website: "", elapsedMs: Date.now() - o.startedAt }, o.payload);
    var token = turnstileToken(form);
    if (token) payload.turnstileToken = token;
    return root.fetch(cfg.formEndpoint, api.postInit(payload)).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (data.ok !== true) throw { code: res.status === 429 ? "rate" : "error", message: data.message, fields: data.fields };
        delete form.dataset.requestId;
        form.hidden = true;
        showStatus(box, "ok", o.okTitle, "<p>" + esc(o.okText.replace("{ref}", data.reference || "—")) + "</p>");
        return true;
      });
    }).catch(function (err) {
      var msg = err && err.message ? err.message : err && err.code === "rate" ? t("form.rate_limited") : t("form.error_text");
      showStatus(box, "err", t("form.error_title"), "<p>" + esc(msg) + "</p>");
      var bad = err && err.fields ? markServerFields(form, err.fields) : null;
      if (bad) bad.focus();
      if (root.turnstile && $("[data-turnstile]", form) && $("[data-turnstile]", form).dataset.widget) root.turnstile.reset($("[data-turnstile]", form).dataset.widget);
      return false;
    }).then(function (r) {
      if (btn) { btn.disabled = false; btn.innerHTML = label; }
      return r;
    });
  }

  function optionText(select) {
    var o = select && select.selectedOptions && select.selectedOptions[0];
    return o && o.value ? o.textContent.trim() : "";
  }

  /* ---------- Formulaire de contact / devis / salle / « me prévenir » ---------- */
  function contactForm(form) {
    var startedAt = Date.now();
    var q = new URLSearchParams(location.search);
    var type = form.elements.form, training = form.elements.training;
    if (q.get("type") && type && $$("option", type).some(function (o) { return o.value === q.get("type"); })) type.value = q.get("type");
    if (q.get("formation") && training && $$("option", training).some(function (o) { return o.value === q.get("formation"); })) training.value = q.get("formation");
    // Liste d'attente d'une session complète : la session voyage avec la demande « Être prévenu »
    var session = /^[a-z0-9][a-z0-9-]{2,79}$/.test(q.get("session") || "") ? q.get("session") : "";
    liveCheck(form);
    turnstile(form);

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!validate(form)) return;
      var el = form.elements;
      var typeLabel = optionText(type), trainingLabel = optionText(training);
      var subject = t("form.mail_subject", { type: typeLabel }) + (trainingLabel ? " – " + trainingLabel : "");
      var text = lines([
        [t("form.type"), typeLabel],
        [t("form.training"), trainingLabel]
      ]) + (el.message.value.trim() ? "\n\n" + t("form.message") + " :\n" + el.message.value.trim() : "") + "\n\n" + lines([
        [t("form.name"), el.name.value],
        [t("form.email"), el.email.value],
        [t("form.phone"), el.phone.value],
        [t("form.company"), el.company.value]
      ]) + "\n\n— " + t("form.mail_footer", { url: pageUrl() });
      deliver(form, {
        kind: "contact", startedAt: startedAt, subject: subject, text: text,
        okTitle: t("form.sent_title"), okText: t("form.sent_text"),
        payload: {
          form: type.value, training: training.value, sessionId: session, message: el.message.value.trim(), name: el.name.value.trim(),
          email: el.email.value.trim(), phone: el.phone.value.trim(), company: el.company.value.trim(), consent: el.consent.checked
        }
      });
    });
  }

  var api = root.CfsForms = { validate: validate, check: check, liveCheck: liveCheck, showStatus: showStatus, deliver: deliver, lines: lines,
    optionText: optionText, pageUrl: pageUrl, turnstile: turnstile, turnstileToken: turnstileToken, requestId: requestId, markServerFields: markServerFields,
    /** Ouvre la messagerie du visiteur (remplaçable dans les tests). */
    openMail: function (url) { root.location.href = url; },
    /** Requête d'envoi : JSON pour le Worker ; text/plain sans cookie pour la feuille Google en direct (requête
        « simple », sans pré-vérification CORS, que l'application Web Google ne traite pas). */
    postInit: function (payload) {
      return cfg.direct
        ? { method: "POST", credentials: "omit", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload) }
        : { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(payload) };
    } };

  $$('form[data-api-form="contact"]').forEach(contactForm);
})(typeof self !== "undefined" ? self : this);
