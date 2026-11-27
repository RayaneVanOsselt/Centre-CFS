// @ts-check
/**
 * Garde-fous de l'assistant (mission 8.4), côté navigateur ; le Worker applique les mêmes (worker/src/lib/chat-provider.js).
 * - liens uniquement vers des pages du site (liste blanche déduite de la base de connaissances) ;
 * - tout montant cité doit exister dans la base (priceHtva) ;
 * - longueurs bornées.
 */

/** Chemins autorisés (sans paramètres) : pages des entrées et routes de la base. */
export function whitelist(kb) {
  const set = new Set();
  const add = (u) => { if (typeof u === "string" && u.startsWith("/")) set.add(u.split("?")[0].split("#")[0]); };
  for (const e of kb.entries) { add(e.url); add(e.bookUrl); add(e.quoteUrl); }
  Object.values(kb.routes || {}).forEach(add);
  return set;
}

/** Adresse autorisée : chemin du site présent dans la liste blanche (jamais un autre domaine). */
export function allowedUrl(kb, url) {
  if (typeof url !== "string" || !url.startsWith("/") || url.startsWith("//")) return false;
  return whitelist(kb).has(url.split("?")[0].split("#")[0]);
}

/** Montants (« 250 € », « € 275 », « €302.50 ») cités dans un texte, en nombres. */
export function amounts(text) {
  const out = [];
  for (const m of String(text).matchAll(/(\d[\d  .]*(?:,\d+)?)\s?€|€\s?(\d[\d  .]*(?:[.,]\d+)?)/g)) {
    const raw = (m[1] || m[2]).replace(/[  ]/g, "");
    const n = Number(raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw);
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

/**
 * Réponse nettoyée, ou null si elle enfreint une règle de véracité.
 * @param {any} answer  { message, cards, suggestions, sources, meta }
 * @param {any} kb
 */
export function validate(answer, kb) {
  if (!answer || typeof answer.message !== "string" || !answer.message.trim() || answer.message.length > 1500) return null;
  const prices = new Set(kb.entries.filter((e) => e.type === "formation" && e.facts && e.facts.priceHtva != null).map((e) => Number(e.facts.priceHtva)));
  for (const n of amounts(answer.message)) if (!prices.has(n)) return null;
  const ok = (u) => allowedUrl(kb, u);
  return {
    message: answer.message.trim(),
    cards: (answer.cards || []).filter((c) => c && typeof c.title === "string" && ok(c.url)).slice(0, 4),
    suggestions: (answer.suggestions || []).filter((s) => typeof s === "string" && s.length < 120).slice(0, 4),
    sources: (answer.sources || []).filter((s) => s && typeof s.title === "string" && ok(s.url)).slice(0, 3),
    meta: answer.meta || {},
  };
}
