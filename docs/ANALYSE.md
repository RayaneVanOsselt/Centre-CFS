# Analyse de l'existant (phase 0)

Établie le 27/11/2026 à partir du dépôt (`main` au commit `444124e`), du dossier `client/`, de l'ancien site en ligne
(29 adresses du sitemap de centrecfs.be) et du dépôt de référence Wisy Safety (`4e20eb3`, consulté en lecture seule).

## 1. En bref

- **Le dépôt n'est pas au point de départ décrit par la mission.** Le dossier `sources/` du zip a déjà été restructuré en
  `site/` (commits `b268d25` et `07d9024`), en même temps qu'une refonte « v2 » : trois langues, table des routes,
  moteur Google Sheets signé HMAC, 25 tests du moteur. Une partie des phases 1 et 5 est donc déjà faite (section 3).
- **Le site est publié sur GitHub Pages** depuis le 26/11/2026 (`https://rayanevanosselt.github.io/Centre-CFS/`, non
  indexé). Toutes les fonctions qui demandent un serveur sont désactivées par des options, et les formulaires préparent
  un e-mail (destinataire temporaire : `FORM_EMAIL`). La mission vise un **Worker Cloudflare** : décision à prendre au
  plus tard en phase 4 (`DECISIONS.md`, D-001).
- **Aucune information de l'ancien site n'a disparu sur les points clés** : prix, durées, horaires, examens, validités,
  bases légales, coordonnées, lieux, FAQ, partenaires, programme VCA (18 thèmes). Des **détails** ont été résumés,
  surtout l'article AKT (historique de l'entreprise) et certains programmes (harnais, nacelle, produits dangereux).
  Liste complète : `docs/ANCIEN-SITE-ECARTS.md` (153 lignes à relire en phase 1).
- **Trois incohérences dans les sources** sont à trancher par le Centre CFS : année de création (2012 ou 2013), durée de
  l'initiation aux premiers soins (2 h ou 8 h), et publication des noms de l'équipe cités dans l'article AKT.
- Il manque au dépôt le Worker, la configuration Supabase, la CI de tests et plusieurs scripts que `package.json`
  appelle (section 6).

## 2. Historique du dépôt

| Commit | Contenu |
|---|---|
| `c81272b` · `1bd7365` | Site v1 du plan de refonte : 48 pages HTML en français, formulaire PHP, générateur `sources/build.py` |
| `b268d25` | Restructuration `sources/` → `site/`, moteur Google Sheets (`apps-script/reservations.gs`), tests Node du moteur |
| `07d9024` | Site v2 : trois langues (`fr.py`, `nl.py`, `en.py`, `routes.py`, `ui.*.json`), import des fichiers client, pages compte |
| `47e8898` (PR n° 2) | Publication GitHub Pages : chemin de base, scripts manquants (sessions, agenda, formulaires, inscription), options |

Le rendu v1 n'est plus la référence : la v2 est une refonte voulue. **La référence de rendu pour les phases suivantes est
le site publié le 26/11/2026** (147 pages, contrôlées : 0 lien cassé, 0 erreur de console, 375 à 1366 px).

## 3. État de chaque brique

