# Assistant du site (chatbot)

Deux couches (mission, section 8) :

1. **Cœur local** (toujours actif, 0 €) : `site/src/assets/js/assistant/` — `retrieval.js` (normalisation FR/NL/EN,
   synonymes `site/content/synonyms.json`, intentions, score pondéré), `responder.js` (gabarits `chat.*` de
   `ui.{fr,nl,en}.json`, remplis uniquement avec les faits de la base et les sessions publiées), `validation.js`
   (liens du site seulement, aucun montant absent de la base), `assistant.js` (panneau), `launcher.js` (seul script
   chargé d'emblée). Base de connaissances générée à chaque construction par `site/tools/build_kb.py`
   (`dist/assets/data/kb.*.json` et `worker/src/generated/kb.json`).
2. **Rédaction par l'IA** (avec le Worker ; DECISIONS.md D-016 et D-017) : pour
   chaque vraie question, le navigateur envoie à `POST /api/chat` la question, la **réponse locale déjà vérifiée**
   (brouillon), la formation reconnue, les 6 derniers échanges (questions de suite : « et pour le BA5 ? ») et les
   sessions publiques. Le Worker refait la recherche dans **sa** copie de la base (jamais les extraits du navigateur),
   met la fiche de la formation en tête, puis appelle le fournisseur (`worker/src/lib/chat-provider.js`) :

   | `CHATBOT_PROVIDER` | Modèle | Coût |
   |---|---|---|
   | `workers-ai` (**réglage du site**) | `WORKERS_AI_MODEL` = `@cf/google/gemma-4-26b-a4b-it` (Cloudflare Workers AI) | **gratuit** : 10 000 « neurons » par jour, environ 250 réponses ; aucune clé, aucun abonnement |
   | `local` | aucune IA | 0 € |
   | `claude` | non utilisé (payant) ; code conservé et testé pour un éventuel besoin futur | — |

   La réponse de l'IA est **revalidée deux fois** (Worker puis navigateur) : adresses du site seulement, aucun montant
   absent de la base, longueur bornée. Au moindre doute, la réponse locale vérifiée s'affiche. Ne passent **jamais**
   par l'IA (réponse fixe) : tentative de manipulation, « êtes-vous humain ? », salutations, remerciements, hors sujet,
   contact, fermetures, obligations légales, agrément et taux de réussite non confirmés, chèques-formation, mot de passe.

   Plafond `CHATBOT_DAILY_LIMIT` (200 réponses de l'IA par jour, sous l'allocation gratuite) : au-delà, ou si
   l'allocation du jour est épuisée, le cœur local répond seul, sans frais.

Panneau (`assistant.js`, `assistant.css`) : en-tête « assistant automatique · informations vérifiées du site »,
indicateur « l'assistant écrit… », mention « Rédigé par l'IA à partir des informations vérifiées du site » sous
chaque réponse de l'IA, fiches et sources vérifiées gardées, avis « utile / pas utile » (événement anonyme
`cfs:analytics` : intention, oui/non, IA ou non ; jamais le texte). Lanceur (`launcher.js`) : avatar, pastille « IA »
quand la couche IA est active, bulle « Besoin d'aide ? » une fois par visite (jamais sur les pages compte ou
formulaire), deuxième clic = fermeture.

Affiché par défaut (GitHub Pages : cœur local seul ; Cloudflare : cœur local + IA). `CHATBOT_ENABLED=0` pour le masquer. Mention « assistant automatique » affichée avant le premier
message (AI Act, art. 50). Transmission à l'équipe : mini-formulaire → `POST /api/contact` (type Assistant), avec le
Worker seulement.

Évaluation : `npm run eval:chatbot` (rapport `docs/chatbot-tests.md`) ; aussi dans `npm test` et dans le lanceur de
tests du navigateur (`tests/browser/`). Résultat actuel : 68 questions, véracité 30/30, intention et adresse 68/68.
Essai du circuit complet sans clé ni coût : `tests/browser/e2e.html?ai=1` (IA simulée par le relais Workers AI), puis
une page du site dans un autre onglet.
