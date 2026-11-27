/* Évaluation de l'assistant sur tests/chatbot/questions.json (mission 8.10), partagée par le test (eval.test.js)
   et la commande « npm run eval:chatbot » (scripts/eval-chatbot.js, qui écrit docs/chatbot-tests.md).
   Règles de véracité (100 % exigé) : aucun montant absent de la base, aucune date absente des sessions de test,
   textes interdits absents. Intention et adresse attendues : 90 % au moins. */
import { answer } from "../../site/src/assets/js/assistant/responder.js";
import { amounts } from "../../site/src/assets/js/assistant/validation.js";

const MONTHS = /(\d{1,2})(?:er)? (janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre|januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december|January|February|March|April|May|June|July|August|September|October|November|December) (20\d\d)/gi;

/** Dates autorisées : celles des sessions de test, et la date de fin des chèques-formation (fait de la base). */
function allowedDates(sessions) {
  const ok = new Set(["30-8-2026"]);
  for (const s of sessions) for (const d of [s.date, s.endDate].filter(Boolean)) {
    const [y, m, j] = d.split("-").map(Number);
    ok.add(`${j}-${m}-${y}`);
  }
  return ok;
}
const MONTH_INDEX = (name) => {
  const n = name.toLowerCase();
  const lists = [["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"],
    ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"],
    ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"]];
  for (const l of lists) { const i = l.indexOf(n); if (i >= 0) return i + 1; }
  return 0;
};

/**
 * @param {Record<string, any>} kbs  bases par langue
 * @param {{ sessions: any[], questions: any[] }} suite
 */
export function evaluate(kbs, suite) {
  const dates = allowedDates(suite.sessions);
  // Dates citées par la base elle-même (textes de loi, fermeture annuelle…) : ce sont des faits, pas des inventions
  for (const kb of Object.values(kbs)) {
    const all = JSON.stringify(kb.entries) + JSON.stringify(kb.strings || {}) + JSON.stringify(kb.closure || {});
    for (const m of all.matchAll(MONTHS)) dates.add(`${Number(m[1])}-${MONTH_INDEX(m[2])}-${m[3]}`);
  }
  const rows = suite.questions.map((c) => {
    const a = answer(kbs[c.lang], c.q, { lang: c.lang, slug: c.slug || null, sessions: suite.sessions, live: true, kbFor: (l) => kbs[l] });
    const text = a.message.toLowerCase().replace(/[\u00a0\u202f]/g, " ");   // espaces insécables des montants
    const urls = [...a.cards.map((x) => x.url), ...a.sources.map((x) => x.url)];
    const problems = [];
    for (const m of c.must || []) if (!text.includes(m.toLowerCase())) problems.push(`absent : « ${m} »`);
    for (const m of c.mustNot || []) if (text.includes(m.toLowerCase())) problems.push(`interdit : « ${m} »`);
    const prices = new Set(Object.values(kbs).flatMap((kb) => kb.entries.filter((e) => e.type === "formation" && e.facts.priceHtva != null).map((e) => Number(e.facts.priceHtva))));
    for (const n of amounts(a.message)) if (!prices.has(n)) problems.push(`montant inventé : ${n}`);
    for (const m of a.message.matchAll(MONTHS)) {
      const key = `${Number(m[1])}-${MONTH_INDEX(m[2])}-${m[3]}`;
      if (!dates.has(key)) problems.push(`date inventée : ${m[0]}`);
    }
    const truthOk = problems.length === 0;
    const intentOk = a.meta.intent === c.intent;
    const urlOk = !c.url || urls.some((u) => u.includes(c.url));
    return { ...c, got: a.meta.intent, confidence: a.meta.confidence, answerLang: a.meta.lang, message: a.message, urls, truthOk, intentOk, urlOk, problems };
  });
  const truthRows = rows.filter((r) => r.truth);
  return {
    rows,
    total: rows.length,
    truth: { passed: truthRows.filter((r) => r.truthOk).length, total: truthRows.length },
    allChecks: rows.filter((r) => r.truthOk).length,
    intentUrl: rows.filter((r) => r.intentOk && r.urlOk).length,
    langOk: rows.filter((r) => r.answerLang === r.lang).length,
  };
}
