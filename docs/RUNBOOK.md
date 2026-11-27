# Exploitation et dépannage (runbook)

## Vérifier l'état en 30 secondes

1. `https://centrecfs.be/api/health` : `sheet`, `email`, `supabase`, `payment` à `true` pour ce qui est branché.
2. Feuille › menu *Centre CFS › État* : onglets, tâche automatique, quota d'e-mails, file d'envoi.
3. Cloudflare › Workers › centre-cfs › *Logs* (erreurs) et *Metrics*.

## Pannes courantes

| Symptôme | Cause probable | Action |
|---|---|---|
| L'agenda affiche « dates indicatives » | feuille injoignable ou signature refusée | `/api/health` ; Journal de la feuille (« Appel refusé ») ; vérifier que `HMAC_SECRET` (feuille) = `RESERVATIONS_HMAC_SECRET` (Worker) ; redéployer l'application Web si le script a changé |
| Formulaire : « service momentanément indisponible » | feuille + boîte de secours indisponibles | vérifier Supabase (pause ?), relancer le projet ; les demandes CFW- en attente sont rejouées toutes les 10 min |
| E-mail d'alerte « Demande non rejouée depuis 24 h » | feuille injoignable depuis 24 h | comme ci-dessus ; la demande est dans Supabase (`outbox_requests`) |
| Plus aucun e-mail | quota EmailJS atteint, clé privée changée | onglet File d'envoi (« Quota atteint »), compte EmailJS |
| Paiement reçu mais réservation « Expirée » | paiement tardif après expiration | la feuille confirme s'il reste des places ; sinon « Remboursement à faire » + alerte : rembourser dans Mollie |
| Supabase en pause | 7 jours sans activité (cron arrêté ?) | relancer le projet dans le tableau de bord ; vérifier *Triggers* du Worker |

## Sauvegardes et restauration

- **Chaque semaine** (tâche de la feuille) : copie de la feuille et export JSON des profils dans un dossier Drive privé,
  8 copies gardées.
- **Restaurer la feuille** : ouvrir la copie voulue dans Drive › *Fichier › Créer une copie* ; dans la copie,
  *Extensions › Apps Script* (le script est copié avec la feuille), redéployer l'application Web, mettre la nouvelle
  adresse `/exec` dans le Worker (`npx wrangler secret put RESERVATIONS_API_URL`), vérifier `/api/health`.
- **Restaurer Supabase** : les migrations recréent le schéma (`npx supabase db push`) ; les profils se réimportent
  depuis l'export JSON (éditeur SQL, `insert … select from json_populate_recordset`). Les comptes eux-mêmes
  (mots de passe) ne sont pas exportables : les personnes refont « mot de passe oublié ».
- **Test de restauration** : à faire une fois avant la mise en ligne, sur une copie, et à noter ici (date, durée).

## Déploiement et retour arrière

- Publier : `npm run deploy` (construit le site en mode Worker puis publie). **Uniquement avec l'accord de Rayane.**
- Revenir à la version précédente : Cloudflare › Workers › centre-cfs › *Deployments* › *Rollback*.
- Le script Google se redéploie depuis *Déployer › Gérer les déploiements* (nouvelle version, même adresse).

## Tâches planifiées

| Où | Quand | Quoi |
|---|---|---|
| Worker | toutes les 10 min | rejeu de la boîte de secours, alerte après 24 h, activité Supabase |
| Feuille (`tick`) | toutes les 10 min | expiration des réservations non payées (30 min) et sur facture (72 h), file d'envoi, rappels J-2, recyclages, sauvegarde hebdomadaire, purge des anciennes demandes |
| GitHub Actions | chaque nuit (aperçu GitHub Pages) | reconstruction : les sessions passées disparaissent des données structurées |
