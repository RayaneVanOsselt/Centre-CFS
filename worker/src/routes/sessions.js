// @ts-check
/**
 * GET /api/sessions?lang=fr[&formation=vca-base]
 * Sessions publiées et à venir, lues dans la feuille (appel signé), avec les places recalculées par la feuille.
 * Aucune donnée personnelle. Cache de 30 s (Cache API du centre de données), en plus des 30 s de cache de la feuille.
 */
import { json } from "../lib/http.js";
import { callSheet } from "../lib/sheets.js";

/** Seuil « dernières places » : max(3 ; 20 % de la capacité). */
export function lowThreshold(capacity) {
  return Math.max(3, Math.ceil(capacity * 0.2));
}

/**
 * Format public d'une session (annexe C), en gardant les clés lues par le navigateur (sessions.js).
 * @param {Record<string, any>} s  session telle que renvoyée par la feuille
 */
export function publicSession(s) {
  const capacity = Number(s.capacity) || 0;
  const remaining = Math.max(0, Number(s.seatsLeft) || 0);
  let state = "open";
  if (s.status === "cancelled") state = "cancelled";
  else if (s.status === "closed") state = "closed";
  else if (!capacity) state = "on_request";
  else if (remaining <= 0 || s.status === "full") state = "full";
  else if (remaining <= lowThreshold(capacity)) state = "low";
  return {
    id: s.id, training: s.training, formation: s.training, date: s.date, startDate: s.date, endDate: s.endDate || null,
    startTime: s.startTime || null, endTime: s.endTime || null, location: s.location, language: s.language || "fr",
    capacity, seatsLeft: remaining, remaining, booked: Math.max(0, capacity - remaining), status: s.status, state,
    closesAt: s.closesAt || null, price: s.price ?? null,
  };
}

/**
 * @param {Request} request
 * @param {Record<string, any>} env
 * @param {{ waitUntil: (p: Promise<any>) => void }} ctx
 * @param {{ cache?: Cache | null, fetchImpl?: typeof fetch }} [deps]
 */
export async function getSessions(request, env, ctx, deps = {}) {
  const url = new URL(request.url);
  const cache = deps.cache !== undefined ? deps.cache : (globalThis.caches ? /** @type {any} */ (globalThis.caches).default : null);
  const key = new Request(new URL("/api/sessions?all=1", url).toString());
  /** @type {Record<string, any> | null} */
  let data = null;
  if (cache) {
    const hit = await cache.match(key);
    if (hit) data = await hit.json();
  }
  if (!data) {
    const r = await callSheet(env, { action: "sessions" }, { method: "GET", fetchImpl: deps.fetchImpl });
    if (r.status !== "ok" || !Array.isArray(r.sessions)) {
      return json({ ok: false, status: "unavailable", code: "UNAVAILABLE", source: "none", sessions: [] }, 503);
    }
    data = { ok: true, status: "ok", source: "sheet", generatedAt: r.generatedAt || null, sessions: r.sessions.map(publicSession) };
    if (cache) ctx.waitUntil(cache.put(key, json(data, 200, { "Cache-Control": "public, max-age=30" })));
  }
  const formation = url.searchParams.get("formation");
  const sessions = formation ? data.sessions.filter((s) => s.training === formation) : data.sessions;
  return json({ ...data, sessions }, 200, { "Cache-Control": "public, max-age=30" });
}
