// @ts-check
/**
 * Panneau de l'assistant (mission 8.8) : dialogue accessible, non modal sur ordinateur, plein écran modal sur
 * téléphone (Échap ferme, focus bouclé puis rendu au lanceur), mention « assistant automatique » avant le premier
 * message, réponses du cœur local (responder.js), puis rédaction par l'IA (Worker POST /api/chat, DECISIONS.md D-016)
 * pour chaque vraie question : l'IA reçoit la réponse locale vérifiée, le fil de la conversation et les sessions, et sa
 * réponse est revalidée ici ; intentions sensibles (sécurité, obligations légales, agrément…) : réponse locale seule.
 * Transmission volontaire de la question à l'équipe (POST /api/contact). Avis « utile / pas utile » anonyme.
 * Texte rendu par textContent uniquement ; liens créés à partir d'adresses validées. Rien n'est gardé après
 * la fermeture de l'onglet (sessionStorage au plus).
 */
import { answer } from "./responder.js";
import { validate } from "./validation.js";
import { detectLang } from "./retrieval.js";
import { loadKb, kbUrlFor } from "./knowledge.js";

const W = /** @type {any} */ (window);
const cfg = W.CFS_CONFIG || {};
const I = W.CfsI18n;
const t = (k, v) => (I ? I.t(k, v) : k);
const lang = (I && I.lang()) || document.documentElement.getAttribute("data-lang") || "fr";
const MAX_TURNS = 20;
const STORE = "cfs-assistant";
/** Intentions à réponse fixe et vérifiée : jamais réécrites par l'IA (sécurité, cadre légal, données non confirmées). */
const FIXED = new Set(["injection", "human", "greeting", "thanks", "offtopic", "contact", "closure", "unconfirmed", "legal", "cheques", "password"]);

let panel = null, launcher = null, log = null, input = null, form = null, kbs = {}, kb = null, turns = 0, history = [];
let sessionsReady = null;

/* ---------------- données ---------------- */

/** Sessions publiées via CfsSessions (chargé à la demande s'il n'est pas déjà sur la page). */
function sessions() {
  if (sessionsReady) return sessionsReady;
  const load = (src) => new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
  const ready = W.CfsSessions ? Promise.resolve() : (cfg.assistant.sessions || []).reduce((p, src) => p.then(() => load(src)), Promise.resolve());
  sessionsReady = ready.then(() => W.CfsSessions.load()).then((res) => ({
    live: res.live,
    list: res.sessions.map((s) => ({ ...s, state: W.CfsSessions.level(s) })),
  })).catch(() => null);
  return sessionsReady;
}

async function kbFor(l) {
  if (!kbs[l]) kbs[l] = await loadKb(l === lang ? cfg.assistant.kb : kbUrlFor(cfg.assistant.kb, lang, l)).catch(() => null);
  return kbs[l];
}

/** Formation de la page en cours (bonus de recherche, suggestions). */
function pageSlug() {
  const el = document.querySelector("[data-sessions-for]");
  return el ? el.getAttribute("data-sessions-for") : null;
}

/* ---------------- interface ---------------- */

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function build() {
  panel = el("section", "chat-panel");
  panel.id = "cfs-assistant";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-labelledby", "chat-title");
  panel.hidden = true;
  const head = el("header", "chat-head");
  const sign = el("span", "chat-sign", "i");
  sign.setAttribute("aria-hidden", "true");
  const titles = el("div", "chat-titles");
  const title = el("h2", "chat-title", t("chat.title"));
  title.id = "chat-title";
  titles.append(title, el("p", "chat-subtitle", t("chat.subtitle")));
  // Nouvelle conversation : icône (flèche circulaire) avec libellé accessible et info-bulle
  const reset = el("button", "chat-icon-btn chat-reset");
  reset.type = "button";
  reset.setAttribute("aria-label", t("chat.reset"));
  reset.title = t("chat.reset");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M20 11a8 8 0 1 0-2.34 5.66M20 4v7h-7");
  svg.append(path);
  reset.append(svg);
  const close = el("button", "chat-icon-btn chat-close", "×");
  close.type = "button";
  close.setAttribute("aria-label", t("chat.close"));
  head.append(sign, titles, reset, close);
  const notice = el("p", "chat-notice", t("chat.ai_notice"));
  log = el("div", "chat-log");
  log.setAttribute("aria-live", "polite");
  log.setAttribute("tabindex", "0");
  log.setAttribute("aria-label", t("chat.title"));
  form = el("form", "chat-form");
  form.noValidate = true;
  const label = el("label", "sr-only", t("chat.placeholder"));
  label.htmlFor = "chat-input";
  input = el("textarea", "chat-input");
  input.id = "chat-input";
  input.rows = 1;
  input.maxLength = 1000;
  input.placeholder = t("chat.placeholder");
  input.setAttribute("enterkeyhint", "send");
  const send = el("button", "btn btn--bleu chat-send", t("chat.send"));
  send.type = "submit";
  form.append(label, input, send);
  const privacy = el("p", "chat-privacy", t("chat.privacy"));
  panel.append(head, notice, log, form, privacy);
  document.body.appendChild(panel);

  close.addEventListener("click", hide);
  reset.addEventListener("click", () => { history = []; turns = 0; save(); log.textContent = ""; greet(); input.focus(); });
  form.addEventListener("submit", (e) => { e.preventDefault(); ask(input.value); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(input.value); }
  });
  panel.addEventListener("keydown", (e) => {
    if (e.key === "Tab" && isModal()) trap(e);
  });
  // Échap ferme le panneau même si le focus est ailleurs (par exemple après un clic sur une suggestion)
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && panel && !panel.hidden) { e.preventDefault(); hide(); }
  });
}

