// @ts-check
/** Chargement de la base de connaissances de l'assistant (une seule requête par langue et par page). */
const cache = new Map();

/**
 * @param {string} url  adresse versionnée (CFS_CONFIG.assistant.kb, ou celle d'une autre langue)
 * @returns {Promise<any>}
 */
export function loadKb(url) {
  if (!cache.has(url)) {
    cache.set(url, fetch(url, { credentials: "omit" }).then((r) => {
      if (!r.ok) throw new Error("kb " + r.status);
      return r.json();
    }));
  }
  return cache.get(url);
}

/** Adresse de la base d'une autre langue (même empreinte de construction). */
export function kbUrlFor(url, from, to) {
  return url.replace(`kb.${from}.json`, `kb.${to}.json`).replace(/\?v=[^&]*/, "");
}
