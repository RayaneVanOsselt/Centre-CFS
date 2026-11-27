// @ts-check
/**
 * Worker Cloudflare du Centre CFS : sert le site statique (dist/, assets) et l'API /api/* — porte d'entrée unique vers
 * la feuille Google (appels signés HMAC), Supabase, EmailJS, Mollie et, en option, l'IA du chatbot.
 * Les fichiers statiques, _headers et _redirects sont servis par Cloudflare sans exécuter ce code (run_worker_first
 * limité à /api/*, voir wrangler.toml).
 */
import { fail, json } from "./lib/http.js";
import { sheetConfigured } from "./lib/sheets.js";
import { emailConfigured, mollieConfigured, supabaseConfigured } from "./lib/services.js";
import { getSessions } from "./routes/sessions.js";
import { postContact, postRegistration, message } from "./routes/forms.js";
import { deleteAccount, exportAccount, mollieWebhook, myReservations, paymentStatus, supabaseEmailHook } from "./routes/account.js";
import { postChat } from "./routes/chat.js";
import { runCron } from "./cron.js";

export const VERSION = "3.0.0";

/** @type {Record<string, Record<string, (request: Request, env: any, ctx: any) => Promise<Response>>>} */
const ROUTES = {
  "/api/health": { GET: async (_r, env) => json({ ok: true, version: VERSION, sheet: sheetConfigured(env), supabase: supabaseConfigured(env),
    email: emailConfigured(env), payment: mollieConfigured(env) && env.ONLINE_PAYMENT_ENABLED === "1", chatbot: env.CHATBOT_PROVIDER || "local" }) },
  "/api/sessions": { GET: getSessions },
  "/api/contact": { POST: postContact },
  "/api/registrations": { POST: postRegistration },
  "/api/waitlist": { POST: postContact },
  "/api/chat": { POST: postChat },
  "/api/payments/mollie-webhook": { POST: mollieWebhook },
  "/api/payments/status": { GET: paymentStatus },
  "/api/account/reservations": { GET: myReservations },
  "/api/account/export": { GET: exportAccount },
  "/api/account/delete": { POST: deleteAccount },
  "/api/hooks/supabase-email": { POST: supabaseEmailHook },
};

/**
 * @param {Request} request
 * @param {Record<string, any>} env
 * @param {{ waitUntil: (p: Promise<any>) => void }} ctx
 */
export async function handleApi(request, env, ctx) {
  const url = new URL(request.url);
  const route = ROUTES[url.pathname.replace(/\/$/, "")];
  if (!route) return fail("NOT_FOUND", "not found", 404);
  const handler = route[request.method];
  if (!handler) return fail("METHOD", "method not allowed", 405);
  // Écritures : même origine uniquement (le webhook Mollie et le hook Supabase sont signés ou relus côté serveur)
  if (request.method === "POST" && !/\/(payments\/mollie-webhook|hooks\/)/.test(url.pathname)) {
    const origin = request.headers.get("Origin");
    if (origin && origin !== url.origin && origin !== String(env.SITE_URL || "").replace(/\/$/, "")) return fail("FORBIDDEN", "forbidden", 403);
  }
  try {
    return await handler(request, env, ctx);
  } catch {
    return fail("ERROR", message("fr", "ERROR"), 500);
  }
}

export default {
  /** @param {Request} request @param {any} env @param {any} ctx */
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) return handleApi(request, env, ctx);
    return env.ASSETS.fetch(request);
  },
  /** Toutes les 10 minutes : rejeu de la boîte de secours, activité Supabase (évite la mise en pause du plan gratuit). */
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(runCron(env));
  },
};
