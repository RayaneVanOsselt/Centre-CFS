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

export async function postChat(request, env) {
  const provider = String(env.CHATBOT_PROVIDER || "local");
  if (provider === "local") return json({ ok: false, code: "DISABLED" });
  const body = await readBody(request);
  const data = body.data || {};
  const question = String(data.question || "").slice(0, 1000).trim();
  const lang = ["fr", "nl", "en"].includes(data.lang) ? data.lang : "fr";
  if (!question || !Array.isArray(data.context)) return fail("INVALID", "invalid", 400);
  const ip = request.headers.get("CF-Connecting-IP") || "";
  if (!(await verifyTurnstile(env, data.turnstileToken || "", ip))) return fail("CAPTCHA", "captcha", 403);
  if (!(await rateLimit(env, "chat:" + (await ipHash(env, ip)), 20, 600))) return fail("RATE_LIMITED", "rate", 429);
  if (!(await rateLimit(env, "chat:day", Number(env.CHATBOT_DAILY_LIMIT || 200), 86400))) return json({ ok: false, code: "LIMIT" });
  const answer = await reformulate(env, { question, lang, context: data.context.slice(0, 6), sessions: Array.isArray(data.sessions) ? data.sessions.slice(0, 3) : [] });
  return answer ? json({ ok: true, answer }) : json({ ok: false, code: "FALLBACK" });
}
