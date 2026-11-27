// @ts-check
/**
 * Moteur de réponses de l'assistant (mission 8.4) : gabarits par intention et par langue (clés chat.* de
 * site/content/ui.{fr,nl,en}.json), remplis UNIQUEMENT avec les faits de la base de connaissances et les sessions
 * publiées. Aucun prix, aucune date, aucune place, aucun agrément n'est inventé (tests/chatbot).
 * Sortie : { message, cards, suggestions, sources, meta: { intent, confidence, lang, formation } }.
 */
import { detectLang, findFormation, findLanguage, findPlace, intentsOf, search } from "./retrieval.js";
import { validate } from "./validation.js";

const LOCALE = { fr: "fr-BE", nl: "nl-BE", en: "en-BE" };
const NEEDS_FORMATION = ["price", "duration", "hours", "exam", "validity", "certificate", "prerequisites"];

/** Texte traduit de la base (kb.strings : clés chat.*, availability.*, common.htva), variables {nom} remplacées. */
function fmt(kb, key, vars) {
  const s = (kb.strings && kb.strings[key]) ?? key;
  return String(s).replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] != null ? String(vars[k]) : m));
}

/**
 * @param {any} kb            base de connaissances de la langue de la page
 * @param {string} question
 * @param {{ lang?: string, slug?: string | null, sessions?: any[] | null, live?: boolean, kbFor?: (lang: string) => any }} [ctx]
 */
