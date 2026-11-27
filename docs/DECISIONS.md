# Décisions techniques

Une entrée par décision : contexte, options, choix, conséquences. Statut : **proposée** (en attente de Rayane),
**validée** ou **remplacée**.

## D-001 : hébergement de transition sur GitHub Pages, cible Cloudflare Workers (proposée, 27/11/2026)

- **Contexte** : le 26/11/2026, le site a été publié sur GitHub Pages à la demande de Rayane. La mission (section 3) prévoit
  un Worker Cloudflare qui sert le site et l'API `/api/*` ; sans lui, pas de réservation reliée à la feuille, pas de
  formulaire relié à EmailJS, pas de compte, pas de paiement, pas d'IA.
- **Options** : (1) tout migrer vers Cloudflare Workers en phase 4 ; (2) garder GitHub Pages pour le site et ajouter un
  Worker seulement pour `/api/*` sur un sous-domaine ; (3) rester sur GitHub Pages sans serveur.
- **Choix proposé** : (1). GitHub Pages reste l'**aperçu** jusqu'à la phase 4 ; ensuite, le workflow publie sur Cloudflare
  (même dépôt, même générateur). L'option (2) oblige à gérer le CORS et deux domaines ; l'option (3) ne remplit pas la mission.
- **Conséquences** : en attendant, les options `ACCOUNTS_ENABLED`, `ONLINE_PAYMENT_ENABLED`, `CHATBOT_ENABLED` restent à 0
  et les formulaires préparent un e-mail. Les fichiers `_headers` et `_redirects` déjà générés serviront tels quels sur Cloudflare.

## D-002 : formulaires en e-mail pré-rempli tant qu'il n'y a pas de serveur (validée, 26/11/2026)

- **Contexte** : GitHub Pages n'exécute aucun code serveur, et la feuille refuse tout appel non signé.
- **Choix** : le formulaire vérifie les champs puis ouvre la messagerie du visiteur avec la demande complète (bouton
  « Copier » de secours). Destinataire réglable par `FORM_EMAIL` (aujourd'hui `vanosselt.rayane@gmail.com`, demandé par
  Rayane). `FORM_ENDPOINT` permet de brancher une adresse qui reçoit du JSON.
- **Conséquences** : rien n'arrive dans la feuille ; remplacé en phase 6 par la chaîne Worker → feuille → EmailJS.

## D-003 : fonctions serveur désactivées par options, jamais supprimées (validée, 26/11/2026)

- **Contexte** : `build.py` appelait des scripts absents (comptes, paiement, chatbot) : liens cassés et erreurs de console.
- **Choix** : chaque fonction est derrière une option ; `build.py` refuse de construire une page qui appelle un script absent.
- **Conséquences** : on peut réactiver chaque fonction séparément dès que son code et son serveur existent.

## D-004 : enveloppe signée vers Apps Script (proposée, 27/11/2026)

- **Contexte** : l'annexe C propose `{ ts, sig, body }` avec HMAC-SHA256 de `ts + "." + body`. Le moteur existant
  (`reservations.gs`, testé) utilise `{ ts, nonce, sig, payload }` avec HMAC de `ts + "." + nonce + "." + payload` et
  refuse une signature déjà vue (5 minutes de mémoire).
- **Options** : réécrire selon l'annexe C, ou garder l'existant.
- **Choix proposé** : garder l'existant. Il respecte tout ce que demande l'annexe (signature dans le corps, écart de temps
  de 5 minutes au plus, comparaison à temps constant, analyse du contenu après vérification) et ajoute la protection
  contre le rejeu d'une requête interceptée.
- **Conséquences** : le client HMAC du Worker (phase 5) suit ce format ; l'annexe C est mise à jour dans la documentation.

## D-005 : point de départ de la phase 0 (proposée, 27/11/2026)

- **Contexte** : la mission demande de restructurer `sources/` en `site/` sans changer le rendu, captures à l'appui. Cette
  restructuration a déjà été faite (commits `b268d25`, `07d9024`), avec la refonte v2 voulue.
- **Choix proposé** : ne pas refaire la restructuration ; prendre comme **rendu de référence le site publié le 26/11/2026**.
  Les captures avant/après de Playwright seront mises en place avec la CI (phase 4), Node n'étant pas installé sur le poste.
