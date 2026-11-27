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
