// @ts-check
/**
 * POST /api/chat — couche IA FACULTATIVE du chatbot (section 8.6 de la mission).
 *
 * Le chatbot répond d'abord avec son cœur local, dans le navigateur (assistant/*.js), sans aucun appel réseau.
 * Cette route n'est appelée que si CHATBOT_PROVIDER vaut « workers-ai » ou « claude » ; sinon elle répond « disabled »
 * et le navigateur garde sa réponse locale. Voir docs/README-ASSISTANT.md.
 */
import { fail, json, readBody } from "../lib/http.js";
import { ipHash, rateLimit, verifyTurnstile } from "../lib/services.js";
import { reformulate } from "../lib/chat-provider.js";
import { contextFor } from "../../../site/src/assets/js/assistant/responder.js";
import { allowedUrl } from "../../../site/src/assets/js/assistant/validation.js";
import KB from "../generated/kb.json" with { type: "json" };

export async function postChat(request, env) {
  const provider = String(env.CHATBOT_PROVIDER || "local");
  if (provider === "local") return json({ ok: false, code: "DISABLED" });
  const body = await readBody(request);
  const data = body.data || {};
  const question = String(data.question || "").slice(0, 1000).trim();
  const lang = ["fr", "nl", "en"].includes(data.lang) ? data.lang : "fr";
  if (!question) return fail("INVALID", "invalid", 400);
  const ip = request.headers.get("CF-Connecting-IP") || "";
  if (!(await verifyTurnstile(env, data.turnstileToken || "", ip))) return fail("CAPTCHA", "captcha", 403);
  if (!(await rateLimit(env, "chat:" + (await ipHash(env, ip)), 20, 600))) return fail("RATE_LIMITED", "rate", 429);
  if (!(await rateLimit(env, "chat:day", Number(env.CHATBOT_DAILY_LIMIT || 200), 86400))) return json({ ok: false, code: "LIMIT" });
  // Extraits recherchés dans la copie de la base du Worker (jamais ceux envoyés par le navigateur) ; sessions publiques
  // réduites aux champs utiles, avec un lien de réservation vérifié
  const kb = KB[lang];
  // Fil de la conversation (questions et réponses précédentes, texte seul, bornées) : questions de suite comprises
  const history = (Array.isArray(data.history) ? data.history : []).slice(-6)
    .map((h) => ({ q: String((h && h.q) || "").slice(0, 600), a: String((h && h.a) || "").slice(0, 900) })).filter((h) => h.q && h.a);
  // Recherche sur la question ET la précédente (« et le prix ? ») ; formation de la réponse locale en tête si elle existe
  const previous = history.length ? history[history.length - 1].q : "";
  let context = contextFor(kb, `${question} ${previous}`.trim(), null);
  const slug = /^[a-z0-9-]{2,64}$/.test(String(data.formation || "")) ? String(data.formation) : "";
  const named = slug ? kb.entries.find((e) => e.type === "formation" && e.slug === slug) : null;
  if (named) {
    const top = { title: named.full || named.title, url: named.url, bookUrl: named.bookUrl, facts: named.facts || {}, content: String(named.content || "").slice(0, 1500) };
    context = [top, ...context.filter((c) => c.url !== named.url)].slice(0, 6);
  }
  // Réponse locale déjà vérifiée (brouillon) : l'IA la reformule ; ses montants et liens sont revalidés comme le reste
  const draft = String(data.draft || "").slice(0, 1500);
  const sessions = (Array.isArray(data.sessions) ? data.sessions : []).slice(0, 3).map((x) => ({
    date: String(x.date || "").slice(0, 10), endDate: x.endDate ? String(x.endDate).slice(0, 10) : null, startTime: String(x.startTime || "").slice(0, 5),
    endTime: String(x.endTime || "").slice(0, 5), location: String(x.location || "").slice(0, 20),
    seatsLeft: Number.isFinite(x.seatsLeft) ? x.seatsLeft : null, capacity: Number.isFinite(x.capacity) ? x.capacity : null,
    bookUrl: allowedUrl(kb, x.bookUrl) ? x.bookUrl : null,
  })).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.date));
  const answer = await reformulate(env, { question, lang, context, sessions, history, draft });
  return answer ? json({ ok: true, answer }) : json({ ok: false, code: "FALLBACK" });
}
