# Plan de travail par phases

Mission : `PROMPT_CLAUDE_CODE.md`, section 18. Chaque phase se termine par un **arrêt pour validation** (« OK phase
suivante »). Les cases indiquent ce qui existe déjà dans le dépôt au 27/11/2026 (voir `ANALYSE.md`).

| Phase | Contenu | Déjà fait | Reste à faire | Ce qu'il faut de Rayane avant de commencer |
|---|---|---|---|---|
| **0** Analyse ✅ | `CLAUDE.md`, analyse, plan, à compléter, import client | Restructuration `site/`, `import_client.py` | — (cette livraison) | Valider ce plan et les décisions D-001 à D-005 |
| **1** Contenus et trilingue ✅ | Toute la section 4, routes, langues, `hreflang`, sitemaps, `check_i18n.py`, traductions à relire | Trois langues, routes, `hreflang`, sitemap, `check_i18n.py` | Reprendre les détails de l'ancien site (`ANCIEN-SITE-ECARTS.md`), pages Financement, Langues, Accessibilité, Cookies ; sitemap index par langue ; `TRADUCTIONS-A-RELIRE.md` | Réponses aux incohérences (2012 ou 2013, noms de l'équipe) |
| **2** Direction artistique et pages riches | `DIRECTION-ARTISTIQUE.md` validé **avant** le code, composants, gabarits, images, registre | Charte, pictogrammes, tickets « permis » | Tout le reste, dont le traitement des images (Pillow à installer) | Valider la direction artistique ; photos du client s'il y en a |
| **3** Héros 3D | Three.js copié, affiche statique, replis, budgets | — | Tout | — |
| **4** Infrastructure | Worker + assets statiques, en-têtes, redirections, cron ; Supabase ; `SETUP.md`, `QUOTAS.md` ; CI | Workflow de publication GitHub Pages | Tout ; ranger les bibliothèques dans `vendor/<nom>/<version>/` | **Décision D-001** (hébergement) ; comptes Cloudflare et Supabase ; Node 22 installé |
| **5** Agenda et réservations | Section 6 complète, API `/api/sessions`, guides de la feuille | Moteur Google Sheets v2 (25 tests), calendrier, tickets, jauge | Onglet Réglages, liste d'attente, références `CFS-R-…`, identifiants de session, seuil max(3 ; 20 %), relecture 45 s, client HMAC du Worker, `README-AGENDA`, `README-RESERVATIONS`, `GUIDE-FEUILLE` (+ PDF) | Compte Google du Centre CFS ; capacités des sessions |
| **6** Formulaires | Section 7, secours Supabase, `BRANCHEMENT-FORMULAIRES.md` | Validation côté navigateur, e-mail pré-rempli, `submitContact_` dans le moteur | Routes du Worker, formulaires sans JavaScript, EmailJS côté serveur, rejeu | Compte EmailJS (guide `GUIDE-INSTALLATION-EMAILJS.md`) |
| **7** Comptes | Section 11 + e-mails d'authentification | Gabarits des pages compte dans `build.py` | Tout | Projet Supabase (région UE) |
| **8** Paiement | Section 12 | Statuts et confirmation dans le moteur, calcul des montants | Mollie via le Worker, page de retour, CGV | Compte Mollie du Centre CFS (mode test) ; avis du comptable sur la TVA |
| **9** Chatbot | Section 8 | — | Tout (base générée, recherche, réponses, 60 questions) | Choix du fournisseur IA (par défaut : aucun, cœur local) |
| **10** SEO, rappels, tâches | Section 10 | Données structurées de base, rappels J-2 et sauvegardes dans le moteur | `check_seo.py`, docs SEO, guides en brouillon, tâches planifiées testées | Validation des guides par le Centre CFS |
| **11** Vérification et mise en production | Audit complet, `RAPPORT-FINAL.md`, mise en ligne | — | Tout | Accord explicite pour chaque étape publique |

## Ordre conseillé et dépendances

- Les phases 1 à 3 ne demandent **aucun compte** : elles peuvent avancer pendant que Rayane crée les comptes.
- La phase 4 conditionne les phases 5 à 9 : sans Worker, ni API, ni formulaires reliés à la feuille, ni comptes, ni paiement.
- Tant que la décision D-001 n'est pas prise, chaque livraison reste publiable sur GitHub Pages (aperçu non indexé),
  avec les fonctions serveur désactivées : le site ne contient jamais de lien cassé.

## Contrôles communs à chaque phase

`python3 site/build.py` · `python3 site/tools/check_i18n.py` · `python3 site/tools/check_links.py` ·
`python3 -m pytest site/tests -q` · `npm test` (Node 22) · vérification dans le navigateur : 0 erreur de console,
mise en page de 360 à 1440 px.
