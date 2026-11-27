# Guide de la feuille « Réservations – Centre CFS »

Pour l'équipe du Centre CFS. Tout se fait **dans la feuille Google**, avec le menu **« Centre CFS »** (en haut, à droite
de « Aide »). Le site lit la feuille toutes les 30 secondes environ : ce que vous changez ici apparaît sur le site
en moins d'une minute et demie.

> **Trois règles d'or**
> 1. Ne **jamais supprimer une ligne** (réservation, session, demande) : on annule avec le menu.
> 2. Ne **jamais modifier les colonnes grisées** (calculées : places prises, places restantes, montants).
> 3. En cas de doute : menu **Centre CFS › 🔎 Vérifier la cohérence**.

Version imprimable : ouvrir ce fichier sur GitHub, puis *Imprimer › Enregistrer en PDF* (ou `docs/GUIDE-FEUILLE.pdf`
quand il aura été généré, voir `A-COMPLETER.md`).

## Les onglets

| Onglet | À quoi il sert | Vous y touchez ? |
|---|---|---|
| **Formations** | nom, domaine, **prix HTVA**, durée, capacité par défaut, réservable oui/non | oui (prix, réservable) |
| **Sessions** | une ligne par date : formation, date(s), horaires, lieu, langue, **capacité**, publiée, statut | oui, surtout par le menu |
| **Réservations** | une ligne par réservation et par session, avec la référence `CFS-…`, le statut, les montants | non : par le menu |
| **Participants** | les noms des participants, puis les résultats et dates de validité des certificats | oui (résultats) |
| **Demandes** | contact, devis, salle, « être prévenu », questions de l'assistant (`CFD-…`) | oui (colonne Statut) |
| **Paiements** | historique Mollie (payé, échoué, à rembourser) | non |
| **Profils** | copie des comptes clients du site (lecture seule) | non |
| **File d'envoi** | les e-mails en attente, envoyés ou en échec | non |
| **Journal** | ce qui s'est passé (réservations, alertes, erreurs) | non |

## Je veux… je fais…

| Je veux… | Je fais… |
|---|---|
| **ajouter une session** | menu › ➕ Nouvelle session (formation, date, horaires, lieu, langue, **capacité**), puis cocher « Publiée » |
| **changer le nombre de places** | onglet Sessions, colonne **Capacité**. Les places restantes se recalculent seules (jamais en dessous des places déjà réservées : vérifiez avec 🔎) |
| **fermer les inscriptions en ligne** | sélectionner la session › menu › 🔒 Fermer les inscriptions (les inscriptions ferment de toute façon 48 h avant) |
| **annuler une session** | sélectionner la ligne › menu › ⛔ Annuler la session… : toutes les réservations sont annulées, chaque client reçoit un e-mail dans sa langue, les paiements à rembourser sont signalés |
| **prévenir d'un changement d'horaire** | modifier l'horaire, puis menu › 📣 Prévenir les inscrits… |
| **confirmer une réservation sur facture** | onglet Réservations, sélectionner la ligne « En attente (facture) » › menu › ✔ Confirmer… : le client reçoit « Réservation confirmée ». Sans confirmation, elle expire après 72 h et les places reviennent |
| **annuler une réservation** | sélectionner la ligne › menu › ✖ Annuler la réservation… (si elle était payée : rembourser dans Mollie) |
| **voir les participants d'une session** | sélectionner la session › menu › 📋 Liste des participants (onglet exportable en PDF ou Excel) |
| **traiter une demande** | onglet Demandes, répondre au client depuis info@ (le bouton « Répondre » de l'e-mail reçu s'adresse au visiteur), puis Statut = « Traitée » |
| **voir ce que le site affiche** | menu › 👁 Voir ce que le site affiche |
| **mettre à jour Google immédiatement** (données structurées) | menu › 🌐 Publier sur le site |
| **faire l'export comptable** | menu › 📤 Export comptable (mois précédent) |
| **tester l'envoi d'e-mails** | menu › ✉ Envoyer un e-mail de test (arrive dans info@, regarder aussi les indésirables) |

## Les statuts d'une réservation

| Statut | Places comptées ? | Ce qui se passe |
|---|---|---|
| En attente de paiement | oui, **30 minutes** | le client paie sur Mollie ; sinon « Expirée » |
| En attente (facture) | oui, **72 heures** | l'équipe confirme (menu ✔) ; sinon « Expirée » |
| Confirmée | oui | payée en ligne, ou confirmée par l'équipe |
| Demande | non | date à convenir, ou particulier sans paiement en ligne : l'équipe recontacte |
| Expirée / Annulée | non | les places sont revenues |

**« Remboursement à faire »** (colonne Paiement) : un paiement est arrivé alors que les places avaient été reprises.
Rembourser dans le tableau de bord Mollie, puis prévenir le client. Une alerte est envoyée à info@.

## Que faire si…

| Situation | Action |
|---|---|
| le site affiche « dates indicatives » | la feuille ne répond pas au site : prévenir Rayane (`docs/RUNBOOK.md`) |
| une session complète alors qu'il reste des places | une réservation en attente n'a pas encore expiré, ou capacité trop basse : 🔎 Vérifier la cohérence |
| un bandeau rouge « quota d'e-mails » | 200 e-mails gratuits par mois atteints : les e-mails attendent dans File d'envoi jusqu'au mois suivant |
| une ligne a été supprimée par erreur | *Fichier › Historique des versions* pour la retrouver, puis 🔎 |