function isModal() { return window.matchMedia("(max-width: 640px)").matches; }

function trap(e) {
  const items = Array.from(panel.querySelectorAll("button, a[href], textarea, input, select, [tabindex='0']")).filter((x) => !x.hasAttribute("disabled") && x.offsetParent !== null);
  if (!items.length) return;
  const first = items[0], last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

function setInert(on) {
  for (const child of Array.from(document.body.children)) {
    if (child !== panel && child.tagName !== "SCRIPT") /** @type {any} */ (child).inert = on;
  }
}

function hide() {
  if (!panel || panel.hidden) return;
  panel.hidden = true;
  panel.removeAttribute("aria-modal");
  setInert(false);
  document.documentElement.classList.remove("chat-open");
  if (launcher) { launcher.setAttribute("aria-expanded", "false"); launcher.focus(); }
}

/** Ajoute un message ; défile seulement si le lecteur était déjà en bas. */
function bubble(who, text) {
  const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
  const b = el("div", "chat-msg chat-msg--" + who);
  const name = el("p", "sr-only", who === "user" ? t("chat.you") : t("chat.bot_name"));
  b.append(name);
  String(text).split("\n\n").forEach((p) => b.append(el("p", "", p)));
  log.append(b);
  if (atBottom) log.scrollTop = log.scrollHeight;
  return b;
}

/** Indicateur « l'assistant écrit… » (trois points animés ; texte lu par les lecteurs d'écran). */
function typing() {
  const b = el("div", "chat-msg chat-msg--bot chat-typing");
  b.append(el("span", "sr-only", t("chat.thinking")));
  for (let i = 0; i < 3; i++) b.append(el("span", "chat-dot"));
  log.append(b);
  log.scrollTop = log.scrollHeight;
  return b;
}

/** Avis anonyme sur la dernière réponse : seul l'événement (intention, oui/non, IA ou non) est émis, jamais le texte. */
function feedback(b, a) {
  for (const old of Array.from(log.querySelectorAll(".chat-feedback"))) old.remove();
  const row = el("div", "chat-feedback");
  row.append(el("span", "", t("chat.feedback_q")));
  const vote = (value) => () => {
    try {
      document.dispatchEvent(new CustomEvent("cfs:analytics", { detail: { event: "assistant_feedback", value, intent: a.meta.intent, ai: !!a.meta.ai } }));
    } catch { /* sans importance */ }
    row.replaceChildren(el("span", "chat-feedback-thanks", t("chat.feedback_thanks")));
  };
  for (const [key, value] of [["chat.feedback_yes", "yes"], ["chat.feedback_no", "no"]]) {
    const btn = el("button", "chat-feedback-btn", t(key));
    btn.type = "button";
    btn.addEventListener("click", vote(value));
    row.append(btn);
  }
  b.append(row);
}

function renderAnswer(a) {
  const b = bubble("bot", a.message);
  if (a.meta && a.meta.ai) b.classList.add("chat-msg--ai");
  if (a.cards && a.cards.length) {
    const ul = el("ul", "chat-cards");
    for (const c of a.cards) {
      const li = el("li", "chat-card chat-card--" + c.type);
      const link = el("a", "", c.title);
      link.href = c.url;            // adresse déjà validée (liste blanche du site)
      li.append(link);
      ul.append(li);
    }
    b.append(ul);
  }
  if (a.sources && a.sources.length) {
    const p = el("p", "chat-source");
    p.append(document.createTextNode(t("chat.source") + (lang === "fr" ? " : " : ": ")));
    a.sources.slice(0, 2).forEach((s, i) => {
      if (i) p.append(document.createTextNode(" · "));
      const l = el("a", "", s.title);
      l.href = s.url;
      p.append(l);
    });
    b.append(p);
  }
  // Mention de transparence sous chaque réponse rédigée par l'IA
  if (a.meta && a.meta.ai) b.append(el("p", "chat-ai-label", t("chat.ai_label")));
  // Transmission à l'équipe : seulement avec le Worker (sinon la carte « Nous contacter » suffit)
  if (a.meta && a.meta.transmit && cfg.formEndpoint) b.append(transmitButton());
  if (a.meta && !FIXED.has(a.meta.intent)) feedback(b, a);
  if (a.suggestions && a.suggestions.length) suggestions(a.suggestions);
}

function suggestions(list) {
  const old = log.querySelector(".chat-suggest");
  if (old) old.remove();
  const box = el("div", "chat-suggest");
  box.setAttribute("aria-label", t("chat.related"));
  list.forEach((s) => {
    const b = el("button", "chat-chip", s);
    b.type = "button";
    b.addEventListener("click", () => ask(s));
    box.append(b);
  });
  log.append(box);
}

function greet() {
  bubble("bot", t("chat.hello"));
  const slug = pageSlug();
  const f = slug && kb ? kb.entries.find((e) => e.slug === slug) : null;
  suggestions(f ? [t("chat.s_price"), t("chat.s_next"), t("chat.s_exam"), t("chat.s_bring")].map((s) => `${s} (${f.title})`)
    : [t("chat.quick_vca"), t("chat.quick_ba4"), t("chat.quick_intra"), t("chat.quick_room")]);
}

/* ---------------- questions et réponses ---------------- */

async function ask(raw) {
  const q = String(raw || "").trim();
  if (!q) return;
  if (q.length > 1000) { bubble("bot", t("chat.too_long")); return; }
  if (turns >= MAX_TURNS) { bubble("bot", t("chat.limit")); return; }
  turns++;
  input.value = "";
  input.focus();
  const old = log.querySelector(".chat-suggest");
  if (old) old.remove();
  bubble("user", q);
  const wait = typing();
  try {
    const l = detectLang(q, lang);
    if (l !== lang) await kbFor(l);
    const ses = await sessions();
    const slug = pageSlug();
    let a = answer(kb, q, { lang, slug, sessions: ses ? ses.list : null, live: ses ? ses.live : false, kbFor: (x) => kbs[x] || null });
    // L'IA rédige chaque vraie question à partir de la réponse vérifiée ; en cas d'échec, la réponse locale reste
    if (cfg.assistant.ai && !FIXED.has(a.meta.intent)) a = (await viaAi(q, a, ses)) || a;
    wait.remove();
    renderAnswer(a);
    history.push({ q, a: a.message });
    save();
  } catch (e) {
    wait.remove();
    bubble("bot", t("chat.fallback"));
  }
}

/** Jeton Turnstile (anti-robots) pour un appel à la couche IA, si une clé de site est configurée ; "" sinon. */
async function turnstileToken() {
  if (!cfg.turnstileSiteKey) return "";
  if (!W.turnstile) {
    await new Promise((resolve, reject) => {
      W.onCfsChatTurnstile = resolve;
      const s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onCfsChatTurnstile";
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  return new Promise((resolve) => {
    const box = el("div", "chat-turnstile");
    form.before(box);
    const done = (tok) => { resolve(tok || ""); setTimeout(() => box.remove(), 0); };
    W.turnstile.render(box, { sitekey: cfg.turnstileSiteKey, language: lang, callback: done, "error-callback": () => done(""), "timeout-callback": () => done("") });
  });
}

/**
 * Rédaction par l'IA (Worker) : elle reçoit la question, la réponse locale vérifiée (brouillon), la formation reconnue,
 * le fil de la conversation et les sessions publiques ; sa réponse est revalidée ici (liens, montants, longueur).
 * Les fiches, sources et suggestions vérifiées de la réponse locale sont gardées si l'IA n'en propose pas.
 */
async function viaAi(q, local, ses) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const base = kbs[local.meta.lang] || kb;
    const turnstile = await turnstileToken().catch(() => "");
    const r = await fetch("/api/chat", {
      method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", signal: ctrl.signal,
      body: JSON.stringify({ question: q, lang: local.meta.lang, turnstileToken: turnstile,
        formation: local.meta.formation || "", draft: local.message,
        history: history.slice(-6).map((h) => ({ q: String(h.q).slice(0, 600), a: String(h.a).slice(0, 900) })),
        sessions: ses ? ses.list.filter((s) => !local.meta.formation || s.training === local.meta.formation).slice(0, 3)
          .map((s) => ({ date: s.date, endDate: s.endDate, startTime: s.startTime, endTime: s.endTime, location: s.location, seatsLeft: ses.live ? s.seatsLeft : null, capacity: s.capacity, bookUrl: base.routes.inscription + "?formation=" + s.training + "&session=" + s.id })) : [] }),
    });
    const d = await r.json();
    if (!d.ok || !d.answer) return null;
    const meta = { ...local.meta, ai: true, provider: (d.answer.meta && d.answer.meta.provider) || "", confidence: "medium" };
    const v = validate({ ...d.answer, meta }, base);
    if (!v) return null;
    return {
      ...v,
      cards: v.cards.length ? v.cards : local.cards,
      sources: v.sources.length ? v.sources : local.sources,
      suggestions: v.suggestions.length ? v.suggestions : local.suggestions,
      meta: { ...meta, transmit: local.meta.transmit },
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/* ---------------- transmettre à l'équipe ---------------- */

function transmitButton() {
  const b = el("button", "btn btn--contour btn--petit chat-transmit", t("chat.transmit"));
  b.type = "button";
  b.addEventListener("click", () => { b.remove(); transmitForm(); });
  return b;
}

function transmitForm() {
  const f = el("form", "chat-transmit-form");
  f.noValidate = true;
  f.append(el("p", "", t("chat.transmit_intro")));
  const field = (name, label, type, required) => {
    const w = el("div", "field");
    const id = "chat-" + name;
    const l = el("label", "", label + (required ? " *" : ""));
    l.htmlFor = id;
    const i = el("input");
    i.id = id; i.name = name; i.type = type; i.required = required;
    if (type === "email") i.autocomplete = "email";
    w.append(l, i);
    f.append(w);
  };
  field("name", t("form.name"), "text", true);
  field("email", t("form.email"), "email", true);
  field("phone", t("form.phone"), "tel", false);
  const check = (name, label) => {
    const l = el("label", "check");
    const i = el("input");
    i.type = "checkbox"; i.name = name;
    l.append(i, el("span", "", label));
    f.append(l);
  };
  check("attach", t("chat.transmit_attach"));
  check("consent", t("form.consent"));
  const send = el("button", "btn btn--bleu btn--petit", t("chat.transmit_send"));
  send.type = "submit";
  f.append(send);
  log.append(f);
  /** @type {any} */ (f.elements).name.focus();
  const startedAt = Date.now();
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const els = /** @type {any} */ (f.elements);
    const ok = els.name.value.trim() && /^[^@\s"<>]+@[^@\s"<>]+\.[^@\s"<>]{2,}$/.test(els.email.value.trim()) && els.consent.checked;
    if (!ok) { (els.name.value.trim() ? (els.consent.checked ? els.email : els.consent) : els.name).focus(); return; }
    send.disabled = true;
    const last = history.length ? history[history.length - 1].q : "";
    const convo = els.attach.checked ? "\n\n---\n" + history.map((h) => `> ${h.q}\n${h.a}`).join("\n\n") : "";
    try {
      const r = await fetch(cfg.formEndpoint || "/api/contact", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
        body: JSON.stringify({ form: "assistant", requestId: (crypto.randomUUID && crypto.randomUUID()) || String(Date.now()), lang, name: els.name.value.trim(),
          email: els.email.value.trim(), phone: els.phone.value.trim(), message: (last + convo).slice(0, 4800), consent: true, page: location.pathname,
          website: "", elapsedMs: Date.now() - startedAt + 3000 }),
      });
      const d = await r.json().catch(() => ({}));
      if (d.ok !== true) throw new Error(d.message || "error");
      f.replaceWith(el("p", "chat-ok", t("chat.transmit_sent", { ref: d.reference })));
    } catch (err) {
      send.disabled = false;
      f.append(el("p", "chat-error", (err && err.message !== "error" && err.message) || t("chat.fallback")));
    }
  });
}

/* ---------------- mémoire de l'onglet ---------------- */

function save() {
  try { sessionStorage.setItem(STORE, JSON.stringify({ turns, history: history.slice(-10) })); } catch { /* stockage indisponible */ }
}
function restore() {
  try {
    const s = JSON.parse(sessionStorage.getItem(STORE) || "null");
    if (s && Array.isArray(s.history)) { history = s.history; turns = s.turns || 0; }
  } catch { /* rien */ }
}

/* ---------------- ouverture ---------------- */

/** Ferme le panneau (deuxième clic sur le lanceur). */
export function close() { hide(); }

/** @param {HTMLElement} from  le lanceur (le focus y revient à la fermeture) */
export async function open(from) {
  launcher = from;
  if (!panel) {
    build();
    kb = await kbFor(lang);
    if (!kb) throw new Error("kb");
    restore();
    if (history.length) history.forEach((h) => { bubble("user", h.q); bubble("bot", h.a); });
    else greet();
  }
  panel.hidden = false;
  if (isModal()) { panel.setAttribute("aria-modal", "true"); setInert(true); document.documentElement.classList.add("chat-open"); }
  from.setAttribute("aria-expanded", "true");
  from.setAttribute("aria-controls", "cfs-assistant");
  input.focus();
  sessions();
}
