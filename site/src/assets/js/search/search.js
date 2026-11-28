// @ts-check
/**
 * Recherche du site : palette de recherche (pilule de l'en-tête, champ du menu mobile ou touche « / ») et page
 * Résultats (/recherche/). Tout se passe dans le navigateur, à partir de la base de connaissances générée depuis le
 * site (la même que celle de l'assistant) : formations, domaines, questions fréquentes, guides et pages de service,
 * dans la langue de la page. Mots commencés acceptés (« chari » → chariot), synonymes FR/NL/EN de l'assistant.
 *
 * Palette (modèle « combobox » ARIA) : avant de taper, recherches récentes (ce navigateur seulement), formations
 * suggérées et accès rapides ; en tapant, résultats groupés par type, mots trouvés surlignés, tarif et durée des
 * formations ; flèches haut/bas, Entrée pour ouvrir, Échap pour fermer ; « Demander à l'assistant » en dernier choix.
 * Texte inséré par textContent uniquement ; liens issus de la base ou du catalogue (pages du site).
 */
import { findFormation, fold, search } from "../assistant/retrieval.js";
import { loadKb } from "../assistant/knowledge.js";

const W = /** @type {any} */ (window);
const cfg = (W.CFS_CONFIG && W.CFS_CONFIG.search) || {};
const CAT = W.CFS_CATALOG || {};
const I = W.CfsI18n;
const t = (k, v) => (I ? I.t(k, v) : k);
let kbPromise = null;
const kb = () => (kbPromise = kbPromise || loadKb(cfg.kb));
const RECENT_KEY = "cfs-search-recent";
const SUGGESTED = ["vca-base", "vca-ligne-hierarchique", "ba4", "secourisme-base", "chariot-elevateur", "equipier-premiere-intervention"];
const GROUPS = ["formation", "domain", "faq", "article", "page"];

/** Résultats classés et dédoublonnés pour une requête. */
export async function query(q, limit = 8) {
  const base = await kb();
  const text = String(q || "").trim().slice(0, 120);
  if (text.length < 2) return [];
  const hits = search(base, text, { prefix: true, limit: 60 });
  const named = findFormation(base, text);
  if (named && !hits.some((h) => h.entry === named)) hits.unshift({ entry: named, score: Infinity });
  else if (named) hits.sort((a, b) => (b.entry === named ? 1 : 0) - (a.entry === named ? 1 : 0));
  const seen = new Set();
  const out = [];
  for (const h of hits) {
    const e = h.entry;
    const key = e.type === "faq" || e.type === "article" ? e.id : e.url;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
    if (out.length >= limit) break;
  }
  return out;
}

/* ---------------- petits outils ---------------- */

function priceText(n) {
  const lang = (I && I.lang()) || "fr";
  const loc = lang === "en" ? "en-GB" : lang === "nl" ? "nl-BE" : "fr-BE";
  return new Intl.NumberFormat(loc, { style: "currency", currency: "EUR", maximumFractionDigits: n % 1 ? 2 : 0 }).format(n) + " " + t("common.htva");
}
function cut(s, n) { const x = String(s || ""); return x.length <= n ? x : x.slice(0, x.lastIndexOf(" ", n)) + "…"; }

/** Extrait court et lisible d'une entrée (page Résultats). */
function snippet(e) {
  const f = e.facts || {};
  if (e.type === "formation") {
    const bits = [f.duration, f.priceHtva ? priceText(f.priceHtva) : t("common.quote")].filter(Boolean).join(" · ");
    return (bits ? bits + " — " : "") + cut(e.content, 140);
  }
  return cut(e.content, 160);
}