| Brique | État | Fichiers | Écart avec la mission |
|---|---|---|---|
| Générateur | ✅ 147 pages (3 × 47 indexables + inscription + 404), sitemap multilingue, `hreflang`, JSON-LD, CSP en `<meta>` | `site/build.py` | Pas de minification (la mission la croit présente : `rcssmin`/`rjsmin` absents) ; un seul fichier de 1 500 lignes |
| Contenus FR / NL / EN | ✅ 22 formations, 8 domaines, 11 questions de FAQ, 4 articles, pages légales (brouillons) | `site/content/` | Traductions NL/EN à relire (`_meta.review: pending`) ; détails de l'ancien site à reprendre (section 5) |
| Routes traduites | ✅ table unique, URL françaises inchangées | `site/content/routes.py` | Conforme |
| Import des fichiers client | ✅ contrôle, rapport, données d'installation de la feuille, fichier de secours | `site/tools/import_client.py` | Conforme à la phase 0 ; **tests ajoutés** (`site/tests/`, 24 cas) ; défaut corrigé : « 17h » était refusé |
| Contrôles | ✅ liens, traductions | `site/tools/check_links.py`, `check_i18n.py` | `check_seo.py`, `build_kb.py`, `optimize_images.py`, `render_hero_poster.py` à écrire (phases 2, 3, 9, 10) |
| Moteur Google Sheets | ✅ v2.0.0 : 9 onglets, réservation sous verrou, `requestId`, clôture 48 h, paiement en ligne et facture, demandes, file EmailJS avec quota et priorités, rappels J-2, sauvegardes, menu | `apps-script/reservations.gs` (2 324 lignes) | Pas d'onglet **Réglages**, pas de **liste d'attente**, références `CFS-`/`CFD-` au lieu de `CFS-R-`/`CFS-D-`/`CFS-W-`, enveloppe signée différente de l'annexe C (D-004) |
| Tests du moteur | ✅ 25 tests (vrai script sur fausse feuille) | `tests/reservations.test.js`, `tests/helpers/gas-fake.js` | **Jamais exécutés en CI** ; Node absent sur le poste de Rayane |
| Sessions, agenda, inscription | ✅ lecture du fichier de secours, calendrier, tickets, jauge, demande d'inscription | `site/src/assets/js/sessions*.js`, `agenda.js`, `registration.js` | Seuil « dernières places » à aligner (max(3 ; 20 %)) ; pas de relecture toutes les 45 s ; pas d'API `/api/sessions` |
| Formulaires | ⚠ e-mail pré-rempli (site statique) | `forms.js` | La mission veut feuille + EmailJS via le Worker, sans JavaScript aussi (phase 6) |
| Worker Cloudflare | ❌ absent | — | Phase 4 |
| Supabase (comptes) | ❌ absent (pages compte prévues dans `build.py`, désactivées) | `site/src/assets/vendor/supabase.js` | Phase 4 et 7 ; bibliothèque à ranger dans `vendor/supabase-js/<version>/` avec sa licence |
| Paiement Mollie | ❌ absent (le moteur le prévoit) | — | Phase 8 |
| Chatbot | ❌ absent | — | Phase 9 |
| 3D, direction artistique, images | ❌ aucune photo ; images de partage en français seulement | `site/src/assets/img/og/` | Phases 2 et 3 ; `site/tools/render_assets.py` est un reste de la v1 qui ne fonctionne plus (importe `content.py`) |
| Publication | ✅ GitHub Actions → GitHub Pages, contrôles bloquants | `.github/workflows/pages.yml` | Mission : Cloudflare Workers (D-001) |

## 4. Inventaire des informations du Centre CFS (section 4 de la mission)

