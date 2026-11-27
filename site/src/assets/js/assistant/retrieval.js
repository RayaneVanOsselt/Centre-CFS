// @ts-check
/**
 * Recherche locale de l'assistant (mission 8.3) : normalisation FR/NL/EN, synonymes, détection d'intention,
 * formation citée, score pondéré façon BM25 (titre ×3, mots-clés et alias ×2, faits ×2, contenu ×1).
 * Module sans DOM : utilisé par le navigateur (assistant.js) et par l'évaluation (tests/chatbot).
 */

/** Minuscules, sans accents ni ponctuation ; « 8h30 » → « 8 h 30 ». Même règle que site/tools/build_kb.py (fold). */
export function fold(s) {
  return String(s == null ? "" : s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/(\d)h(\d)/g, "$1 h $2").replace(/[’'\-]/g, " ").replace(/[^a-z0-9€@.+\s]/g, " ").replace(/\s+/g, " ").trim();
}

const STOP = new Set(("le la les un une des de du d l a au aux et ou en dans pour par sur avec est sont je tu il nous vous ils on ce cet cette ces " +
  "qui que quoi quel quelle quels quelles mon ma mes votre vos notre nos son sa ses se ne pas plus y faut il-y est-ce " +
  "de het een en of in op voor met is zijn ik je u we wij jullie zij dat dit die wat welke mijn uw onze hun te van aan er niet " +
  "the a an and or in on for with is are i you we they it this that what which my your our their to of at by be do does can").split(" "));

/** Mots normalisés, sans mots vides, avec une racinisation légère (pluriels). */
export function tokens(text) {
  return fold(text).split(" ").filter((w) => w.length > 1 && !STOP.has(w)).map(stem);
}
function stem(w) {
  if (w.length > 5) return w.replace(/(ations|ation|ingen|ing|ies|es|en|s)$/, "");
  if (w.length > 3) return w.replace(/s$/, "");
  return w;
}

/** Langue probable d'un message (mots fréquents) ; la langue de la page par défaut. */
export function detectLang(text, fallback = "fr") {
  const w = ` ${fold(text)} `;
  const score = {
    fr: (w.match(/ (le|la|les|est|vous|quel|quelle|quels|combien|prix|formation|une|des|pour|avec|faut|pouvez|quand|votre|vos|ou|sont|du) /g) || []).length,
    nl: (w.match(/ (de|het|een|is|wat|hoeveel|kost|opleiding|wanneer|voor|met|ik|jullie|kunt|welke|zijn|negeer|toon|mijn|hoe|waar|moet|kan|uw|bent|ben) /g) || []).length,
    en: (w.match(/ (the|is|what|how|much|price|course|training|when|do|you|for|with|can|which|are|next) /g) || []).length,
  };
  const best = Object.entries(score).sort((a, b) => b[1] - a[1])[0];
  return best[1] >= 2 && best[1] > (score[fallback] || 0) ? best[0] : fallback;
}

/** Intentions, de la plus prioritaire à la moins prioritaire (texte déjà normalisé par fold). */
export const INTENTS = [
  ["injection", /(ignore|oublie|vergeet|negeer|disregard|forget).{0,40}(instruction|regle|consigne|prompt|rules|regels)|system ?prompt|prompt systeme|(cle|key|sleutel|token|secret)s? ?(api|secrete?)|api ?key|jailbreak|developer mode|reveal your|revele tes|toon je/],
  ["human", /(es tu|etes vous|ben je|bent u|are you|r u)\s.{0,20}(humain|human|robot|\bia\b|\bai\b|bot|mens|persoon|person|reel|echt|real)|parler a un humain|speak (to|with) a human|met een mens/],
  ["greeting", /^(bonjour|salut|hello|hi|hey|hallo|goedendag|goeiedag|dag|bonsoir|good (morning|afternoon|evening))( (a vous|tout le monde|there))?[ !.]*$/],
  ["thanks", /^(merci|thanks|thank you|bedankt|dank je|dank u|super merci|ok merci)\b/],
  ["unconfirmed", /\bagree?e?s?\b|agrement|erkend|erkenning|accredit|reconnu|recogni[sz]ed|taux de reussite|slaagkans|slaagpercentage|pass rate|success rate/],
  ["cheques", /cheques? ?-?formation|opleidingscheque|training voucher|\bcheques?\b/],
  ["legal", /obligation|obligatoire|verplicht|wettelijk|mandatory|required by law|legally|\bloi\b|\bwet\b|amende|boete|\bfine\b|combien de secouristes|hoeveel hulpverleners|how many first aiders|arrete royal|\bk ?b\b|royal decree/],
  ["offtopic", /meteo|\bweer\b|weather|football|voetbal|recette|recipe|blague|\bmop\b|joke|bitcoin|crypto|politique|politics|horoscope|film|movie/],
  ["closure", /ferme|fermeture|vacances|conges|noel|fetes|gesloten|sluiting|kerst|vakantie|closed|closure|holiday|christmas/],
  ["password", /mot de passe|wachtwoord|password/],
  ["cancel", /annul|reporter|deplacer|desist|annuleren|uitstellen|cancel|postpone|rembours|terugbetal|refund/],
  ["payment", /\bpay|paiement|payer|bancontact|virement|facture|betal|factuur|overschrijving|invoice|credit card|carte bancaire/],
  ["validity", /valable|validite|valide|expire|renouvel|geldig|vervalt|\bvalid|validity|renew|recyclage tous/],
  ["duration", /duree|combien de temps|combien de jours|dure |dure$|duur|hoe lang|hoeveel dagen|how long|duration|how many days/],
  ["price", /\bprix\b|\bcout|\bcoute|tarif|combien|€|\beuro|prijs|\bkost|tarief|price|\bcost|how much|\bfee/],
  ["next_session", /prochaine?s?|quand|\bdates?\b|sessions?|agenda|calendrier|disponib|places? (libre|dispo|restant)|wanneer|volgende|datum|\bdata\b|sessie|beschikbaar|plaatsen|\bwhen\b|\bnext\b|upcoming|schedule|available|seats|places left/],
  ["exam", /examen|\bexam|epreuve|toets|seuil/],
  ["certificate", /certificat|attestation|diplome|brevet|certificaat|attest\b|certificate|diploma/],
  ["prerequisites", /prerequis|pre requis|condition.{0,6}acces|niveau requis|voorkennis|vereist|voorwaarde|prerequisite|requirement/],
  ["equipment", /apporter|amener|prendre avec|chaussures|tenue|vetements|equipement|meebrengen|meenemen|schoenen|kleding|\bbring\b|shoes|clothing|equipment|what to wear/],
  ["languages", /\blangues?\b|\btalen?\b|languages?|\bspreek|\bspeak|traduct|vertal|translat/],
  ["intra", /entreprise|sur site|chez nous|\bintra|in (ons|uw|mijn|jullie) bedrijf|op locatie|at (our|your) (site|company|premises)|in.company|on site|onsite|our site/],
  ["rooms", /\bsalles?\b|louer|location de salle|\bzaal|zalen|huren|\brooms?\b|\bhire\b|\brent\b/],
  ["hours", /horaires?|a quelle heure|commence|\bheures?\b|\buur\b|uren|hoe laat|begint|what time|\bstart|\bhours\b/],
  ["contact", /contact|telephone|\btel\b|numero|appeler|\be ?mail|\bmail|bellen|telefoon|phone|call you|joindre|bereiken|reach you/],
  ["place", /\bou\b|\blieu|adresse|se trouve|acces|parking|venir|\bwaar\b|locatie|\badres|where|location|address/],
  ["booking", /reserv|inscri|inschrij|boek|\bbook|register|sign up|enrol/],
  ["account", /compte|espace client|connexion|connecter|account|login|aanmelden|klantenzone|mes donnees|mijn gegevens|my data|rgpd|gdpr|privacy|vie privee/],
  ["opening", /ouvert|ouverture|openingsuren|\bopen\b|opening hours/],
  ["funding", /financ|subside|subsidie|\bprime|\baide\b|cefora|forem|conge.education|educatief verlof|funding|\bgrant|subsid/],
  ["catalogue", /quelles formations|liste des formations|formations proposees|catalogue|welke opleidingen|aanbod|which courses|what courses|course list|what training/],
];

/** Toutes les intentions reconnues, dans l'ordre de priorité. */
export function intentsOf(text) {
  const f = fold(text);
  return INTENTS.filter(([, re]) => re.test(f)).map(([name]) => name);
}

/** Formation citée dans le texte : alias le plus long trouvé (mots entiers). */
export function findFormation(kb, text) {
  const f = ` ${fold(text)} `;
  let best = null;
  for (const e of kb.entries) {
    if (e.type !== "formation") continue;
    for (const a of e.aliases || []) {
      const alias = fold(a);
      if (alias.length < 2) continue;
      // Pluriels simples ; mots composés néerlandais (« asbestopleiding », « heftruckcursus ») pour les alias d'un seul mot
      const hit = f.includes(` ${alias} `) || f.includes(` ${alias}s `) || f.includes(` ${alias}en `) ||
        (alias.length >= 5 && !alias.includes(" ") && new RegExp(` ${alias}[a-z]{3,} `).test(f));
      if (hit && (!best || alias.length > best.alias.length)) best = { entry: e, alias };
    }
  }
  return best ? best.entry : null;
}

/** Langue de formation citée (index dans kb.languages), ou -1. */
export function findLanguage(kb, text) {
  const words = fold(text).split(" ");
  for (const w of words) if (kb.languageAliases && w in kb.languageAliases) return kb.languageAliases[w];
  return -1;
}

/** Lieu cité (« engis », « charleroi »), ou null. */
export function findPlace(kb, text) {
  const words = new Set(fold(text).split(" "));
  for (const [code, list] of Object.entries(kb.placeAliases || {})) if (list.some((x) => words.has(x))) return code;
  return null;
}

/* ---------------- recherche plein texte pondérée ---------------- */

const INDEX = new WeakMap();
function indexOf(kb) {
  let idx = INDEX.get(kb);
  if (idx) return idx;
  const docs = kb.entries.map((e) => {
    const facts = Object.values(e.facts || {}).filter((v) => typeof v === "string").join(" ");
    return {
      e,
      fields: [
        [tokens(e.title + " " + (e.full || "")), 3],
        [tokens((e.keywords || []).join(" ") + " " + (e.aliases || []).join(" ")), 2],
        [tokens(facts), 2],
        [tokens(e.content || ""), 1],
      ],
    };
  });
  const df = new Map();
  for (const d of docs) {
    const seen = new Set(d.fields.flatMap(([t]) => t));
    for (const t of seen) df.set(t, (df.get(t) || 0) + 1);
  }
  idx = { docs, df, n: docs.length };
  INDEX.set(kb, idx);
  return idx;
}

/**
 * Entrées classées par pertinence.
 * @param {any} kb
 * @param {string} text
 * @param {{ slug?: string | null, types?: string[], limit?: number }} [opts]
 * @returns {{ entry: any, score: number }[]}
 */
export function search(kb, text, opts = {}) {
  const q = [...new Set(tokens(text))];
  if (!q.length) return [];
  const { docs, df, n } = indexOf(kb);
  const out = [];
  for (const d of docs) {
    if (opts.types && !opts.types.includes(d.e.type)) continue;
    let score = 0;
    for (const term of q) {
      const idf = Math.log(1 + (n - (df.get(term) || 0) + 0.5) / ((df.get(term) || 0) + 0.5));
      for (const [toks, w] of d.fields) {
        const tf = toks.filter((x) => x === term).length;
        if (tf) score += w * idf * ((tf * 2.2) / (tf + 1.2 * (0.25 + 0.75 * Math.min(toks.length, 200) / 60)));
      }
    }
    if (opts.slug && d.e.slug === opts.slug) score *= 1.3;   // bonus : formation de la page en cours
    if (score > 0) out.push({ entry: d.e, score });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, opts.limit || 8);
}