/** Texte avec les mots cherchés surlignés (<mark>), construit sans innerHTML. */
function highlighted(text, q) {
  const frag = document.createDocumentFragment();
  const words = fold(q).split(" ").filter((w) => w.length >= 2);
  if (!words.length) { frag.append(text); return frag; }
  const folded = fold(text);
  // fold() garde la longueur des lettres latines courantes : on surligne aux mêmes positions dans le texte d'origine
  if (folded.length !== text.length) { frag.append(text); return frag; }
  const re = new RegExp("(" + words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")", "g");
  let last = 0, m;
  while ((m = re.exec(folded))) {
    if (m.index > last) frag.append(text.slice(last, m.index));
    const mark = document.createElement("mark");
    mark.textContent = text.slice(m.index, m.index + m[0].length);
    frag.append(mark);
    last = m.index + m[0].length;
  }
  frag.append(text.slice(last));
  return frag;
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
/** Icône du catalogue (SVG du site, jamais une donnée saisie) ; pictogramme ISO du domaine pour les formations. */
function visual(kind, domain) {
  const box = el("span", "cmdk-ico");
  box.setAttribute("aria-hidden", "true");
  const dom = domain && (CAT.domains || []).find((d) => d.id === domain);
  const svg = dom && (kind === "formation" || kind === "domain") ? dom.sign
    : (CAT.icons || {})[{ faq: "info", article: "doc", page: "arrow", recent: "clock", quick: "arrow", ask: "chat", agenda: "calendar",
      quote: "doc", companies: "building", contact: "phone" }[kind] || "search"];
  if (svg) box.innerHTML = svg;        // SVG généré par site/build.py (catalogue), aucun texte de l'utilisateur
  if (dom && (kind === "formation" || kind === "domain")) box.classList.add("cmdk-ico--sign");
  return box;
}

/* ---------------- recherches récentes (ce navigateur uniquement) ---------------- */

function recent() {
  try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 5) : []; }
  catch { return []; }
}
function remember(q) {
  const v = String(q || "").trim().slice(0, 80);
  if (v.length < 2) return;
  try { localStorage.setItem(RECENT_KEY, JSON.stringify([v, ...recent().filter((x) => fold(x) !== fold(v))].slice(0, 5))); } catch { /* stockage indisponible */ }
}
function forget() { try { localStorage.removeItem(RECENT_KEY); } catch { /* stockage indisponible */ } }

/* ---------------- palette ---------------- */

let panel = null, input = null, list = null, status = null, more = null, trigger = null, timer = null, seq = 0;
/** @type {{ el: HTMLElement, run: () => void }[]} */
let options = [];
let active = -1;

function build() {
  panel = el("div", "cmdk");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-label", t("search.title"));
  panel.hidden = true;
  const sheet = el("div", "cmdk-sheet");
  const form = /** @type {HTMLFormElement} */ (el("form", "cmdk-bar"));
  form.setAttribute("role", "search");
  form.action = cfg.page;
  form.method = "get";
  const ico = el("span", "cmdk-bar-ico");
  ico.setAttribute("aria-hidden", "true");
  ico.innerHTML = (CAT.icons || {}).search || "";
  const label = el("label", "sr-only", t("search.label"));
  label.htmlFor = "cmdk-q";
  input = /** @type {HTMLInputElement} */ (el("input"));
  input.id = "cmdk-q";
  input.name = "q";
  input.type = "search";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.maxLength = 120;
  input.placeholder = t("search.placeholder");
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-expanded", "true");
  input.setAttribute("aria-controls", "cmdk-list");
  input.setAttribute("aria-autocomplete", "list");
  const close = el("button", "cmdk-esc", t("search.esc"));
  close.setAttribute("type", "button");
  close.setAttribute("aria-label", t("search.close"));
  form.append(ico, label, input, close);
  const body = el("div", "cmdk-body");
  list = el("div", "cmdk-list");
  list.id = "cmdk-list";
  list.setAttribute("role", "listbox");
  list.setAttribute("aria-label", t("search.results_label"));
  status = el("p", "cmdk-status");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  body.append(list, status);
  const foot = el("div", "cmdk-foot");
  const keys = el("span", "cmdk-keys");
  for (const [k, v] of [["↑ ↓", "search.nav_move"], ["↵", "search.nav_open"], [t("search.esc"), "search.nav_close"]]) {
    const s = el("span");
    s.append(el("kbd", "", k), document.createTextNode(" " + t(v)));
    keys.append(s);
  }
  more = /** @type {HTMLAnchorElement} */ (el("a", "cmdk-all", t("search.all")));
  more.hidden = true;
  foot.append(keys, more);
  sheet.append(form, body, foot);
  panel.append(sheet);
  document.body.append(panel);

  input.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(update, 90); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (options.length) setActive((active + (e.key === "ArrowDown" ? 1 : -1) + options.length) % options.length);
    } else if (e.key === "Enter" && active >= 0 && options[active]) {
      e.preventDefault();
      options[active].run();
    } else if (e.key === "Home" && options.length && !input.value) { e.preventDefault(); setActive(0); }
  });
  form.addEventListener("submit", () => remember(input.value));
  close.addEventListener("click", hide);
  more.addEventListener("click", () => remember(input.value));
  panel.addEventListener("click", (e) => { if (e.target === panel) hide(); });
  panel.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.preventDefault(); hide(); }
    if (e.key === "Tab") {
      const items = [input, close, more].filter((x) => !x.hidden && x.offsetParent !== null);
      const i = items.indexOf(/** @type {any} */ (document.activeElement));
      e.preventDefault();
      items[(i + (e.shiftKey ? items.length - 1 : 1)) % items.length].focus();
    }
  });
}

