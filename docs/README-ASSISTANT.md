# Assistant du site (chatbot)

Deux couches (mission, section 8) :

1. **Cœur local** (toujours actif, 0 €) : `site/src/assets/js/assistant/` — `retrieval.js` (normalisation FR/NL/EN,
   synonymes `site/content/synonyms.json`, intentions, score pondéré), `responder.js` (gabarits `chat.*` de
   `ui.{fr,nl,en}.json`, remplis uniquement avec les faits de la base et les sessions publiées), `validation.js`
   (liens du site seulement, aucun montant absent de la base), `assistant.js` (panneau), `launcher.js` (seul script
   chargé d'emblée). Base de connaissances générée à chaque construction par `site/tools/build_kb.py`
   (`dist/assets/data/kb.*.json` et `worker/src/generated/kb.json`).
2. **Couche IA facultative** (`CHATBOT_PROVIDER` = `workers-ai` ou `claude`, désactivée par défaut) : appelée
   seulement si la confiance locale n'est pas élevée ; le Worker refait la recherche dans SA copie de la base,
   appelle le fournisseur (`worker/src/lib/chat-provider.js`), revalide la réponse (adresses, montants) ; sinon
   réponse locale. Workers AI : choisir au moment de l'activation un modèle multilingue **disponible sur le plan
   gratuit** et fixer `CHATBOT_DAILY_LIMIT` (à mesurer). Claude : `claude-haiku-5-5`, clé `ANTHROPIC_API_KEY` en secret,
   avec une limite de dépenses dans la console Anthropic.

Activer : `CHATBOT_ENABLED=1` à la construction du site. Mention « assistant automatique » affichée avant le premier
message (AI Act, art. 50). Transmission à l'équipe : mini-formulaire → `POST /api/contact` (type Assistant), avec le
Worker seulement.

Évaluation : `npm run eval:chatbot` (rapport `docs/chatbot-tests.md`) ; aussi dans `npm test` et dans le lanceur de
tests du navigateur (`tests/browser/`). Résultat actuel : véracité 27/27, intention et adresse 65/65.
