// @ts-check
/**
 * Tâche planifiée (toutes les 10 minutes, wrangler.toml) :
 *  1. rejoue dans la feuille les demandes gardées dans la boîte de secours Supabase (même requestId : jamais de doublon) ;
 *  2. alerte l'équipe une seule fois si une demande n'a pas pu être rejouée après 24 heures ;
 *  3. crée ainsi une activité réelle dans Supabase, ce qui évite la mise en pause du projet gratuit après 7 jours.
 */
import { callSheet, sheetConfigured } from "./lib/sheets.js";
import { sendEmail, supabase, supabaseConfigured } from "./lib/services.js";
import { teamRequestEmail } from "./lib/emails.js";

/** @param {Record<string, any>} env */
export async function runCron(env, now = Date.now()) {
  const report = { replayed: 0, failed: 0, alerted: 0 };
  if (!supabaseConfigured(env)) return report;
  // Une fois par heure : purge des journaux du chatbot (90 jours) et des anciennes limites de débit
  if (new Date(now).getUTCMinutes() < 10) await supabase(env, "/rest/v1/rpc/purge_old_rows", { method: "POST", body: "{}" });
  const list = await supabase(env, "/rest/v1/outbox_requests?select=*&order=created_at.asc&limit=20");
  if (!list.ok || !Array.isArray(list.data)) return report;
  for (const row of list.data) {
    const req = row.payload || {};
    const res = sheetConfigured(env) ? await callSheet(env, { action: "contact", ...req, elapsed: 99999, consent: true, reserveEmail: false }) : { status: "unreachable" };
    if (res.status === "ok") {
      await supabase(env, `/rest/v1/outbox_requests?request_id=eq.${encodeURIComponent(row.request_id)}`, { method: "DELETE" });
      report.replayed++;
      continue;
    }
    report.failed++;
    const age = now - Date.parse(row.created_at);
    const patch = { attempts: (row.attempts || 0) + 1, last_error: String(res.status || "error").slice(0, 120) };
    if (age > 24 * 3600 * 1000 && !row.alerted) {
      const mail = teamRequestEmail(String(env.SITE_URL || "https://centrecfs.be"), { ...req, message: `[Alerte] Demande non rejouée dans la feuille depuis plus de 24 heures. Vérifiez RESERVATIONS_API_URL et le secret HMAC (docs/RUNBOOK.md).\n\n${req.message || ""}` }, row.reference || "CFW");
      const sent = await sendEmail(env, { template: "equipe", replyTo: req.email, ...mail });
      if (sent.ok) { patch.alerted = true; report.alerted++; }
    }
    await supabase(env, `/rest/v1/outbox_requests?request_id=eq.${encodeURIComponent(row.request_id)}`, { method: "PATCH", body: JSON.stringify(patch) });
  }
  return report;
}