- **Conséquences** : la phase 0 livre l'analyse, le plan, la liste à compléter, `CLAUDE.md` et les tests de l'import.

## D-006 : photos libres de droits et pipeline d'images (validée, 27/11/2026)

- **Contexte** : la mission demande des photos libres (Pexels, Unsplash, Pixabay), traitées en AVIF et WebP, inscrites à
  un registre. Rayane a autorisé le téléchargement.
- **Choix** : 15 photos Pexels, choisies sur planches contact (équipements de protection corrects, aucune marque lisible,
  contexte européen) ; un registre unique `site/content/images.py` alimente les dérivés (`site/tools/optimize_images.py`,
  Pillow), les balises `<picture>` et `docs/image-sources.md`. Recadrage 3:2 sur un point focal au moment de la
  génération : aucune règle CSS par image (CSP stricte, pas d'attribut `style`).
- **Conséquences** : Pillow n'est nécessaire que pour ajouter ou remplacer une photo. Les dérivés sont commités.

## D-007 : minification (validée, 27/11/2026)

- **Contexte** : la mission suppose `rcssmin` et `rjsmin` déjà présents ; ils ne l'étaient pas.
- **Choix** : CSS minifiée par `rcssmin` si le paquet est installé (la CI l'installe) ; JavaScript publié tel quel :
  `rjsmin` ne gère pas toute la syntaxe moderne (gabarits, chaînage optionnel) et le JavaScript initial reste sous le
  budget de 60 Ko compressés.
- **Conséquences** : en local sans `rcssmin`, le site est identique, simplement moins compact.

## D-008 : héros 3D en WebGL2 sur mesure, dans le panneau de chantier (validée, 27/11/2026)

- **Contexte** : la mission (9.2) prévoit Three.js copié dans le projet, avec un budget de 200 Ko et une affiche statique
  rendue par Playwright ; elle autorise un petit moteur WebGL2 sur mesure si le budget n'est pas tenu. Sur ce poste, Node
  et Playwright ne sont pas disponibles, et le téléchargement de Three.js n'a pas été autorisé.
- **Options** : (1) Three.js complet (≈ 170 Ko compressés + scène) ; (2) moteur WebGL2 de ≈ 300 lignes, sans dépendance.
- **Choix** : (2), `site/src/assets/js/hero-3d.js` (≈ 15 Ko non compressés). La scène se joue dans le panneau de chantier
  existant : la nuit tombe sur le panneau, les 8 pictogrammes deviennent des plaques extrudées (face émaillée texturée à
  partir des mêmes SVG que le site, tranche et dos en aluminium) et le pointeur devient une lampe frontale dont le faisceau
  allume le film rétro-réfléchissant. Survol ou focus clavier d'un lien : la plaque se tourne vers le visiteur. Quand le héros
  quitte l'écran, « le jour se lève » : le panneau redevient clair et le rendu s'arrête.
- **Repli et performance** : chargé par `import()` après l'événement `load` et un moment d'inactivité, seulement sans
  « réduire les animations », sans économie de données, avec WebGL2, 4 Go de mémoire et 4 cœurs au moins. Le panneau HTML
  (liens, pictogrammes SVG) est l'affiche : rien ne change pour le temps d'affichage (LCP) ni pour l'accessibilité. Rendu à
  la demande, densité de pixels plafonnée (1,5 ou 2), pause hors écran et onglet masqué, contexte libéré au `pagehide`.
- **Écart avec la mission** : pas d'affiche AVIF rendue par Playwright (inutile : le panneau HTML l'est déjà) ; transition
  jour/nuit déclenchée par la visibilité du héros plutôt que par `animation-timeline`. L'animation d'introduction existante
  (une fois par session) est conservée.

## D-009 : Worker sans dépendance d'exécution (validée, 27/11/2026)

- **Contexte** : la mission cite `jose` (vérification des jetons Supabase) et `zod` (validation) pour le Worker, et
  demande de justifier toute dépendance. Node n'est pas installé sur le poste de Rayane : rien ne peut être installé,
  copié ni testé localement avec npm ; le Worker est testé dans GitHub Actions.
- **Options** : (1) `jose` + `zod`, regroupés par wrangler au déploiement ; (2) WebCrypto natif du runtime Workers et
  des validateurs écrits à la main, testés.
- **Choix** : (2). `worker/src/lib/auth.js` vérifie les JWT ES256/RS256 de Supabase avec le JWKS du projet (émetteur,
  audience, expiration, « alg: none » refusé) et la signature « Standard Webhooks » du hook d'e-mails ;
  `worker/src/lib/validate.js` reprend exactement les règles de `reservations.gs` (la feuille revalide tout).
- **Conséquences** : `package.json` n'a plus que des dépendances de développement (tests, lint, wrangler) ; aucun code
  tiers n'est exécuté en production ; Worker plus léger (temps CPU sous la limite de 10 ms du plan gratuit). Les tests
  `tests/worker/unit.test.js` couvrent les cas qu'aurait couverts `jose` (jeton expiré, autre émetteur, autre clé).

## D-010 : références et boîte de secours (validée, 27/11/2026)

- **Contexte** : la mission propose `CFS-R-…` pour les réservations ; le moteur Google Sheets (repris de Wisy et déjà
  testé) produit `CFS-AAAA-XXXXX` (réservation) et `CFD-AAAA-XXXXX` (demande).
- **Choix** : garder ces formats (lisibles au téléphone, sans 0/O ni 1/I) et ajouter `CFW-AAAA-XXXXX` pour une demande
  gardée dans la boîte de secours Supabase quand la feuille ne répond pas. La tâche planifiée la rejoue avec le même
  `requestId` (jamais de doublon) ; la feuille lui attribue alors sa propre référence `CFD-…`.
- **Conséquences** : la référence `CFW-…` donnée au visiteur figure dans l'e-mail de secours reçu par l'équipe et dans
  la ligne rejouée (colonne Message), ce qui permet de faire le lien.

## D-011 : réservation sans compte (validée, 27/11/2026)

- **Contexte** : la section 11 de la mission rattache au compte « les réservations faites sans compte avec la même
  adresse vérifiée » : réserver ne doit donc pas exiger de compte. Le moteur v2.0 l'exigeait (`userId` obligatoire).
- **Choix** : moteur v2.1 : `userId` facultatif. `listForUser` reçoit l'identifiant ET l'adresse vérifiée transmise par
  le Worker (lue dans le jeton Supabase, jamais envoyée par le navigateur) et ajoute les réservations sans compte faites
  avec cette adresse. Le paiement en ligne ne demande plus l'espace client.
- **Conséquences** : un particulier peut payer en ligne sans créer de compte ; une entreprise avec n° de TVA réserve sur
  facture. Tests : `tests/reservations.test.js` (« réservation SANS compte… »).

## D-012 : un seul fichier `.dev.vars` (validée, 27/11/2026)

- **Contexte** : le générateur Python (`--dev`) et `wrangler dev` lisent tous deux `.dev.vars`.
- **Choix** : un seul fichier, en deux parties : réglages du site (publics) et réglages du Worker (secrets compris),
  conforme au tableau 3.4 de la mission. Le générateur ne lit que ses propres clés, jamais un secret.
- **Conséquences** : `BASE_PATH` vide et explicite (`BASE_PATH= …`) l'emporte sur `.dev.vars`, pour construire le site
  servi à la racine par le Worker (`npm run dev`, `npm run deploy`).

## D-013 : comptes et paiement côté navigateur (validée, 27/11/2026)

- **Contexte** : phases 7 et 8. `supabase-js` 2.119.0 est déjà copié dans `site/src/assets/vendor/supabase.js`.
- **Choix** : `auth.js` (connexion par mot de passe, lien magique, Google en option, mot de passe oublié, double
  authentification TOTP, flux PKCE) et `account.js` (réservations lues dans la feuille par le Worker, certificats en
  liens signés de 5 minutes, profil, société, export, suppression, page admin) ; `supabase-js` chargé **seulement**
  sur les pages compte. Second gestionnaire : invitation enregistrée par le Worker après contrôle du propriétaire,
  acceptée à la connexion par l'adresse du jeton (`accept_company_invitations`). Certificats : seau Storage privé,
  dépôt par l'administrateur (rôle SQL + aal2). Paiement : `payment.js` lit l'état réel (`/api/payments/status`),
  jamais un paramètre de l'adresse ; relecture toutes les 3 s puis 15 s.
- **Conséquences** : le paiement en ligne et la réservation ne demandent pas de compte (D-011). Banc d'essai du
  parcours de paiement : `tests/browser/e2e.html?pay=1` (fausse page Mollie locale, webhook simulé).

## D-014 : assistant local d'abord, IA facultative (validée, 27/11/2026)

- **Choix** : cœur local déterministe (base générée depuis tout le site, recherche pondérée, gabarits par intention dans
  les 3 langues) ; IA seulement en reformulation, revalidée par le Worker avec sa propre copie de la base.
- **Conséquences** : zéro coût et zéro invention par défaut ; 65 questions évaluées (véracité 100 %). Le modèle Workers AI
  reste à choisir à l'activation (liste gratuite à revérifier).

## D-015 : grille de prix proposée et IA du chatbot activée (validée par Rayane, 27/11/2026)

- **Contexte** : Rayane demande des prix « professionnels et raisonnables » pour toutes les formations et une IA active
  pour répondre aux questions. Seules 4 formations avaient un prix dans le catalogue du client.
- **Choix** : (1) `site/content/tarifs.json` : 18 prix PROPOSÉS, alignés sur les tarifs publics belges (`docs/TARIFS.md`),
  appliqués seulement là où le client n'a pas de prix, affichés HTVA et TVAC, groupes en entreprise toujours sur devis ;
  désactivables (`CFS_PROPOSED_PRICES=0`). (2) IA : Workers AI, modèle `@cf/google/gemma-4-26b-a4b-it` cité par
  Cloudflare comme disponible sur le plan gratuit, appelé seulement quand le cœur local n'est pas sûr de lui, réponse
  revalidée (liens, montants) et repli local en cas d'erreur ou de quota atteint.
- **Conséquences** : grille validée par Rayane le 27/11/2026 (les durées « à préciser » restent à fournir). L'IA ne
  fonctionne qu'avec le Worker déployé (pas sur GitHub Pages, où le cœur local répond seul). Publication sans Node :
  workflow `deploy-cloudflare.yml` (bouton « Run workflow »).

## D-016 : l'IA rédige chaque réponse à partir des faits vérifiés, comme l'assistant Wisy Safety (27/11/2026)

- **Contexte** : Rayane veut un assistant « encore plus professionnel », sur le modèle de son site Wisy Safety (Claude
  derrière un serveur). Avec D-014/D-015, l'IA n'intervenait que si le cœur local doutait, sans mémoire de la
  conversation, avec un petit modèle gratuit.
- **Options** : (a) garder D-015 ; (b) Claude seul, sans garde-fous locaux ; (c) Claude rédige **chaque** réponse à
  partir de la réponse locale vérifiée, du fil de la conversation et des extraits recherchés par le Worker, avec
  revalidation et relais gratuit.
- **Choix** : (c). `CHATBOT_PROVIDER` = `claude`, modèle `claude-opus-5-5` (le plus capable ; `CHATBOT_MODEL` permet
  Sonnet ou Haiku), sortie JSON imposée par un schéma, invite système en cache, repli serveur en cas de refus
  (`server-side-fallback-2026-07-01`), effort bas (réponses rapides). Sans clé ou en cas d'échec : relais Workers AI
  (`@cf/google/gemma-4-26b-a4b-it`, gratuit), puis réponse locale. Intentions sensibles toujours en réponse fixe.
  Panneau : indicateur de frappe, mention IA sous chaque réponse rédigée par l'IA, avis anonyme utile / pas utile.
- **Conséquences** : aucune dépense tant que Rayane n'a pas ajouté `ANTHROPIC_API_KEY` (action payante qu'il décide,
  avec une limite de dépenses) ; ensuite environ 1 à 3 centimes de dollar par réponse, plafonné à 200 réponses par
  jour. Véracité inchangée : prix, dates, places et liens restent ceux de la base et de la feuille, revalidés par le
  Worker et par le navigateur. Le fil de la conversation (6 échanges, textes bornés) est envoyé à Anthropic pour la
  réponse : la mention « ne partagez pas de données personnelles » reste affichée sous le champ (docs/RGPD.md).
