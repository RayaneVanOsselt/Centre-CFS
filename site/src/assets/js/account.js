/* =========================================================================
   Centre CFS — espace client (/compte/) et page admin (/compte/admin/).

   Réservations : lues dans la feuille par le Worker (GET /api/account/reservations, jeton vérifié) ; les réservations
   faites sans compte avec la même adresse vérifiée y apparaissent aussi. Profil, société, certificats : Supabase,
   protégés par la RLS (un compte ne voit que ses données). Export et suppression : Worker.
   ========================================================================= */
(function (root) {
  "use strict";
  var I = root.CfsI18n, F = root.CfsForms, A = root.CfsAuth, cat = root.CFS_CATALOG || {};
  if (!I || !F || !A || !root.document) return;
  var t = I.t, esc = I.esc;
  var $ = function (sel, r) { return (r || document).querySelector(sel); };
  var $$ = function (sel, r) { return Array.prototype.slice.call((r || document).querySelectorAll(sel)); };
  var sb = A.client;
  var page = $("[data-account]"), adminBox = $("[data-admin]");
  if (!page && !adminBox) return;

  function gate(msg) {
    var g = $("[data-account-gate]");
    if (g) g.innerHTML = '<p class="lead center acc-gate">' + esc(msg) + "</p>";
  }
  if (!sb) { gate(t("acc.unavailable")); return; }

  var FORM = {};
  (cat.formations || []).forEach(function (f) { FORM[f.id] = f; });
  function fdate(iso) {
    if (!iso) return "";
    var p = String(iso).slice(0, 10).split("-").map(Number);
    return new Date(p[0], p[1] - 1, p[2]).toLocaleDateString(I.locale(), { day: "numeric", month: "long", year: "numeric" });
  }

  /* ---------- Onglets (clavier : flèches, Début, Fin) ---------- */
  function tabs() {
    var list = $$(".acc-tab");
    function select(b, focus) {
      list.forEach(function (x) {
        var on = x === b;
        x.setAttribute("aria-selected", String(on));
        x.tabIndex = on ? 0 : -1;
        $("#" + x.getAttribute("aria-controls")).hidden = !on;
      });
      if (focus) b.focus();
      try { root.history.replaceState(null, "", "#" + b.getAttribute("data-tab")); } catch (e) { /* sans importance */ }
    }
    list.forEach(function (b, i) {
      b.addEventListener("click", function () { select(b); });
      b.addEventListener("keydown", function (e) {
        var k = e.key, n = list.length, j = null;
        if (k === "ArrowDown" || k === "ArrowRight") j = (i + 1) % n;
        else if (k === "ArrowUp" || k === "ArrowLeft") j = (i - 1 + n) % n;
        else if (k === "Home") j = 0;
        else if (k === "End") j = n - 1;
        if (j !== null) { e.preventDefault(); select(list[j], true); }
      });
    });
    var wanted = list.filter(function (b) { return "#" + b.getAttribute("data-tab") === root.location.hash; })[0];
    if (wanted) select(wanted);
  }

  /* ---------- Réservations (feuille, via le Worker) ---------- */
  var STATUS = { confirmed: "acc.status_confirmed", pending_payment: "acc.status_pending_payment", pending_invoice: "acc.status_pending_invoice",
    request: "acc.status_request", cancelled: "acc.status_cancelled", expired: "acc.status_expired" };
  function bookings() {
    var box = $("[data-bookings]");
    A.api("/api/account/reservations").then(function (r) { return r.json(); }).then(function (d) {
      if (!d.ok) throw d;
      if (!d.reservations.length) { box.innerHTML = '<p class="muted">' + esc(t("acc.bookings_empty")) + "</p>"; return; }
      box.innerHTML = '<ul class="acc-list">' + d.reservations.map(function (b) {
        var items = (b.items || []).map(function (it) {
          var f = FORM[it.training];
          return "<li><strong>" + esc(f ? f.title : it.trainingName || it.training) + "</strong>" + (it.date ? " · " + esc(fdate(it.date)) : "") +
            " · " + esc(String(it.seats)) + ' <span class="seat-pill seat-pill--' + (it.status === "confirmed" ? "open" : it.status === "cancelled" || it.status === "expired" ? "closed" : "low") + '">' +
            esc(t(STATUS[it.status] || "acc.status_request")) + "</span></li>";
        }).join("");
        var people = (b.participants || []).map(function (p) { return esc((p.firstName + " " + p.lastName).trim()); }).join(", ");
        return '<li class="acc-item"><p class="acc-item__ref">' + esc(t("acc.booking_ref")) + " <b>" + esc(b.ref) + "</b>" +
          (b.amountInclCents ? " · " + esc(I.cents(b.amountInclCents)) : "") + "</p><ul>" + items + "</ul>" + (people ? '<p class="muted">' + people + "</p>" : "") + "</li>";
      }).join("") + "</ul>";
    }).catch(function () {
      box.innerHTML = '<p class="notice">' + esc(t("form.error_text")) + "</p>";
    });
  }

  /* ---------- Certificats (Supabase, fichiers privés, liens de 5 minutes) ---------- */
  function certificates(userId) {
    var box = $("[data-certificates]");
    sb.from("certificates").select("id,participant_name,formation_slug,reservation_ref,issued_on,valid_until,file_path,company_id")
      .order("valid_until", { ascending: true }).then(function (r) {
        if (r.error) throw r.error;
        var mine = r.data || [];
        if (!mine.length) { box.innerHTML = '<p class="muted">' + esc(t("acc.certificates_empty")) + "</p>"; return; }
        var soon = Date.now() + 180 * 86400000;
        box.innerHTML = '<ul class="acc-list">' + mine.map(function (c) {
          var f = FORM[c.formation_slug], until = c.valid_until ? new Date(c.valid_until).getTime() : null;
          var state = until && until < Date.now() ? "acc.cert_expired" : until && until < soon ? "acc.cert_soon" : "";
          return '<li class="acc-item"><p><strong>' + esc(f ? f.title : c.formation_slug) + "</strong> · " + esc(c.participant_name) + "</p>" +
            '<p class="muted">' + (c.valid_until ? esc(t("acc.cert_valid_until", { date: fdate(c.valid_until) })) : "") +
            (state ? ' <span class="seat-pill seat-pill--' + (state === "acc.cert_expired" ? "full" : "low") + '">' + esc(t(state)) + "</span>" : "") + "</p>" +
            (c.file_path ? '<button class="btn btn--contour btn--petit" type="button" data-cert="' + esc(c.file_path) + '">' + esc(t("acc.cert_download")) + "</button>" : "") + "</li>";
        }).join("") + "</ul>";
        $$("[data-cert]", box).forEach(function (b) {
          b.addEventListener("click", function () {
            sb.storage.from("certificates").createSignedUrl(b.getAttribute("data-cert"), 300).then(function (s) {
              if (s.error) throw s.error;
              root.location.href = s.data.signedUrl;
            }).catch(function () { A.status("err", t("form.error_title"), t("form.error_text")); });
          });
        });
      }).catch(function () { box.innerHTML = '<p class="notice">' + esc(t("form.error_text")) + "</p>"; });
  }

  /* ---------- Profil ---------- */
  function profile(user) {
    var form = $("[data-profile-form]");
    F.liveCheck(form);
    sb.from("profiles").select("*").eq("id", user.id).maybeSingle().then(function (r) {
      var p = (r && r.data) || {};
      form.elements.first_name.value = p.first_name || "";
      form.elements.last_name.value = p.last_name || "";
      form.elements.phone.value = p.phone || "";
      form.elements.locale.value = p.locale || I.lang();
      form.elements.marketing_consent.checked = !!p.marketing_consent;
      $$('input[name="account_type"]', form).forEach(function (x) { x.checked = x.value === (p.account_type || "individual"); });
      if (p.first_name) $("[data-acc-hello]").textContent = t("acc.hello", { name: p.first_name });
    });
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!F.validate(form)) return;
      var type = $('input[name="account_type"]:checked', form);
      sb.from("profiles").upsert({
        id: user.id, first_name: form.elements.first_name.value.trim(), last_name: form.elements.last_name.value.trim(),
        phone: form.elements.phone.value.trim() || null, locale: form.elements.locale.value, marketing_consent: form.elements.marketing_consent.checked,
        account_type: type ? type.value : "individual"
      }).then(function (r) {
        if (r.error) throw r.error;
        A.status("ok", t("acc.saved"), "");
      }).catch(function () { A.status("err", t("form.error_title"), t("form.error_text")); });
    });
  }

  /* ---------- Société (gestionnaire d'entreprise) ---------- */
  function company(user) {
    var form = $("[data-company-form]"), extra = $("[data-company-extra]");
    F.liveCheck(form);
    sb.from("company_members").select("role, companies(id,name,vat_number,billing_street,billing_zip,billing_city,billing_country)").eq("user_id", user.id).then(function (r) {
      var m = r.data && r.data[0];
      if (!m || !m.companies) return;
      var c = m.companies;
      form.hidden = true;
      extra.hidden = false;
      extra.insertAdjacentHTML("afterbegin", "<p><strong>" + esc(c.name) + "</strong> · " + esc(c.vat_number || "") + "<br>" +
        esc([c.billing_street, (c.billing_zip || "") + " " + (c.billing_city || ""), c.billing_country].filter(Boolean).join(", ")) + "</p>");
      sb.from("company_members").select("user_id, role").eq("company_id", c.id).then(function (mm) {
        $("[data-company-members]").innerHTML = (mm.data || []).map(function (x) {
          return "<li>" + esc(x.user_id === user.id ? user.email : x.user_id.slice(0, 8) + "…") + " · " + esc(x.role) + "</li>";
        }).join("");
      });
      sb.from("certificates").select("participant_name,formation_slug,valid_until").eq("company_id", c.id).order("valid_until").then(function (cc) {
        var list = cc.data || [];
        var names = {};
        list.forEach(function (x) { names[x.participant_name] = true; });
        $("[data-company-workers]").innerHTML = Object.keys(names).length
          ? '<ul class="plain-list">' + Object.keys(names).sort().map(function (n) { return "<li>" + esc(n) + "</li>"; }).join("") + "</ul>"
          : '<p class="muted">' + esc(t("acc.certificates_empty")) + "</p>";
        var soon = Date.now() + 180 * 86400000;
        var due = list.filter(function (x) { return x.valid_until && new Date(x.valid_until).getTime() < soon; });
        $("[data-company-deadlines]").innerHTML = due.length
          ? '<ul class="plain-list">' + due.map(function (x) { var f = FORM[x.formation_slug]; return "<li>" + esc(x.participant_name) + " · " + esc(f ? f.title : x.formation_slug) + " · " + esc(fdate(x.valid_until)) + "</li>"; }).join("") + "</ul>"
          : '<p class="muted">—</p>';
      });
      if (m.role !== "owner") $("[data-invite-form]").hidden = true;
    });
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!F.validate(form)) return;
      sb.rpc("create_company", {
        p_name: form.elements.c_name.value.trim(), p_vat: root.CfsVat ? root.CfsVat.format(form.elements.c_vat.value) : form.elements.c_vat.value.trim(),
        p_street: form.elements.c_street.value.trim(), p_zip: form.elements.c_zip.value.trim(), p_city: form.elements.c_city.value.trim(),
        p_country: form.elements.c_country.value.trim() || "BE"
      }).then(function (r) {
        if (r.error) throw r.error;
        A.status("ok", t("acc.saved"), "");
        root.setTimeout(function () { root.location.reload(); }, 800);
      }).catch(function (err) { A.status("err", t("form.error_title"), /vat|23514|23505/i.test(String(err.code || err.message)) ? t("form.error_vat") : t("form.error_text")); });
    });
    var invite = $("[data-invite-form]");
    invite.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!F.validate(invite)) return;
      A.api("/api/account/company/invite", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: invite.elements.invite_email.value.trim(), lang: I.lang() }) })
        .then(function (r) { return r.json(); })
        .then(function (d) { if (!d.ok) throw d; invite.reset(); A.status("ok", t("acc.company_invite_sent"), ""); })
        .catch(function (d) { A.status("err", t("form.error_title"), (d && d.message) || t("form.error_text")); });
    });
  }

  /* ---------- Sécurité : double authentification (TOTP) et mot de passe ---------- */
  function security(aal) {
    var box = $("[data-mfa]");
    sb.auth.mfa.listFactors().then(function (r) {
      var on = r.data && r.data.totp && r.data.totp.filter(function (f) { return f.status === "verified"; })[0];
      if (on) {
        box.innerHTML = '<p class="ok-text">' + esc(t("acc.mfa_on")) + '</p><button class="btn btn--contour btn--petit" type="button" data-mfa-off>' + esc(t("acc.mfa_disable")) + "</button>";
        $("[data-mfa-off]", box).addEventListener("click", function () {
          sb.auth.mfa.unenroll({ factorId: on.id }).then(function (u) { if (u.error) throw u.error; root.location.reload(); })
            .catch(function () { A.status("err", t("form.error_title"), t("acc.reauth")); });
        });
        return;
      }
      box.innerHTML = '<button class="btn btn--bleu btn--petit" type="button" data-mfa-on>' + esc(t("acc.mfa_enable")) + "</button>";
      $("[data-mfa-on]", box).addEventListener("click", function () {
        sb.auth.mfa.enroll({ factorType: "totp", friendlyName: "Centre CFS" }).then(function (en) {
          if (en.error) throw en.error;
          var id = en.data.id;
          box.innerHTML = "<p>" + esc(t("acc.mfa_scan")) + '</p><img class="mfa-qr" alt="QR code" width="180" height="180" src="' + esc(en.data.totp.qr_code) + '">' +
            "<p>" + esc(t("acc.mfa_secret")) + " <code>" + esc(en.data.totp.secret) + "</code></p>" +
            '<form class="form form--inline" data-mfa-verify novalidate><div class="field"><label for="mfa-new">' + esc(t("acc.mfa_code")) + '</label><input id="mfa-new" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required></div><button class="btn btn--bleu" type="submit">' + esc(t("acc.mfa_verify")) + "</button></form>";
          $("[data-mfa-verify]", box).addEventListener("submit", function (e) {
            e.preventDefault();
            sb.auth.mfa.challengeAndVerify({ factorId: id, code: e.target.elements.code.value.trim() }).then(function (v) {
              if (v.error) throw v.error;
              root.location.reload();
            }).catch(function (err) { A.status("err", t("form.error_title"), A.errorText(err)); });
          });
        }).catch(function (err) { A.status("err", t("form.error_title"), A.errorText(err)); });
      });
    });
    var pw = $("[data-password-form]");
    pw.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!F.validate(pw) || A.strength(pw.elements.new_password.value) < 2) return;
      sb.auth.updateUser({ password: pw.elements.new_password.value }).then(function (r) {
        if (r.error) throw r.error;
        pw.reset();
        A.status("ok", t("acc.password_updated"), "");
      }).catch(function (err) { A.status("err", t("form.error_title"), /reauth|recent/i.test(String(err.message)) ? t("acc.reauth") : A.errorText(err)); });
    });
  }

  /* ---------- Mes données : export et suppression ---------- */
  function data(user) {
    $("[data-export]").addEventListener("click", function () {
      A.api("/api/account/export").then(function (r) {
        if (!r.ok) throw r;
        return r.blob();
      }).then(function (blob) {
        var a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "centre-cfs-mes-donnees.json";
        document.body.appendChild(a);
        a.click();
        root.setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      }).catch(function () { A.status("err", t("form.error_title"), t("form.error_text")); });
    });
    var del = $("[data-delete-form]");
    F.liveCheck(del);
    del.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!F.validate(del)) return;
      if (del.elements.confirm_email.value.trim().toLowerCase() !== String(user.email).toLowerCase()) {
        F.markServerFields(del, { confirm_email: "invalid" });
        del.elements.confirm_email.focus();
        return;
      }
      A.api("/api/account/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmEmail: del.elements.confirm_email.value.trim() }) })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (!d.ok) throw d;
          return sb.auth.signOut().then(function () {
            page.hidden = true;
            gate(t("acc.deleted"));
          });
        })
        .catch(function () { A.status("err", t("form.error_title"), t("form.error_text")); });
    });
  }

  /* ---------- Page admin : dépôt d'un certificat (rôle SQL + double authentification) ---------- */
  function admin(aal) {
    var form = $("[data-cert-form]");
    var ok = aal && aal.currentLevel === "aal2";
    sb.auth.getUser().then(function (u) {
      var role = u.data && u.data.user && u.data.user.app_metadata && u.data.user.app_metadata.role;
      if (role !== "admin" || !ok) { $("[data-admin-forbidden]").hidden = false; return; }
      adminBox.hidden = false;
      F.liveCheck(form);
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        if (!F.validate(form)) return;
        var file = form.elements.file.files[0];
        if (!file || file.type !== "application/pdf" || file.size > 5 * 1024 * 1024) { F.markServerFields(form, { file: "invalid" }); return; }
        sb.rpc("admin_find_user", { p_email: form.elements.user_email.value.trim() }).then(function (r) {
          if (r.error || !r.data) throw r.error || { message: "not found" };
          var uid = r.data, path = uid + "/" + Date.now().toString(36) + "-" + form.elements.formation_slug.value + ".pdf";
          return sb.storage.from("certificates").upload(path, file, { contentType: "application/pdf", upsert: false }).then(function (up) {
            if (up.error) throw up.error;
            return sb.from("certificates").insert({
              user_id: uid, participant_name: form.elements.participant.value.trim(), formation_slug: form.elements.formation_slug.value,
              reservation_ref: form.elements.reservation_ref.value.trim() || null, issued_on: form.elements.issued_on.value,
              valid_until: form.elements.valid_until.value || null, file_path: path
            });
          });
        }).then(function (ins) {
          if (ins && ins.error) throw ins.error;
          form.reset();
          A.status("ok", t("acc.saved"), "");
        }).catch(function () { A.status("err", t("form.error_title"), t("form.error_text")); });
      });
    });
  }

  /* ---------- Démarrage : sans session, retour à la connexion ---------- */
  A.session().then(function (s) {
    if (!s) { root.location.replace(A.route("connexion")); return; }
    return sb.auth.mfa.getAuthenticatorAssuranceLevel().then(function (r) {
      var aal = r && r.data;
      if (adminBox) { admin(aal); return; }
      var user = s.user;
      $("[data-acc-email]").textContent = user.email;
      var role = user.app_metadata && user.app_metadata.role;
      if (role === "admin" && (!aal || aal.currentLevel !== "aal2")) $("[data-mfa-admin]").hidden = false;
      var g = $("[data-account-gate]");
      if (g) g.hidden = true;
      page.hidden = false;
      tabs();
      // Invitations d'une entreprise envoyées à cette adresse (vérifiée) : acceptées à la première connexion
      sb.rpc("accept_company_invitations").then(function () { company(user); }, function () { company(user); });
      bookings();
      certificates(user.id);
      profile(user);
      security(aal);
      data(user);
    });
  });
})(typeof self !== "undefined" ? self : this);