function setActive(i) {
  if (active >= 0 && options[active]) options[active].el.setAttribute("aria-selected", "false");
  active = i;
  if (i < 0 || !options[i]) { input.removeAttribute("aria-activedescendant"); return; }
  const o = options[i].el;
  o.setAttribute("aria-selected", "true");
  input.setAttribute("aria-activedescendant", o.id);
  o.scrollIntoView({ block: "nearest" });
}

/** Groupe de choix avec son intitulé ; renvoie l'élément où ajouter les choix. */
function group(title, action) {
  const g = el("div", "cmdk-grp");
  g.setAttribute("role", "group");
  const h = el("div", "cmdk-group");
  h.id = "cmdk-g-" + list.children.length;
  h.append(el("span", "", title));
  if (action) h.append(action);
  g.setAttribute("aria-labelledby", h.id);
  g.append(h);
  list.append(g);
  return g;
}

/**
 * Un choix : lien (href) ou action ; visuel, titre (surligné), ligne d'information, étiquette à droite.
 * @param {HTMLElement} where
 * @param {{ href?: string, run?: () => void, kind: string, domain?: string, title: string, sub?: string, end?: string, q?: string }} o
 */
function option(where, o) {
  const a = el(o.href ? "a" : "div", "cmdk-opt");
  a.id = "cmdk-o-" + options.length;
  a.setAttribute("role", "option");
  a.setAttribute("aria-selected", "false");
  a.tabIndex = -1;
  if (o.href) /** @type {HTMLAnchorElement} */ (a).href = o.href;
  const txt = el("span", "cmdk-txt");
  const title = el("span", "cmdk-t");
  title.append(o.q ? highlighted(o.title, o.q) : o.title);
  txt.append(title);
  if (o.sub) { const sub = el("span", "cmdk-s"); sub.append(o.q ? highlighted(o.sub, o.q) : o.sub); txt.append(sub); }
  const end = el("span", "cmdk-end");
  if (o.end) end.append(el("span", "cmdk-price", o.end));
  end.append(el("span", "cmdk-enter", "↵"));
  a.append(visual(o.kind, o.domain), txt, end);
  const index = options.length;
  const run = () => {
    if (input.value.trim().length >= 2) remember(input.value);
    if (o.run) o.run();
    else if (o.href) location.href = o.href;
  };
  a.addEventListener("click", (e) => {
    if (o.run) { e.preventDefault(); run(); return; }
    if (input.value.trim().length >= 2) remember(input.value);     // lien : le navigateur l'ouvre (nouvel onglet possible)
  });
  a.addEventListener("pointermove", () => { if (active !== index) setActive(index); });
  where.append(a);
  options.push({ el: a, run });
}

function reset() {
  list.textContent = "";
  options = [];
  active = -1;
  input.removeAttribute("aria-activedescendant");
  status.textContent = "";
  more.hidden = true;
}

/** Choix proposés avant de taper. */
function suggestions() {
  reset();
  const r = recent();
  if (r.length) {
    const clear = el("button", "cmdk-clear", t("search.clear_recent"));
    clear.setAttribute("type", "button");
    clear.addEventListener("click", () => { forget(); suggestions(); input.focus(); });
    const g = group(t("search.recent"), clear);
    r.forEach((q) => option(g, { kind: "recent", title: q, run: () => { input.value = q; update(); input.focus(); } }));
  }
  const forms = SUGGESTED.map((id) => (CAT.formations || []).find((f) => f.id === id)).filter(Boolean);
  if (forms.length) {
    const g = group(t("search.suggested"));
    forms.forEach((f) => option(g, { kind: "formation", domain: f.domain, href: f.url, title: f.full || f.title,
      sub: [f.duration, (CAT.domains || []).find((d) => d.id === f.domain)?.name].filter(Boolean).join(" · "),
      end: f.price ? priceText(f.price) : t("common.quote") }));
  }
  const R = CAT.routes || {};
  const g = group(t("search.quick"));
  [["agenda", R.agenda, "footer.agenda"], ["quote", R.contact ? R.contact + "?type=devis" : "", "nav.quote"],
    ["companies", R.entreprises, "footer.companies"], ["contact", R.contact, "nav.contact"]]
    .filter(([, href]) => href).forEach(([kind, href, key]) => option(g, { kind, href, title: t(key) }));
}

