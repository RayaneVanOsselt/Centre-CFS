// @ts-check
/**
 * Panneau de l'assistant (mission 8.8) : dialogue accessible, non modal sur ordinateur, plein écran modal sur
 * téléphone (Échap ferme, focus bouclé puis rendu au lanceur), mention « assistant automatique » avant le premier
 * message, réponses du cœur local (responder.js), puis rédaction par l'IA (Worker POST /api/chat, DECISIONS.md D-016)
 * pour chaque vraie question : l'IA reçoit la réponse locale vérifiée, le fil de la conversation et les sessions, et sa
 * réponse est revalidée ici ; intentions sensibles (sécurité, obligations légales, agrément…) : réponse locale seule.
 * Transmission volontaire de la question à l'équipe (POST /api/contact). Avis « utile / pas utile » anonyme.
 * « Conseiller formation » : accueil en 4 actions, parcours guidé « Trouver ma formation » (domaine → pour qui →
 * fiches), fiches riches (durée, tarif, validité, prochaine date et places restantes, Réserver / Fiche / Devis), tout
 * tiré du catalogue, de la base de connaissances et des sessions publiées (rien d'inventé).
 * Texte rendu par textContent uniquement ; liens créés à partir d'adresses validées. Rien n'est gardé après
 * la fermeture de l'onglet (sessionStorage au plus).
 */
import { answer } from "./responder.js";
import { validate } from "./validation.js";
import { detectLang } from "./retrieval.js";
import { loadKb, kbUrlFor } from "./knowledge.js";

const W = /** @type {any} */ (window);
const cfg = W.CFS_CONFIG || {};
const CAT = W.CFS_CATALOG || {};
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
  const sign = el("span", "chat-sign");
  sign.setAttribute("aria-hidden", "true");
  sign.append(el("span", "chat-sign-i", "i"), el("span", "chat-sign-dot"));
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
  const send = el("button", "chat-send");
  send.type = "submit";
  send.setAttribute("aria-label", t("chat.send"));
  send.title = t("chat.send");
  send.append(icon("send"));
  form.append(label, input, send);
  const privacy = el("p", "chat-privacy", t("chat.privacy"));
  panel.append(head, notice, log, form, privacy);
  document.body.appendChild(panel);

  close.addEventListener("click", hide);
  reset.addEventListener("click", () => { history = []; turns = 0; save(); log.textContent = ""; greet(); input.focus(); });
  // Champ de saisie : s'agrandit avec le texte (4 lignes au plus)
  const grow = () => { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 120) + "px"; };
  input.addEventListener("input", grow);
  form.addEventListener("submit", () => setTimeout(grow, 0));
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
  String(text).split("\n\n").forEach((p) => b.append(rich(p)));
  log.append(b);
  if (atBottom) log.scrollTop = log.scrollHeight;
  return b;
}

/** Un paragraphe mis en forme sans innerHTML : lignes « - » ou « • » en liste, **texte** en gras. */
function rich(par) {
  const lines = String(par).split("\n");
  const bullet = /^\s*[-•]\s+/;
  if (lines.length > 1 && lines.filter((l) => bullet.test(l)).length >= 2) {
    const frag = document.createDocumentFragment();
    let ul = null;
    for (const line of lines) {
      if (bullet.test(line)) {
        if (!ul) { ul = el("ul", "chat-list"); frag.append(ul); }
        const li = el("li");
        inline(li, line.replace(bullet, ""));
        ul.append(li);
      } else if (line.trim()) { ul = null; const p = el("p"); inline(p, line); frag.append(p); }
    }
    return frag;
  }
  const p = el("p");
  inline(p, par);
  return p;
}
function inline(node, text) {
  String(text).split(/(\*\*[^*]+\*\*)/).forEach((part) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) node.append(el("strong", "", part.slice(2, -2)));
    else if (part) node.append(document.createTextNode(part));
  });
}

/** Icône du catalogue du site (SVG généré à la construction, jamais une donnée saisie). */
function icon(name) {
  const span = el("span", "chat-ico");
  span.setAttribute("aria-hidden", "true");
  span.innerHTML = (CAT.icons || {})[name] || "";
  return span;
}
function domainOf(id) { return (CAT.domains || []).find((d) => d.id === id) || null; }
function formationOf(id) { return (CAT.formations || []).find((f) => f.id === id) || null; }
function money(n) { return I && I.money ? I.money(n) : n + " €"; }
function route(k) { return (CAT.routes || {})[k] || "/"; }

/** Bouton-lien (réserver, fiche, devis) d'une fiche. */
function action(label, href, primary) {
  const a = el("a", "chat-btn" + (primary ? " chat-btn--main" : ""), label);
  /** @type {HTMLAnchorElement} */ (a).href = href;
  return a;
}

