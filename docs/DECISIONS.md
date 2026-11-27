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
