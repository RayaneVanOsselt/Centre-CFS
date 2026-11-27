/* =========================================================================
   Centre CFS — connexion (Supabase Auth, flux PKCE) : pages Connexion, Créer un compte, Mot de passe oublié,
   Confirmation, et outils partagés avec l'espace client (window.CfsAuth).

   Les mots de passe ne passent QUE par Supabase Auth (jamais par nos serveurs). supabase-js n'est chargé que sur
   les pages compte. Les appels à notre API (/api/account/…) portent le jeton d'accès : le Worker le vérifie (JWKS).
   ========================================================================= */
(function (root) {
  "use strict";
  var I = root.CfsI18n, F = root.CfsForms, cfg = root.CFS_CONFIG || {}, cat = root.CFS_CATALOG || {};
  if (!I || !root.document) return;
  var t = I.t, esc = I.esc;
  var $ = function (sel, r) { return (r || document).querySelector(sel); };
  var $$ = function (sel, r) { return Array.prototype.slice.call((r || document).querySelectorAll(sel)); };
  var route = function (k) { return (cat.routes && cat.routes[k]) || "/"; };

  var client = null;
  try {
    if (root.supabase && cfg.supabaseUrl && cfg.supabaseKey) {
      client = root.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
        auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
    }
  } catch (e) {
    client = null;
  }

  function unavailable() {
    $$("[data-auth-unavailable]").forEach(function (el) { el.hidden = false; });
    $$("form[data-auth]").forEach(function (f) { $$("button, input", f).forEach(function (el) { el.disabled = true; }); });
  }
  if (!client) { unavailable(); }

  function status(kind, title, text) {
    var box = $("[data-status]");
    if (F && box) F.showStatus(box, kind, title, text ? "<p>" + esc(text) + "</p>" : "");
  }

  /** Traduit une erreur Supabase en message clair (jamais le détail technique). */
  function errorText(err) {
    var m = String((err && (err.code || err.message)) || "").toLowerCase();
    if (/invalid.*(credentials|login)|invalid_credentials/.test(m)) return t("acc.error_credentials");
    if (/not.*confirmed|email_not_confirmed/.test(m)) return t("acc.error_not_confirmed");
    if (/weak|password.*(short|length|characters)/.test(m)) return t("acc.error_weak");
    if (/already|exists|registered/.test(m)) return t("acc.error_exists");
    if (/expired|invalid.*(token|link|otp)|otp_expired/.test(m)) return t("acc.error_link");
    if (/captcha/.test(m)) return t("form.captcha_error");
    if (/rate|too many/.test(m)) return t("form.rate_limited");
    return t("form.error_text");
  }

  function captcha(form) {
    var token = F && F.turnstileToken ? F.turnstileToken(form) : "";
    return token ? { captchaToken: token } : {};
  }

  /** Adresse absolue d'une page du site (retour des liens envoyés par e-mail). */
  function absolute(key) { return root.location.origin + route(key); }

  /** Session courante (ou null). */
  function session() {
    if (!client) return Promise.resolve(null);
    return client.auth.getSession().then(function (r) { return (r && r.data && r.data.session) || null; }).catch(function () { return null; });
  }

  /** Appel à notre API avec le jeton d'accès (jamais une clé). */
  function api(path, init) {
    return session().then(function (s) {
      if (!s) return Promise.reject({ code: "UNAUTHORIZED" });
      init = init || {};
      var headers = Object.assign({ Accept: "application/json" }, init.headers || {}, { Authorization: "Bearer " + s.access_token });
      return root.fetch(path, Object.assign({}, init, { headers: headers, credentials: "same-origin" }));
    });
  }

  /* ---------- Indicateur de robustesse et affichage du mot de passe ---------- */
  function strength(pw) {
    var s = 0;
    if (pw.length >= 10) s++;
    if (pw.length >= 14) s++;
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
    if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s++;
    if (pw.length < 10) s = Math.min(s, 1);
    return Math.min(4, s);
  }
  $$("[data-pw-toggle]").forEach(function (b) {
    b.addEventListener("click", function () {
      var input = b.parentElement.querySelector("input");
      var show = input.type === "password";
      input.type = show ? "text" : "password";
      b.setAttribute("aria-pressed", String(show));
    });
  });
  $$("[data-pw-meter]").forEach(function (m) {
    var input = m.parentElement.querySelector("input");
    input.addEventListener("input", function () {
      var s = strength(input.value);
      m.setAttribute("data-level", String(s));
      $("[data-pw-label]", m).textContent = t("acc.strength_" + s);
    });
  });

  /* ---------- Formulaires ---------- */
  function busy(form, on) { $$('button[type="submit"]', form).forEach(function (b) { b.disabled = on; }); }

  function onLogin(form) {
    var mfaField = $("[data-mfa-field]", form), factor = null;
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!client || !F.validate(form)) return;
      busy(form, true);
      var step = factor
        ? client.auth.mfa.challengeAndVerify({ factorId: factor.id, code: form.elements.mfa.value.trim() })
        : client.auth.signInWithPassword(Object.assign({ email: form.elements.email.value.trim(), password: form.elements.password.value }, { options: captcha(form) }));
      step.then(function (r) {
        if (r.error) throw r.error;
        return client.auth.mfa.getAuthenticatorAssuranceLevel();
      }).then(function (r) {
        var a = r && r.data;
        if (a && a.nextLevel === "aal2" && a.currentLevel !== "aal2") {
          return client.auth.mfa.listFactors().then(function (f) {
            factor = f.data && f.data.totp && f.data.totp[0];
            mfaField.hidden = false;
            form.elements.mfa.required = true;
            form.elements.mfa.focus();
          });
        }
        root.location.href = route("compte");
      }).catch(function (err) {
        status("err", t("form.error_title"), errorText(err));
      }).then(function () { busy(form, false); });
    });
    var magic = $("[data-auth-magic]", form);
    if (magic) magic.addEventListener("click", function () {
      var email = form.elements.email;
      if (!F.check(email) || !email.value.trim()) { email.focus(); return; }
      client.auth.signInWithOtp({ email: email.value.trim(), options: Object.assign({ emailRedirectTo: absolute("compte"), shouldCreateUser: false }, captcha(form)) })
        .then(function (r) { if (r.error) throw r.error; status("ok", t("acc.magic"), t("acc.magic_sent")); })
        .catch(function (err) { status("err", t("form.error_title"), errorText(err)); });
    });
  }

  function onSignup(form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!client || !F.validate(form)) return;
      if (strength(form.elements.password.value) < 2) {
        form.elements.password.closest(".field").classList.add("has-error");
        form.elements.password.focus();
        return;
      }
      busy(form, true);
      client.auth.signUp({
        email: form.elements.email.value.trim(), password: form.elements.password.value,
        options: Object.assign({
          emailRedirectTo: absolute("confirmation"),
          data: { first_name: form.elements.firstName.value.trim(), last_name: form.elements.lastName.value.trim(), locale: I.lang(), marketing_consent: !!form.elements.newsletter.checked }
        }, captcha(form))
      }).then(function (r) {
        if (r.error) throw r.error;
        form.hidden = true;
        status("ok", t("acc.signup_title"), t("acc.signup_sent"));
      }).catch(function (err) {
        status("err", t("form.error_title"), errorText(err));
      }).then(function () { busy(form, false); });
    });
  }

  function onReset(form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!client || !F.validate(form)) return;
      busy(form, true);
      client.auth.resetPasswordForEmail(form.elements.email.value.trim(), Object.assign({ redirectTo: absolute("confirmation") + "?type=recovery" }, captcha(form)))
        .then(function (r) {
          if (r.error && !/rate/i.test(r.error.message || "")) throw r.error;
          form.hidden = true;
          status("ok", t("acc.reset_title"), t("acc.reset_sent"));    // même message, que le compte existe ou non
        })
        .catch(function (err) { status("err", t("form.error_title"), errorText(err)); })
        .then(function () { busy(form, false); });
    });
  }

  /** Page Confirmation : lien d'inscription, lien magique ou récupération (nouveau mot de passe). */
  function onConfirmPage() {
    var text = $("[data-confirm-text]");
    if (!text) return;
    var q = new URLSearchParams(root.location.search);
    var recovery = q.get("type") === "recovery";
    if (q.get("error_description") || q.get("error")) { text.textContent = t("acc.error_link"); return; }
    if (!client) { text.textContent = t("acc.unavailable"); return; }
    // detectSessionInUrl échange le « code » PKCE contre une session au chargement
    var wait = client.auth.getSession();
    wait.then(function (r) {
      var s = r && r.data && r.data.session;
      if (!s) { text.textContent = t("acc.error_link"); return; }
      if (recovery) {
        text.hidden = true;
        var form = $('form[data-auth="newpassword"]');
        form.hidden = false;
        F.liveCheck(form);
        form.addEventListener("submit", function (e) {
          e.preventDefault();
          if (!F.validate(form) || strength(form.elements.password.value) < 2) return;
          client.auth.updateUser({ password: form.elements.password.value }).then(function (u) {
            if (u.error) throw u.error;
            form.hidden = true;
            status("ok", t("acc.password_updated"), "");
            $("[data-confirm-next]").hidden = false;
          }).catch(function (err) { status("err", t("form.error_title"), errorText(err)); });
        });
      } else {
        text.textContent = t("acc.confirmed");
        $("[data-confirm-next]").hidden = false;
      }
    });
  }

  $$("form[data-auth]").forEach(function (form) {
    if (F) { F.liveCheck(form); F.turnstile(form); }
    var kind = form.getAttribute("data-auth");
    if (kind === "login") onLogin(form);
    else if (kind === "signup") onSignup(form);
    else if (kind === "reset") onReset(form);
  });
  onConfirmPage();

  $$("[data-auth-google]").forEach(function (b) {
    b.addEventListener("click", function () {
      if (client) client.auth.signInWithOAuth({ provider: "google", options: { redirectTo: absolute("compte") } });
    });
  });
  $$("[data-auth-logout]").forEach(function (b) {
    b.addEventListener("click", function () {
      (client ? client.auth.signOut() : Promise.resolve()).then(function () { root.location.href = route("home"); });
    });
  });

  root.CfsAuth = { client: client, session: session, api: api, route: route, status: status, errorText: errorText, strength: strength, unavailable: unavailable };
})(typeof self !== "undefined" ? self : this);