/**
 * Fiche riche d'une formation : pictogramme du domaine, titre, durée, tarif HTVA, validité, public, prochaine date
 * avec places restantes (sessions publiées), puis Réserver / Voir la fiche / Demander un devis.
 * @param {string} id  identifiant de la formation
 * @param {{ team?: boolean }} [o]
 */
function formationCard(id, o = {}) {
  const f = formationOf(id);
  if (!f) return null;
  const entry = kb ? kb.entries.find((e) => e.type === "formation" && e.slug === id) : null;
  const facts = (entry && entry.facts) || {};
  const card = el("article", "chat-fcard");
  const dom = domainOf(f.domain);
  if (dom) card.style.setProperty("--fc", "var(--" + ({ bleu: "bleu", rouge: "rouge", vert: "vert", jaune: "jaune-fonce" }[dom.color] || "bleu") + ")");
  const head = el("div", "chat-fcard-head");
  const sign = el("span", "chat-fcard-sign");
  sign.setAttribute("aria-hidden", "true");
  if (dom) sign.innerHTML = dom.sign;     // pictogramme ISO 7010 du catalogue
  const titles = el("div");
  const h = el("h3", "", f.full || f.title);
  titles.append(h);
  if (dom) titles.append(el("p", "chat-fcard-dom", dom.name));
  head.append(sign, titles);
  card.append(head);
  const chips = el("ul", "chat-fcard-facts");
  const chip = (ic, text) => { if (!text) return; const li = el("li"); li.append(icon(ic), el("span", "", text)); chips.append(li); };
  chip("clock", f.duration);
  chip("euro", f.price ? money(f.price) + " " + t("common.htva") : t("common.quote"));
  chip("award", facts.validity);
  if (chips.children.length) card.append(chips);
  if (facts.public) {
    const who = el("p", "chat-fcard-who");
    who.append(el("strong", "", t("chat.card_for") + " "), document.createTextNode(cut(facts.public, 150)));
    card.append(who);
  }
  const next = el("p", "chat-fcard-next");
  next.append(icon("calendar"), el("span", "", t("common.loading")));
  card.append(next);
  const acts = el("div", "chat-fcard-acts");
  card.append(acts);
  const quote = route("contact") + "?type=devis&formation=" + encodeURIComponent(id);
  sessions().then((ses) => {
    const S = W.CfsSessions;
    const s = ses ? ses.list.find((x) => x.training === id && x.state !== "closed") : null;
    const span = /** @type {HTMLElement} */ (next.lastChild);
    if (s && S) {
      next.classList.add("is-" + s.state);
      span.textContent = t("common.next_date") + " : " + S.shortDate(s.date) + " · " + S.place(s.location).name + " · " + S.seatsText(s);
    } else {
      span.textContent = t("common.next_date") + " : " + t("common.on_request");
    }
    acts.textContent = "";
    if (o.team) acts.append(action(t("nav.quote"), quote, true));
    else if (f.bookable && s && s.state !== "full") acts.append(action(t("chat.card_book_short"), route("inscription") + "?formation=" + encodeURIComponent(id) + "&session=" + encodeURIComponent(s.id), true));
    else if (f.bookable) acts.append(action(t("chat.card_register"), route("inscription") + "?formation=" + encodeURIComponent(id), true));
    acts.append(action(t("chat.card_view"), f.url, false));
    if (!o.team) acts.append(action(t("nav.quote"), quote, false));
  });
  return card;
}
function cut(s, n) { const x = String(s || ""); return x.length <= n ? x : x.slice(0, x.lastIndexOf(" ", n)) + "…"; }

/** Message du conseiller avec des choix (boutons) ; les choix disparaissent une fois l'un d'eux cliqué. */
function choices(text, list, cls) {
  const b = bubble("bot", text);
  const box = el("div", "chat-choices" + (cls ? " " + cls : ""));
  list.forEach((c) => {
    const btn = el("button", "chat-choice");
    btn.type = "button";
    if (c.sign) { const s = el("span", "chat-choice-sign"); s.setAttribute("aria-hidden", "true"); s.innerHTML = c.sign; btn.append(s); }
    else if (c.icon) btn.append(icon(c.icon));
    const txt = el("span", "chat-choice-txt");
    txt.append(el("b", "", c.label));
    if (c.sub) txt.append(el("small", "", c.sub));
    btn.append(txt);
    btn.addEventListener("click", () => { box.remove(); c.run(); });
    box.append(btn);
  });
  b.append(box);
  scrollEnd();
  return b;
}
function scrollEnd() { log.scrollTop = log.scrollHeight; }

/* ---------------- parcours « Trouver ma formation » ---------------- */

