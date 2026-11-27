// @ts-check
/**
 * Recherche du site : panneau ouvert par la loupe de l'en-tête (ou la touche « / ») et page Résultats (/recherche/).
 * Tout se passe dans le navigateur, à partir de la base de connaissances générée depuis le site (la même que celle
 * de l'assistant) : formations, domaines, questions fréquentes, guides et pages de service, dans la langue de la page.
 * Mots commencés acceptés (« chari » → chariot), synonymes FR/NL/EN de l'assistant (B-VCA, EHBO, heftruck…).
 * Texte inséré par textContent uniquement ; liens issus de la base (pages du site).
 */
import { findFormation, fold, search } from "../assistant/retrieval.js";
import { loadKb } from "../assistant/knowledge.js";

const W = /** @type {any} */ (window);
const cfg = (W.CFS_CONFIG && W.CFS_CONFIG.search) || {};
const I = W.CfsI18n;
const t = (k, v) => (I ? I.t(k, v) : k);
let kbPromise = null;
const kb = () => (kbPromise = kbPromise || loadKb(cfg.kb));

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

/** Extrait court et lisible d'une entrée. */
function snippet(e) {
  const f = e.facts || {};
  if (e.type === "formation") {
    const bits = [f.duration, f.priceHtva ? priceText(f.priceHtva) : t("common.quote")].filter(Boolean).join(" · ");
    return (bits ? bits + " — " : "") + cut(e.content, 140);
  }
  return cut(e.content, 160);
}
function priceText(n) {
  const lang = (I && I.lang()) || "fr";
  const loc = lang === "en" ? "en-GB" : lang === "nl" ? "nl-BE" : "fr-BE";
  return new Intl.NumberFormat(loc, { style: "currency", currency: "EUR", maximumFractionDigits: n % 1 ? 2 : 0 }).format(n) + " " + t("common.htva");
}
function cut(s, n) { const x = String(s || ""); return x.length <= n ? x : x.slice(0, x.lastIndexOf(" ", n)) + "…"; }

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

/** Un résultat : type, titre (lien), extrait. */
function item(e, q) {
  const li = document.createElement("li");
  li.className = "search-item search-item--" + e.type;
  const type = document.createElement("span");
  type.className = "search-type";
  type.textContent = t("search.type_" + e.type);
  const a = document.createElement("a");
  a.className = "search-link";
  a.href = e.url;
  a.append(highlighted(e.full || e.title, q));
  const p = document.createElement("p");
  p.className = "search-snippet";
  p.append(highlighted(snippet(e), q));
  li.append(type, a, p);
  return li;
}

function countText(n, q) {
  return n === 0 ? t("search.none", { q }) : n === 1 ? t("search.results_one", { q }) : t("search.results", { n, q });
}

/* ---------------- panneau de l'en-tête ---------------- */

let panel = null, input = null, list = null, status = null, more = null, trigger = null, timer = null;

function build() {
  panel = document.createElement("div");
  panel.className = "search-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-label", t("search.title"));
  panel.hidden = true;
  const box = document.createElement("div");
  box.className = "search-sheet";
  const form = document.createElement("form");
  form.className = "search-form";
  form.setAttribute("role", "search");
  form.action = cfg.page;
  form.method = "get";
  const label = document.createElement("label");
  label.className = "sr-only";
  label.htmlFor = "search-panel-q";
  label.textContent = t("search.label");
  input = document.createElement("input");
  input.id = "search-panel-q";
  input.name = "q";
  input.type = "search";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.maxLength = 120;
  input.placeholder = t("search.placeholder");
  input.setAttribute("aria-controls", "search-panel-list");
  const close = document.createElement("button");
  close.type = "button";
  close.className = "search-close";
  close.setAttribute("aria-label", t("search.close"));
  close.textContent = "×";
  form.append(label, input, close);
  status = document.createElement("p");
  status.className = "search-count";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  const hint = document.createElement("p");
  hint.className = "search-hint";
  hint.textContent = t("search.hint");
  list = document.createElement("ol");
  list.className = "search-results";
  list.id = "search-panel-list";
  more = document.createElement("a");
  more.className = "lien-fleche search-more";
  more.hidden = true;
  more.textContent = t("search.all");
  box.append(form, hint, status, list, more);
  panel.append(box);
  document.body.append(panel);

  input.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(update, 120); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { const first = list.querySelector("a"); if (first) { e.preventDefault(); first.focus(); } }
  });
  list.addEventListener("keydown", (e) => {
    const links = Array.from(list.querySelectorAll("a"));
    const i = links.indexOf(/** @type {any} */ (document.activeElement));
    if (e.key === "ArrowDown" && i < links.length - 1) { e.preventDefault(); links[i + 1].focus(); }
    if (e.key === "ArrowUp") { e.preventDefault(); (i > 0 ? links[i - 1] : input).focus(); }
  });
  close.addEventListener("click", hide);
  panel.addEventListener("click", (e) => { if (e.target === panel) hide(); });
  panel.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.preventDefault(); hide(); }
    if (e.key === "Tab") {
      const items = Array.from(panel.querySelectorAll("input, button, a[href]")).filter((x) => !/** @type {any} */ (x).hidden && /** @type {any} */ (x).offsetParent !== null);
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); /** @type {any} */ (last).focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); /** @type {any} */ (first).focus(); }
    }
  });
}

async function update() {
  const q = input.value.trim();
  list.textContent = "";
  more.hidden = true;
  if (q.length < 2) { status.textContent = ""; return; }
  const res = await query(q, 8);
  if (input.value.trim() !== q) return;          // une frappe plus récente a pris le relais
  res.forEach((e) => list.append(item(e, q)));
  status.textContent = countText(res.length, q);
  if (res.length) {
    more.href = cfg.page + "?q=" + encodeURIComponent(q);
    more.hidden = false;
  }
}

function hide() {
  panel.hidden = true;
  document.documentElement.classList.remove("search-open");
  for (const c of Array.from(document.body.children)) if (c !== panel) /** @type {any} */ (c).inert = false;
  if (trigger) trigger.focus();
}

/** @param {HTMLElement | null} from  élément qui reçoit le focus à la fermeture */
export function open(from) {
  trigger = from || /** @type {any} */ (document.activeElement);
  if (!panel) build();
  panel.hidden = false;
  document.documentElement.classList.add("search-open");
  for (const c of Array.from(document.body.children)) if (c !== panel && c.tagName !== "SCRIPT") /** @type {any} */ (c).inert = true;
  input.focus();
  input.select();
  kb();
}

/* ---------------- page Résultats ---------------- */

/** @param {HTMLElement} root  section [data-search-page] */
export async function initPage(root) {
  const form = /** @type {HTMLFormElement} */ (root.querySelector("form"));
  const field = /** @type {HTMLInputElement} */ (form.elements.namedItem("q"));
  const out = root.querySelector("[data-search-results]");
  const count = root.querySelector("[data-search-count]");
  const q = (new URLSearchParams(location.search).get("q") || "").trim().slice(0, 120);
  field.value = q;
  if (!q) { field.focus(); return; }
  const res = await query(q, 30);
  out.textContent = "";
  res.forEach((e) => out.append(item(e, q)));
  count.textContent = countText(res.length, q);
  document.title = `${q} – ${document.title}`;
}
