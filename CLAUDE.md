# Centre CFS : règles permanentes (à relire à chaque session)

Mission complète : `PROMPT_CLAUDE_CODE.md` (lecture seule). Avancement : `docs/PLAN.md`. Décisions : `docs/DECISIONS.md`.
Échanges et documentation en français ; code, noms et messages de commit en anglais.

## Méthode
- **Analyser avant de modifier** : lire le code concerné, noter dans `docs/ANALYSE.md` ce qu'il fait et ce qui en dépend.
  Ne casser aucune fonctionnalité existante sans raison écrite et validée.
- **Phase par phase** (section 18 de la mission) : un commit par étape logique, **arrêt et validation de Rayane** à la fin
  de chaque phase (« OK phase suivante »). Tests écrits en même temps que le code.
- Chaque décision technique importante : une entrée dans `docs/DECISIONS.md` (contexte, options, choix, conséquences).
- **Demander avant** toute action irréversible, payante ou publique : mise en production, push sur `main` (déclenche la
  publication), clés Mollie `live`, e-mails réels, suppression de données, migration destructive, photo d'une personne.
- **Ne rien inventer** : prix, durée, date, places, agrément, statistique, avis, formateur, partenaire. Donnée absente →
  « Sur devis » / « Nous consulter », champ vide et ligne dans `docs/A-COMPLETER.md`.

## Langages et dépendances
- HTML généré par `site/build.py` (Python 3), CSS3 natif, **JavaScript vanilla** (pas de framework, pas de TypeScript,
  pas d'outil de build JS), Google Apps Script, SQL uniquement pour les migrations Supabase.
- Bibliothèques copiées dans `site/src/assets/vendor/` (jamais de CDN) : `three` (accueil), `supabase-js` (compte) ;
  Worker : `jose`, `zod`. Toute autre dépendance : justifiée dans `DECISIONS.md` et validée.
- Plans **gratuits** uniquement (Cloudflare, Supabase). Une limite bloquante → s'arrêter et présenter les options.

## Architecture (règles non négociables)
- La **feuille Google « Réservations – Centre CFS »** est la source unique des sessions, places, réservations et demandes.
  **Jamais de date de session ni de nombre de places dans le HTML** : tout est lu par `sessions.js`.
- Places restantes = capacité − réservations qui comptent, **recalculées à chaque lecture**, jamais saisies ni stockées.
- Navigateur → Worker Cloudflare → Apps Script **signé HMAC**. Exception validée par Rayane (D-018, « tout chez
  Google ») : sans Worker, le navigateur appelle seulement les 3 routes publiques de l'Apps Script (sessions, demandes,
  réservation sur facture), revalidées et limitées par la feuille ; tout le reste reste signé.
- E-mails : **côté serveur uniquement** (Gmail du compte de la feuille, ou EmailJS avec clé privée), jamais depuis le
  navigateur.
- Mots de passe : **Supabase Auth uniquement**.
- Aucun secret hors de `.dev.vars` (jamais commité), des secrets Cloudflare et des propriétés du script Google.
- « Merci… Référence » seulement si la réponse du serveur contient `ok: true`.

## Charte 2026
Bleu `#0D4A8C` · jaune `#F7B500` (toujours texte encre) · encre `#0F1C2E` · acier `#4A5869` · papier `#F2F5F9` · rouge
`#C8241C` (incendie, erreurs) · vert `#0B7F4E` (secours, « disponible »). Barlow Condensed 700/800 (titres), Barlow
(texte), auto-hébergées. Pictogrammes ISO 7010 (`site/lib/icons.py`). Rayons 6 / 12 / 18 px. **Un seul bouton jaune par
écran.** Majuscule en début de phrase seulement, verbes d'action.

## Contenus et images
- `client/` et le dépôt de référence Wisy sont en **lecture seule**. URL françaises existantes inchangées.
- Images : Pexels, Unsplash (licence gratuite), Pixabay, téléchargées et auto-hébergées, inscrites dans
  `docs/image-sources.md` ; jamais présentées comme le centre, une salle ou une personne du Centre CFS.

## Commandes utiles
```bash
python3 site/build.py                      # site complet dans dist/ (importe aussi client/)
python3 site/tools/import_client.py --check
python3 site/tools/check_i18n.py && python3 site/tools/check_links.py
python3 -m pytest site/tests -q            # tests Python
npm test                                   # tests Node (Node 22 requis)
```
Prévues par la mission, pas encore disponibles : `npm run dev`, `npm run eval:chatbot`, `python3 site/tools/check_seo.py`.
