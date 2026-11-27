# Réservations et places en direct (chantier 1)

## Le principe

La feuille Google est la **seule** source des sessions, des places et des réservations. Les places restantes ne sont
jamais saisies : **places restantes = capacité − réservations qui comptent** (Confirmée, En attente de paiement non
expirée, En attente (facture) non expirée), recalculées à chaque lecture.

```
Navigateur ──GET /api/sessions──▶ Worker (cache 30 s) ──GET signé──▶ Apps Script (cache 20 s) ──▶ feuille
Navigateur ──POST /api/registrations──▶ Worker (Turnstile, limites, validation) ──POST signé « book »──▶ Apps Script
                                         (verrou → relecture → places suffisantes ? → écriture → { reference, remaining })
```

## Parcours d'une réservation

1. `/inscription/?formation=vca-base&session=<id>` : la session est présélectionnée ; « Il reste N places ».
2. Le navigateur envoie `POST /api/registrations` (requestId, session, participants, contact, facturation, mode de
   paiement, langue, champ piège, durée de saisie, jeton Turnstile). **Aucun montant** : il est ignoré s'il est envoyé.
3. Le Worker valide, puis choisit :
   - **entreprise avec n° de TVA belge valide** → `book` sur facture : places bloquées 72 h, e-mail « places bloquées »
     au client (équipe en copie cachée), l'équipe confirme dans la feuille ;
   - **paiement en ligne** (si activé) → `book` en ligne (30 min) → paiement Mollie (montant calculé par la feuille) →
     `attachPayment` → redirection ; le webhook relit le paiement → `confirmPayment` (idempotent) → e-mail « payée » ;
   - **sinon** (particulier sans paiement en ligne, ou date à convenir) → **demande** (onglet Demandes, `CFD-…`),
     aucune place bloquée, l'équipe recontacte.
4. La réponse contient `remaining` : le navigateur affiche tout de suite « 9 sur 10 » (`CfsSessions.apply`).

Codes d'erreur traduits : `FULL`, `NOT_ENOUGH` (avec le nombre restant), `CLOSED`, `NOT_FOUND`, `BUSY`, `INVALID`
(avec les champs), `RATE_LIMITED`, `CAPTCHA`, `PAYMENT`, `UNAVAILABLE`.

## Garanties (testées)

| Garantie | Test |
|---|---|
| jamais au-delà de la capacité (vérification et écriture sous verrou) | « concurrence : 20 réservations d'une place sur 5 places → exactement 5 » |
| dernière place disputée : une seule réussit | `tests/reservations.test.js` |
| tout ou rien sur plusieurs sessions | idem |
| même `requestId` = même référence, sans doublon | idem + `tests/worker/integration.test.js` |
| clôture 48 h avant (ou « Fin des inscriptions ») | idem |
| expiration 30 min / 72 h, places libérées | idem |
| paiement confirmé deux fois = une seule confirmation, un seul e-mail | idem |
| paiement tardif sans places : « Remboursement à faire » + alerte | idem |
| montant jamais lu dans la requête du navigateur | `tests/worker/unit.test.js`, `integration.test.js` |
| l'exemple de la mission : 10 → 9 sur 10 de bout en bout | `integration.test.js` et banc `tests/browser/e2e.html` |

Ces tests ne prouvent pas le comportement réel de Google (verrou entre exécutions parallèles, délais) : un test de
concurrence réel sur une session de test fait partie de la mise en production (phase 11).

## Réservation avec ou sans compte

Sans compte (D-011). Les réservations faites avec la même adresse e-mail apparaissent dans l'espace client quand
la personne crée son compte (adresse vérifiée par Supabase, transmise par le Worker, jamais par le navigateur).

## Liste d'attente

Session complète : bouton « M'inscrire sur la liste d'attente » → formulaire de contact prérempli (type « Être
prévenu », formation et session). La demande arrive dans l'onglet Demandes avec la session ; aucune place n'est prise.
Quand une place se libère, l'équipe contacte les personnes dans l'ordre d'arrivée (pas d'attribution automatique).

## Fichiers

`apps-script/reservations.gs` (moteur) · `worker/src/routes/sessions.js`, `forms.js`, `account.js` ·
`site/src/assets/js/sessions.js`, `sessions-ui.js`, `agenda.js`, `registration.js` · tests dans `tests/`.