function finder() {
  const old = log.querySelector(".chat-suggest");
  if (old) old.remove();
  bubble("user", t("chat.tile_find"));
  const count = (id) => (CAT.formations || []).filter((f) => f.domain === id).length;
  choices(t("chat.find_domain"), (CAT.domains || []).map((d) => ({
    label: d.name, sign: d.sign, sub: t(count(d.id) === 1 ? "common.formation_count_one" : "common.formation_count", { n: count(d.id) }),
    run: () => finderWho(d),
  })), "chat-choices--grid");
}
function finderWho(d) {
  bubble("user", d.name);
  choices(t("chat.find_who"), [
    { label: t("chat.find_me"), icon: "user", run: () => finderResult(d, false) },
    { label: t("chat.find_team"), icon: "users", run: () => finderResult(d, true) },
  ], "chat-choices--row");
}
function finderResult(d, team) {
  bubble("user", t(team ? "chat.find_team" : "chat.find_me"));
  const b = bubble("bot", t("chat.find_result", { domain: d.name }) + (team ? "\n\n" + t("nav.mega_note") : ""));
  const list = el("div", "chat-fcards");
  (CAT.formations || []).filter((f) => f.domain === d.id).forEach((f) => { const c = formationCard(f.id, { team }); if (c) list.append(c); });
  b.append(list);
  scrollEnd();
  suggestions([t("chat.find_again"), t("chat.tile_dates_q")], (s) => (s === t("chat.find_again") ? finder() : ask(s)));
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
  const fcard = a.meta && a.meta.formation && !FIXED.has(a.meta.intent) ? formationCard(a.meta.formation) : null;
  const fUrl = fcard ? (formationOf(a.meta.formation) || {}).url : null;
  // Liens déjà présents dans la fiche (page de la formation, inscription ou devis pour cette formation) : pas de doublon
  const same = (u) => fcard && (u === fUrl || String(u).includes("formation=" + encodeURIComponent(a.meta.formation)));
  const cards = (a.cards || []).filter((c) => !same(c.url));
  if (fcard) b.append(fcard);
  if (cards.length) {
    const ul = el("ul", "chat-cards");
    for (const c of cards) {
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

/** Puces de suggestions sous la conversation ; par défaut, un clic pose la question. */
function suggestions(list, run = ask) {
  const old = log.querySelector(".chat-suggest");
  if (old) old.remove();
  const box = el("div", "chat-suggest");
  box.setAttribute("aria-label", t("chat.related"));
  list.forEach((s) => {
    const b = el("button", "chat-chip", s);
    b.type = "button";
    b.addEventListener("click", () => run(s));
    box.append(b);
  });
  log.append(box);
}

function greet() {
  const w = el("div", "chat-welcome");
  w.append(el("p", "chat-welcome-title", t("chat.welcome_title")), el("p", "chat-welcome-text", t("chat.hello")));
  const slug = pageSlug();
  const f = slug ? formationOf(slug) : null;
  const tiles = el("div", "chat-tiles");
  const tile = (ic, label, sub, run) => {
    const b = el("button", "chat-tile");
    b.type = "button";
    b.append(icon(ic));
    const txt = el("span", "chat-tile-txt");
    txt.append(el("b", "", label));
    if (sub) txt.append(el("small", "", sub));
    b.append(txt);
    b.addEventListener("click", run);
    tiles.append(b);
  };
  if (f) {
    const q = (k) => () => ask(`${t(k)} (${f.title})`);
    tile("euro", t("chat.s_price"), f.title, q("chat.s_price"));
    tile("calendar", t("chat.s_next"), f.title, q("chat.s_next"));
    tile("award", t("chat.s_exam"), f.title, q("chat.s_exam"));
    tile("target", t("chat.tile_find"), t("chat.tile_find_sub"), finder);
  } else {
    tile("target", t("chat.tile_find"), t("chat.tile_find_sub"), finder);
    tile("calendar", t("chat.tile_dates"), t("chat.tile_dates_sub"), () => ask(t("chat.tile_dates_q")));
    tile("building", t("chat.tile_team"), t("chat.tile_team_sub"), () => ask(t("chat.quick_intra")));
    tile("phone", t("chat.tile_contact"), t("chat.tile_contact_sub"), () => ask(t("chat.tile_contact_q")));
  }
  w.append(tiles);
  log.append(w);
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
        // Feuille Google en direct : text/plain sans cookie (requête « simple ») ; Worker : JSON
        method: "POST", headers: { "Content-Type": cfg.direct ? "text/plain;charset=utf-8" : "application/json" }, credentials: cfg.direct ? "omit" : "same-origin",
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

/** Pose une question venue d'ailleurs (palette de recherche : « Demander à l'assistant »). */
export async function askQuestion(q) {
  if (panel && !panel.hidden && String(q || "").trim()) await ask(q);
}

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