export function answer(kb, question, ctx = {}) {
  const q = String(question || "").slice(0, 1000);
  // Réponse dans la langue du message si elle diffère nettement de celle de la page (base de cette langue chargée)
  let lang = detectLang(q, ctx.lang || kb.lang);
  if (lang !== kb.lang) {
    const other = ctx.kbFor ? ctx.kbFor(lang) : null;
    if (other) kb = other; else lang = kb.lang;
  }
  const t = (k, v) => fmt(kb, k, v);
  const C = { phone: kb.contact.phone, email: kb.contact.email };
  const out = { message: "", cards: [], suggestions: [], sources: [], meta: { intent: "none", confidence: "low", lang, formation: null } };
  const intents = intentsOf(q);
  const named = findFormation(kb, q);
  const pageF = ctx.slug ? kb.entries.find((e) => e.type === "formation" && e.slug === ctx.slug) : null;
  let f = named || pageF;
  let intent = intents[0] || null;
  // Une salle à louer avec « prix » : c'est la location de salle
  if (intent === "price" && intents.includes("rooms")) intent = "rooms";
  // Prix d'une formation dans l'entreprise du client : toujours sur devis
  if (intent === "price" && intents.includes("intra") && !named) intent = "intra";
  // « Vous formez en roumain ? » : langue citée sans autre intention
  if (!intent && findLanguage(kb, q) >= 0) intent = "languages";
  // Une formation citée seule (« VCA Base ? ») : présentation de la formation
  if (!intent && named) intent = "formation";
  out.meta.intent = intent || "none";
  out.meta.formation = f ? f.slug : null;
  const card = (type, title, url) => out.cards.push({ type, title, url });
  const src = (e) => { if (e && !out.sources.some((s) => s.url === e.url)) out.sources.push({ title: e.full || e.title, url: e.url }); };
  const money = (n) => new Intl.NumberFormat(lang === "en" ? "en-GB" : LOCALE[lang], { style: "currency", currency: "EUR", maximumFractionDigits: n % 1 ? 2 : 0 }).format(n);
  const htva = t("common.htva");
  const msg = [];
  const confidence = (c) => { out.meta.confidence = c; };
  const colon = lang === "fr" ? " : " : ": ";   // typographie française : espace avant les deux-points
  const formationCards = () => { if (f) { card("formation", t("chat.card_formation") + colon + f.title, f.url); src(f); } };

  if (NEEDS_FORMATION.includes(intent) && !f && intent !== "price") {
    msg.push(t("chat.which", { list: kb.entries.filter((e) => e.type === "formation").slice(0, 4).map((e) => e.title).join(", ") }));
    out.suggestions = ["VCA Base", "BA4", kb.entries.find((e) => e.slug === "secourisme-base")?.title].filter(Boolean);
    confidence("medium");
  } else switch (intent) {
    case "injection": msg.push(t("chat.injection")); confidence("high"); break;
    case "human": msg.push(t("chat.bot", C)); card("contact", t("chat.card_contact"), kb.routes.contact); confidence("high"); break;
    case "greeting": msg.push(t("chat.hello")); confidence("high"); break;
    case "thanks": msg.push(t("chat.thanks")); confidence("high"); break;
    case "unconfirmed": msg.push(t("chat.unconfirmed", C)); card("contact", t("chat.card_contact"), kb.routes.contact); confidence("high"); break;
    case "cheques": msg.push(t("chat.cheques")); src(faqWith(kb, /cheque|opleidingscheque|voucher/i)); confidence("high"); break;
    case "offtopic": msg.push(t("chat.offtopic")); confidence("high"); break;
    case "closure": msg.push(kb.closure.text || t("chat.opening", C)); confidence(kb.closure.text ? "high" : "medium"); break;
    case "opening": msg.push(t("chat.opening", C)); card("contact", t("chat.card_contact"), kb.routes.contact); confidence("high"); break;
    case "contact": msg.push(t("chat.contact", C)); card("contact", t("chat.card_contact"), kb.routes.contact); confidence("high"); break;
    case "legal": {
      if (f && f.facts.legal) { msg.push(t("chat.legal", { value: f.facts.legal, ...C })); src(f); }
      else {
        const hit = search(kb, q, { types: ["article", "faq"], limit: 1 })[0];
        msg.push(t("chat.legal_general", C));
        if (hit && hit.score > 4) src(hit.entry);
      }
      card("contact", t("chat.card_contact"), kb.routes.contact);
      confidence("high");
      break;
    }
    case "price": {
      if (f) {
        if (f.facts.priceHtva != null) {
          msg.push(t("chat.price", { title: f.title, price: money(Number(f.facts.priceHtva)), htva, note: f.facts.priceNote ? ` (${lower(f.facts.priceNote)})` : "" }));
          card("formation", t("chat.card_register"), f.bookUrl);
        } else {
          msg.push(t("chat.price_quote", { title: f.title }));
          card("contact", t("chat.card_quote"), f.quoteUrl);
        }
        formationCards();
        confidence(named ? "high" : "medium");
      } else {
        const priced = kb.entries.filter((e) => e.type === "formation" && e.facts.priceHtva != null).slice(0, 4);
        msg.push(t("chat.price_list", { list: priced.map((e) => `${e.title} ${money(Number(e.facts.priceHtva))} ${htva}`).join(", ") }));
        card("page", t("chat.card_catalogue"), kb.routes.formations);
        confidence("medium");
      }
      break;
    }
    case "duration": factAnswer("duration", "chat.duration"); break;
    case "hours": factAnswer("hours", "chat.hours"); break;
    case "validity": factAnswer("validity", "chat.validity"); break;
    case "exam": factAnswer("exam", "chat.exam"); break;
    case "certificate": factAnswer("certificate", "chat.certificate"); break;
    case "prerequisites": {
      msg.push(f.facts.prerequisites ? t("chat.prereq", { title: f.title, value: f.facts.prerequisites }) : t("chat.prereq_none", { title: f.title }));
      if (f.facts.public) msg.push(t("chat.public", { value: f.facts.public }));
      formationCards();
      confidence(named ? "high" : "medium");
      break;
    }
    case "equipment": {
      const epi = kb.entries.find((e) => e.type === "formation" && e.facts.equipment)?.facts.equipment;
      if (f && f.facts.equipment) msg.push(t("chat.equipment", { value: f.facts.equipment }));
      else if (f && epi) msg.push(t("chat.equipment_other", { title: f.title, value: epi }));
      else if (epi) msg.push(t("chat.equipment", { value: epi }));
      formationCards();
      confidence(epi ? "high" : "low");
      break;
    }
    case "languages": {
      const i = findLanguage(kb, q);
      if (i > 0) msg.push(t("chat.language_yes", { lang: kb.languages[i] }));
      else msg.push(t("chat.languages", { list: kb.languages.slice(1).join(", ") }));
      card("page", t("chat.card_langs"), kb.routes.langues);
      card("contact", t("chat.card_contact"), kb.routes.contact + "?type=devis");
      confidence("high");
      break;
    }
    case "intra": {
      msg.push(t("chat.intra"));
      card("page", t("chat.card_intra"), kb.routes.entreprises);
      card("contact", t("chat.card_quote"), f ? f.quoteUrl : kb.routes.contact + "?type=devis");
      confidence("high");
      break;
    }
    case "rooms": {
      const caps = kb.rooms.map((r) => r.capacity);
      msg.push(t("chat.rooms", { count: kb.rooms.length, caps: listJoin(caps.map(String), t("chat.and")) }));
      card("page", t("chat.card_rooms"), kb.routes.salles);
      card("contact", t("chat.card_contact"), kb.routes.contact + "?type=salle");
      confidence("high");
      break;
    }
    case "place": {
      const codes = f ? f.facts.places : ["engis", "charleroi", "intra"];
      const list = listJoin(codes.map((c) => t("chat.place_" + c)), t("chat.and"));
      msg.push(f ? t("chat.place_formation", { title: f.title, list }) : t("chat.places", { list }));
      formationCards();
      card("page", t("chat.card_contact"), kb.routes.contact);
      confidence("high");
      break;
    }
    case "next_session": sessionsAnswer(); break;
    case "booking": {
      msg.push(t("chat.booking"));
      card("page", t("chat.card_agenda"), kb.routes.agenda);
      card("formation", t("chat.card_register"), f ? f.bookUrl : kb.routes.inscription);
      confidence("high");
      break;
    }
    case "payment": {
      msg.push(t(kb.flags.onlinePayment ? "chat.payment_online" : "chat.payment_invoice"));
      card("formation", t("chat.card_register"), f ? f.bookUrl : kb.routes.inscription);
      confidence("high");
      break;
    }
    case "cancel": msg.push(t("chat.cancel", C)); card("page", t("chat.card_terms"), kb.routes.cgv); card("contact", t("chat.card_contact"), kb.routes.contact); confidence("high"); break;
    case "password": msg.push(t(kb.flags.accounts ? "chat.password" : "chat.account_off", C)); if (kb.flags.accounts) card("page", t("chat.card_account"), kb.routes.motdepasse); confidence("high"); break;
    case "account": msg.push(t(kb.flags.accounts ? "chat.account" : "chat.account_off", C)); if (kb.flags.accounts) card("page", t("chat.card_account"), kb.routes.compte); confidence("high"); break;
    case "funding": msg.push(t("chat.funding", { ...C, cheques: t("chat.cheques") })); card("contact", t("chat.card_contact"), kb.routes.contact); confidence("medium"); break;
    case "catalogue": {
      const fs = kb.entries.filter((e) => e.type === "formation");
      const doms = kb.entries.filter((e) => e.type === "domain");
      msg.push(t("chat.catalogue", { count: fs.length, domains: doms.length, list: doms.map((d) => d.keywords[0]).join(", ") }));
      card("page", t("chat.card_catalogue"), kb.routes.formations);
      confidence("high");
      break;
    }
    case "formation": {
      msg.push(`${f.full}${colon}${f.content.split(". ").slice(0, 2).join(". ").replace(/\.?$/, ".")}`);
      if (f.facts.duration) msg.push(t("chat.duration", { title: f.title, value: f.facts.duration }));
      formationCards();
      card("formation", t("chat.card_register"), f.bookUrl);
      confidence("high");
      break;
    }
    default: {
      // Aucune intention claire : meilleure réponse de la FAQ, d'un guide ou d'une page, si elle est assez proche
      const hits = search(kb, q, { slug: ctx.slug || null, limit: 3 });
      const top = hits[0];
      if (top && top.score >= 6 && (top.entry.type === "faq" || top.entry.type === "article" || top.entry.type === "page")) {
        msg.push(trim(top.entry.content, 420));
        src(top.entry);
        confidence(top.score >= 10 ? "medium" : "low");
      } else if (top && top.entry.type === "formation" && top.score >= 8) {
        f = top.entry;
        out.meta.formation = f.slug;
        msg.push(`${f.full}${colon}${trim(f.content, 260)}`);
        formationCards();
        confidence("low");
      }
      if (out.meta.confidence === "low") {
        msg.push(t("chat.low"));
        card("contact", t("chat.card_contact"), kb.routes.contact);
        out.meta.transmit = true;
      }
    }
  }

  out.message = msg.filter(Boolean).join("\n\n");
  out.suggestions = out.suggestions.length ? out.suggestions : suggestions(f, intent);
  const checked = validate(out, kb);
  if (!checked) {     // jamais atteint avec les gabarits ; garde-fou si la base change
    return { message: t("chat.low"), cards: [{ type: "contact", title: t("chat.card_contact"), url: kb.routes.contact }], suggestions: [], sources: [],
      meta: { ...out.meta, confidence: "low", transmit: true } };
  }
  return { ...checked, meta: out.meta };

  /* ---------- aides ---------- */
  function factAnswer(key, tpl) {
    const v = f.facts[key];
    msg.push(v ? t(tpl, { title: f.title, value: v }) : t("chat.unknown_fact", { title: f.title }));
    formationCards();
    confidence(v ? (named ? "high" : "medium") : "medium");
  }

  function sessionsAnswer() {
    const place = findPlace(kb, q);
    if (!ctx.sessions) {
      msg.push(t("chat.sess_unavailable"));
      card("page", t("chat.card_agenda"), kb.routes.agenda);
      card("contact", t("chat.card_contact"), kb.routes.contact);
      confidence("high");
      return;
    }
    let list = ctx.sessions.filter((s) => (!f || s.training === f.slug) && (!place || s.location === place));
    const open = list.filter((s) => s.state !== "closed");
    if (!open.length) {
      msg.push(f ? t("chat.sess_none", { title: f.title }) : t("chat.sess_none_all"));
      if (f) card("contact", t("chat.card_notify"), kb.routes.contact + "?type=prevenir&formation=" + f.slug);
      card("page", t("chat.card_intra"), kb.routes.entreprises);
      formationCards();
      confidence("high");
      return;
    }
    const firstOpen = open.find((s) => s.state !== "full");
    const shown = open.slice(0, 3);
    const head = shown[0];
    if (head.state === "full") msg.push(t("chat.sess_full_next", { date: longDate(head) }));
    const target = firstOpen || null;
    if (target) {
      const tf = kb.entries.find((e) => e.slug === target.training);
      msg.push(t("chat.sess_next", { title: tf ? tf.title : target.training, date: longDate(target), place: placeName(target.location), time: timeText(target), seats: seatsText(target) }).trim());
      card("session", t("chat.card_book"), (tf ? tf.bookUrl : kb.routes.inscription) + "&session=" + encodeURIComponent(target.id));
    } else if (f) {
      msg.push(t("chat.sess_none", { title: f.title }));
      card("contact", t("availability.waitlist"), kb.routes.contact + "?type=prevenir&formation=" + f.slug);
    }
    const others = shown.filter((s) => s !== target && s !== head);
    if (others.length) msg.push(t("chat.sess_more", { list: others.map((s) => `${longDate(s)} (${placeName(s.location)})`).join(" ; ") }));
    if (!ctx.live) msg.push(t("chat.sess_fallback"));
    card("page", t("chat.card_agenda"), kb.routes.agenda);
    formationCards();
    confidence("high");
  }

  function longDate(s) {
    const d = new Date(s.date + "T12:00:00");
    const txt = d.toLocaleDateString(LOCALE[lang], { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    return s.endDate && s.endDate !== s.date ? `${txt} → ${new Date(s.endDate + "T12:00:00").toLocaleDateString(LOCALE[lang], { day: "numeric", month: "long" })}` : txt;
  }
  function hm(v) { return lang === "fr" ? v.replace(/^0(\d)/, "$1").replace(":", " h ").replace(/ h 00$/, " h") : v; }
  function timeText(s) { return s.startTime && s.endTime ? `${hm(s.startTime)} – ${hm(s.endTime)}` : s.startTime ? hm(s.startTime) : ""; }
  function placeName(code) { return code === "charleroi" ? "Charleroi (CEME)" : code === "engis" ? "Engis" : t("chat.place_intra"); }
  function seatsText(s) {
    if (!ctx.live || s.seatsLeft == null || !s.capacity) return "";
    if (s.seatsLeft === 1) return t("availability.last") + ".";
    const low = s.seatsLeft <= Math.max(3, Math.ceil(s.capacity * 0.2));
    return t(low ? "availability.low" : "availability.open", { remaining: s.seatsLeft, capacity: s.capacity }) + ".";
  }
  function suggestions(fe, it) {
    if (fe) {
      return [["chat.s_price", "price"], ["chat.s_next", "next_session"], ["chat.s_exam", "exam"], ["chat.s_bring", "equipment"], ["chat.s_validity", "validity"]]
        .filter(([, i]) => i !== it).slice(0, 3).map(([k]) => t(k) + " (" + fe.title + ")");
    }
    return ["chat.quick_vca", "chat.quick_ba4", "chat.quick_intra"].map((k) => t(k));
  }
}

function lower(s) { return s.charAt(0).toLowerCase() + s.slice(1); }
function trim(s, n) { const x = String(s || ""); return x.length <= n ? x : x.slice(0, x.lastIndexOf(" ", n)) + "…"; }
function listJoin(items, and) { return items.length < 2 ? items.join("") : items.slice(0, -1).join(", ") + and + items[items.length - 1]; }
function faqWith(kb, re) { return kb.entries.find((e) => e.type === "faq" && re.test(e.title + " " + e.content)) || null; }

/**
 * Extraits envoyés à la couche IA facultative (au plus 6), avec les faits utiles et sans donnée personnelle.
 * @param {any} kb @param {string} question @param {string | null} slug
 */
export function contextFor(kb, question, slug) {
  const named = findFormation(kb, question);
  const hits = search(kb, question, { slug, limit: 6 }).map((h) => h.entry);
  const list = named ? [named, ...hits.filter((e) => e !== named)] : hits;
  return list.slice(0, 6).map((e) => ({ title: e.full || e.title, url: e.url, bookUrl: e.bookUrl, facts: e.facts || {}, content: String(e.content || "").slice(0, 1500) }));
}