async function update() {
  const q = input.value.trim();
  const mine = ++seq;
  if (q.length < 2) { suggestions(); return; }
  const res = await query(q, 14);
  if (mine !== seq) return;                       // une frappe plus récente a pris le relais
  reset();
  for (const type of GROUPS) {
    const items = res.filter((e) => e.type === type);
    if (!items.length) continue;
    const g = group(t("search.group_" + type));
    items.slice(0, type === "formation" ? 6 : 4).forEach((e) => {
      const f = e.facts || {};
      option(g, {
        kind: e.type, domain: e.domain, href: e.url, q, title: e.full || e.title,
        sub: e.type === "formation" ? [f.duration, e.domainName].filter(Boolean).join(" · ") : cut(e.content, 110),
        end: e.type === "formation" ? (f.priceHtva ? priceText(f.priceHtva) : t("common.quote")) : "",
      });
    });
  }
  if (W.CFS_CONFIG && W.CFS_CONFIG.assistant) {
    const g = group(t("chat.title"));
    option(g, { kind: "ask", title: t("search.ask", { q }), run: () => {
      hide(false);
      document.dispatchEvent(new CustomEvent("cfs:assistant-ask", { detail: { q } }));
    } });
  }
  status.textContent = res.length === 0 ? t("search.none", { q }) : res.length === 1 ? t("search.results_one", { q }) : t("search.results", { n: res.length, q });
  status.classList.toggle("sr-only", res.length > 0);
  if (res.length) {
    more.href = cfg.page + "?q=" + encodeURIComponent(q);
    more.hidden = false;
    setActive(0);
  }
}

/** @param {boolean} [refocus]  rendre le focus à l'élément d'origine (non quand l'assistant prend le relais) */
function hide(refocus = true) {
  panel.hidden = true;
  document.documentElement.classList.remove("search-open");
  for (const c of Array.from(document.body.children)) if (c !== panel) /** @type {any} */ (c).inert = false;
  if (refocus && trigger) trigger.focus();
}

/** @param {HTMLElement | null} from  élément qui reçoit le focus à la fermeture */
export function open(from) {
  trigger = from || /** @type {any} */ (document.activeElement);
  if (!panel) build();
  // Menu mobile ouvert : il se referme sous la palette
  const burger = document.querySelector(".burger[aria-expanded='true']");
  if (burger) /** @type {HTMLElement} */ (burger).click();
  panel.hidden = false;
  document.documentElement.classList.add("search-open");
  for (const c of Array.from(document.body.children)) if (c !== panel && c.tagName !== "SCRIPT") /** @type {any} */ (c).inert = true;
  input.value = "";
  suggestions();
  input.focus();
  kb();
}

/* ---------------- page Résultats ---------------- */

/** Un résultat de la page Résultats : type, titre (lien), extrait. */
function item(e, q) {
  const li = el("li", "search-item search-item--" + e.type);
  li.append(visual(e.type, e.domain));
  const box = el("div", "search-item-txt");
  const type = el("span", "search-type", t("search.type_" + e.type));
  const a = /** @type {HTMLAnchorElement} */ (el("a", "search-link"));
  a.href = e.url;
  a.append(highlighted(e.full || e.title, q));
  const p = el("p", "search-snippet");
  p.append(highlighted(snippet(e), q));
  box.append(type, a, p);
  li.append(box);
  return li;
}

/** @param {HTMLElement} root  section [data-search-page] */
export async function initPage(root) {
  const form = /** @type {HTMLFormElement} */ (root.querySelector("form"));
  const field = /** @type {HTMLInputElement} */ (form.elements.namedItem("q"));
  const out = root.querySelector("[data-search-results]");
  const count = root.querySelector("[data-search-count]");
  const q = (new URLSearchParams(location.search).get("q") || "").trim().slice(0, 120);
  field.value = q;
  if (!q) { field.focus(); return; }
  remember(q);
  const res = await query(q, 30);
  out.textContent = "";
  res.forEach((e) => out.append(item(e, q)));
  count.textContent = res.length === 0 ? t("search.none", { q }) : res.length === 1 ? t("search.results_one", { q }) : t("search.results", { n: res.length, q });
  document.title = `${q} – ${document.title}`;
}