| Information | Où elle est dans le site | État |
|---|---|---|
| Nom, accroche, téléphone, e-mail, LinkedIn | `content/common.py` (`SITE`), `fr.py` (`SITE`) | ✅ |
| Numéro BCE, forme juridique, TVA | `common.py` : `bce: None` | ❌ à fournir (mentions légales) |
| Fermeture du 24/12 au 3/1, reprise le lundi 4/1 | bandeau automatique (`closure_from`, `closure_until`) | ✅ (masqué après le 4/1/2027) |
| Formateurs conseillers en prévention niveau 1 ou 2, SIPPT, depuis 2014 | `fr.py` (accueil, FAQ, le centre) | ✅ |
| Prix HTVA | `client/formations.csv` → `client_data.json` | ✅ 4 prix sur 22, le reste « Sur devis » |
| Fin des chèques-formation au 30/08/2026 | FAQ générale | ✅ (la règle transitoire « suivies avant le 15/09/2026 » de l'ancien site est périmée : non reprise) |
| 11 langues de formation | `fr.py` (`LANGUES`), `common.py` (`LANG_CODES`, salutations) | ✅ |
| Secteurs (bâtiment, industrie, électricité, espaces verts, télécoms, agroalimentaire) | `fr.py` (`SECTEURS`) | ✅ |
| Équipement à apporter (S3, vêtements de travail, carte d'identité) | `fr.py` (`EPI_PREREQ`, FAQ) | ✅ |
| Engis, Charleroi (CEME), en entreprise ; itinéraires | `common.py` (`LIEUX`), `fr.py` (`LIEUX`) | ✅ ; accès, parking, transports : à fournir |
| Trois salles (10, 15, 25 places, écran 4K, Wi-Fi) | `common.py` (`SALLES`), `client/salles.csv` | ✅ ; tarifs vides → « Sur demande » |
| 22 formations, 8 domaines (annexe A) | `fr.py` (`FORMATIONS`, `DOMAINES`), `common.py` | ✅ conforme à l'annexe A ; durées absentes pour 13 formations |
| Partenaires | `fr.py` (`PARTENAIRES`) : texte seulement | ✅ ; logos : autorisation écrite à fournir |
| FAQ générale (10 questions dans la mission) | `fr.py` (`FAQ_GENERALE`) | ✅ 11 questions (une en plus : « Comment réserver une place ? ») |
| 4 articles, URL historique de l'article AKT | `fr.py` (`ARTICLES`), `routes.py` | ✅ ; **l'article AKT est très résumé** (2 paragraphes au lieu du portrait complet) |
| Sessions à venir | `client/sessions.csv` → fichier de secours ; jamais dans le HTML | ✅ identiques à l'ancien site (les sessions du 23/11 sont passées) ; **capacités vides** |
| Horaires d'ouverture | — | ❌ à fournir |
| Réseaux sociaux autres que LinkedIn | — | ❌ à fournir (Instagram, Facebook, TikTok) |

## 5. Comparaison avec l'ancien site (centrecfs.be)

### Adresses

Les 29 adresses du sitemap de l'ancien site (relevé du 27/11/2026) :

| Ancienne adresse | Nouvelle adresse | État |
|---|---|---|
| `/`, `/formations/`, `/agenda/`, `/contact/` | identiques | ✅ |
| 22 fiches `/formations/<slug>/` | identiques | ✅ |
| `/centre-cfs-former-aujourdhui-pour-prevenir-demain/` (article AKT) | identique | ✅ |
| `/blog/` | `/actualites/` | ⚠ redirection 301 prévue dans `_redirects` (Cloudflare) ; **sans effet sur GitHub Pages** (404) |
| `/uncategorized/` (catégorie WordPress) | aucune | ⚠ à rediriger vers `/actualites/` (à ajouter en phase 4) |

### Contenus

Le relevé ligne par ligne (`docs/ANCIEN-SITE-ECARTS.md`) montre surtout des **reformulations**. Les informations
réellement absentes du nouveau site, à reprendre en phase 1 :

- **Article AKT** : historique (création en 2013 sous le nom Dominique Cornet SPRL, nom CFS moins d'un an après, reprise
  en 2020 par Christian Guyot, reprise en mars 2026 par Julie, arrivée de l'Office Manager et de Xavier Vercruysse),
  activités, mission. Noms de personnes : publication à confirmer par le Centre CFS.
- **Harnais et nacelle** : références réglementaires (directives 2001/45/CE, 89/686/CEE, 89/656/CEE ; loi du 4/08/1996
  art. 5 ; A.R. du 27/03/1998 art. 8 et 9 ; A.R. du 13/06/2005 ; A.R. du 31/08/2005) et détail des exercices pratiques
  (points d'ancrage, deux points de contact, rangement de la corde, nœuds en huit). Les références européennes de 1989 sont
  anciennes (la directive 89/686/CEE a été remplacée par le règlement (UE) 2016/425) : **à vérifier avant reprise**.
- **Conseiller en prévention** : classement des entreprises en groupes A à D, accent sur les échanges entre participants,
  attestation de participation pour qui ne passe pas l'examen.
- **Produits dangereux** : questions concrètes (cancérigènes, gants, stockage, produits de nettoyage et phytosanitaires).
- **Secourisme de base, ergonomie, amiante, BA4 / BA5, DEA** : objectifs détaillés et publics plus précis.
- **VCA Base** : avantages du certificat (employabilité, accès aux marchés).
- **Accueil** : pédagogie par « exemples réels, vidéos et mises en situation ».

### Incohérences entre les sources (à trancher, voir `A-COMPLETER.md`)

| Sujet | Source 1 | Source 2 |
|---|---|---|
| Création du Centre | Données structurées du site : `foundingDate` 2012 (`common.py`, d'après « partenaire de Technifutur depuis 2012 ») | Article AKT : « Fondée en 2013 » |
| Initiation aux premiers soins | Ancien site : titre « Programme (8h) » | Ancien site et catalogue : « durée de 2H00 » (retenu) |
| Examen VCA Base | Ancien site : « certificat agréé » | Mission : n'affirmer aucun agrément sans preuve |

## 6. Fichiers attendus mais absents

- Appelés par `package.json` : `scripts/dev.js`, `scripts/mock-sheet.js`, `scripts/eval-chatbot.js`, `scripts/guide-pdf.js`,
  `playwright.config.js`, configuration ESLint, `wrangler.toml`, `worker/`.
- Cités par la documentation ou le script Google : `docs/SETUP.md`, `docs/README-RESERVATIONS.md`, `docs/GUIDE-FEUILLE.md`.
- Fournis normalement par Rayane : `PROMPT_CLAUDE_CODE.md` (la mission a été collée dans la conversation),
  `GUIDE-INSTALLATION-EMAILJS.md`, `client/cgv.md`, `client/ancien-logo.png`, photos, logos, témoignages.

## 7. Ce qui est repris de Wisy Safety, et comment

Dépôt consulté : `README-RESERVATIONS`, `README-FORMULAIRES`, `README-ASSISTANT`, `README-AGENDA`, `README-SESSIONS`,
`image-sources`. Le moteur `reservations.gs` du Centre CFS en est déjà une adaptation (en-tête du fichier).

| Élément Wisy | Repris pour le Centre CFS | Adaptation |
|---|---|---|
| Feuille Google source unique, places recalculées, verrou, `requestId`, tout ou rien, clôture 48 h | ✅ déjà dans `reservations.gs` | Appel par le Worker uniquement (Wisy : navigateur → script) |
| Statuts Confirmée / En attente / Annulée / Expirée / Demande | ✅ | + « En attente de paiement » (Mollie) et « En attente (facture) » ; + liste d'attente à ajouter |
| Menu de l'équipe, « Installer / réparer », guide imprimable | ✅ menu ; ❌ guide | `GUIDE-FEUILLE.md` + PDF en phase 5 |
| Fausse feuille Google pour les tests | ✅ `tests/helpers/gas-fake.js` | À exécuter en CI |
| Calendrier, pastilles « 9/10 », fiche, jauge d'une case par place, fichier de secours sans places restantes | ✅ `sessions-ui.js`, `agenda.js` | Relecture toutes les 45 s et API `/api/sessions` en phase 5 |
| Formulaires → onglet Demandes + e-mail, « merci » seulement si `ok`, champs gardés en cas d'échec, limites 5 / 40 / 150 | ⚠ partiel (e-mail pré-rempli) | Phase 6 : via le Worker, EmailJS côté serveur (Wisy : MailApp + EmailJS navigateur) |
| Assistant en deux couches (cœur local déterministe + IA facultative), lanceur chargé à la demande | ❌ | Phase 9 : base générée depuis tout le site, réponses en 3 langues, IA via le Worker (Wisy : Edge Function Supabase) |
| Registre de provenance des images, originaux et dérivés | ❌ | Phase 2 : AVIF + WebP, point focal, textes alternatifs en 3 langues |
| Limites connues documentées honnêtement | ✅ principe | Chaque README de la mission aura sa section « limites » |

À ne pas reprendre : mascotte de l'assistant (visuel propre au Centre CFS), Outlook / Microsoft 365, avis clients
(pas de témoignage sans accord écrit).

## 8. Écarts techniques entre le code existant et la mission

| Sujet | Existant | Mission | Proposition |
|---|---|---|---|
| Hébergement | GitHub Pages (statique) | Cloudflare Workers (site + `/api/*`) | D-001, à décider en phase 4 |
| Enveloppe signée vers Apps Script | `{ ts, nonce, sig, payload }`, signature de `ts.nonce.payload`, nonce à usage unique | `{ ts, sig, body }`, signature de `ts.body` | Garder l'existant (anti-rejeu en plus) : D-004 |
| Nom du secret dans les propriétés du script | `RESERVATIONS_HMAC_SECRET` | `HMAC_SECRET` | Accepter les deux noms en phase 5, documenter un seul nom dans `SETUP.md` |
| Références | `CFS-AAAA-XXXXX`, `CFD-AAAA-XXXXX` | `CFS-R-…`, `CFS-D-…`, `CFS-W-…` | Aligner en phase 5 (avant toute vraie réservation) |
| Identifiant de session | `2026-12-10-vca-base-charleroi` | `vca-base-2026-12-10-charleroi` | Aligner en phase 5 (avant la mise en service de la feuille) |
| Seuil « dernières places » | max(2 ; 20 % arrondi au-dessus) dans `sessions.js` | max(3 ; 20 %), réglable dans l'onglet Réglages | Phase 5 |
| Réglages modifiables par l'équipe | constantes dans `CONFIG` | onglet **Réglages** | Phase 5 |
| Bibliothèques | `vendor/supabase.js` | `vendor/<nom>/<version>/` + licence | Phase 4 |
| Minification | aucune | CSS et JS minifiés | Phase 2 (dépendance Python à valider, ou minification simple maison) |
| Formulaires sans JavaScript | non (JavaScript requis) | oui (`method="post"` vers le Worker) | Phase 6 |

## 9. Outils du poste de travail

Python 3.12 est présent ; **Node.js, npm, Playwright et la Supabase CLI ne le sont pas**. Les tests Node existants ne
peuvent donc tourner qu'en CI tant que Node 22 n'est pas installé (`A-COMPLETER.md`). Les tests Python tournent avec
`python3 -m pytest site/tests -q` (pytest à installer : `python3 -m pip install pytest`).

## 10. Échec « Syntaxe JavaScript » en CI (27/11/2026)

- **Constat** : l'étape `npm run check:js` (Node 22, `node --check`) échouait sur GitHub alors que le contrôle local
  (JavaScriptCore) passait.
- **Cause** : `site/src/assets/js/package.json` (présent depuis le premier commit) déclarait `"type": "commonjs"`. Node lisait
  donc `assistant/*.js`, `search/search.js` et `hero-3d.js` comme des scripts CommonJS et refusait leurs `import`/`export` ;
  les tests Node qui importent `assistant/responder.js` et `validation.js` (Worker, évaluation du chatbot) étaient touchés
  de la même façon. Le contrôle local, lui, repliait sur la syntaxe « script » sans lire les `package.json`.
- **Dépendances vérifiées** : aucun code Node ne charge ces scripts par `require` ; `site/build.py` ne publie pas ce fichier
  (copie avec `ignore_patterns("package.json")`) ; les navigateurs l'ignorent ; tous les scripts du dossier sont valides
  comme modules ES stricts.
- **Correction** : fichier supprimé (le `package.json` racine, `"type": "module"`, s'applique) ; `scripts/check-js-syntax.sh`
  lit désormais chaque fichier comme Node (package.json le plus proche, sans repli). Contre-épreuve : avec l'ancien fichier,
  le contrôle local signale les 7 mêmes fichiers.
