# Brancher les formulaires pas à pas (pour Rayane)

Toutes les demandes arrivent **à deux endroits** : une ligne dans la feuille Google (suivi) **et** un e-mail dans
info@centrecfs.be (réaction rapide). La ligne est **toujours écrite d'abord** : si l'e-mail échoue, rien n'est perdu.
Chaque étape se termine par une vérification ✅.

> Tant que le Worker n'est pas en service (site sur GitHub Pages), les formulaires préparent un e-mail pré-rempli
> adressé à `FORM_EMAIL` : rien n'est perdu non plus, mais rien n'arrive dans la feuille.

## Étape A : la feuille et le script Google (≈ 15 minutes)

1. Compte Google du Centre CFS : créer une feuille vide « Réservations – Centre CFS », partagée avec l'équipe seulement.
2. *Extensions › Apps Script* : remplacer le contenu par `apps-script/reservations.gs` et le manifeste par
   `apps-script/appsscript.json` (fuseau `Europe/Brussels`). Enregistrer.
3. *Paramètres du projet › Propriétés du script* : `HMAC_SECRET`, `EMAILJS_PUBLIC_KEY`, `EMAILJS_PRIVATE_KEY`,
   `EMAILJS_SERVICE_ID`, `EMAILJS_TEMPLATE_CLIENT`, `EMAILJS_TEMPLATE_EQUIPE`, `DEPLOY_HOOK_URL` (facultatif).
4. Exécuter `install` une fois et accepter les autorisations. Le menu « Centre CFS » apparaît.
5. *Déployer › Nouveau déploiement › Application Web* : exécuter en tant que **Moi**, accès **Tout le monde**.
   Copier l'adresse `/exec` (secrète).
6. ✅ Menu › 👁 Voir ce que le site affiche : les sessions publiées sont listées.
7. Mise à jour du script plus tard : *Gérer les déploiements › ✏ › Nouvelle version* (l'adresse ne change pas).

## Étape B : EmailJS (≈ 20 minutes)

Suivre `docs/README-EMAILJS.md`. ✅ Menu › ✉ Envoyer un e-mail de test → reçu dans info@.

## Étape C : relier le Worker

1. ```bash
   npx wrangler secret put RESERVATIONS_API_URL
   ```
   (l'adresse `/exec`)
2. ```bash
   npx wrangler secret put RESERVATIONS_HMAC_SECRET
   ```
   (**exactement** la même valeur que `HMAC_SECRET` du script), puis les clés EmailJS et Turnstile (`docs/SETUP.md`).
3. En local : les mêmes valeurs dans `.dev.vars`, puis `npm run dev`.
4. ✅ http://localhost:8787/api/health → `"sheet": true` ; http://localhost:8787/api/sessions → les sessions publiées.

## Étape D : tester chaque formulaire (messages marqués « TEST, ne pas traiter »)

| Test | Ce qu'on doit constater |
|---|---|
| Contact depuis `/contact/` | ligne « Nouvelle » dans Demandes · e-mail dans info@ · **« Répondre » s'adresse au visiteur** · référence `CFD-…` à l'écran |
| Contact en NL et en EN | idem, et la confirmation est dans la bonne langue |
| Contact **sans JavaScript** (désactivé dans le navigateur) | page de confirmation du Worker dans la bonne langue, avec la référence |
| Réservation sur facture (session de test, 10 places, entreprise avec n° de TVA) | ligne « En attente (facture) » · **l'agenda affiche 9/10** · e-mail au client, info@ en copie cachée |
| Réservation payée en mode test Mollie | « En attente de paiement » puis « Confirmée » · un seul e-mail |
| Paiement abandonné | après 30 min, « Expirée » ; la place revient (10/10) |
| Feuille débranchée (fausse adresse dans `.dev.vars`) | référence `CFW-…` · e-mail à l'équipe · rejeu dans la feuille après correction (tâche toutes les 10 min) |
| Robot (champ piège rempli) | réponse normale, rien dans la feuille, aucun e-mail |

Sans compte Cloudflare ni Node, le **banc d'essai du navigateur** rejoue ces parcours avec le vrai code du Worker et
le vrai moteur de la feuille (fausse feuille, e-mails simulés) : `tests/browser/e2e.html` (mode d'emploi en tête du fichier).

## Étape E : délivrabilité

SPF, DKIM et DMARC du domaine de la boîte connectée à EmailJS (`docs/README-EMAILJS.md`).

## Dépannage

| Symptôme | Cause probable | Solution |
|---|---|---|
| « Votre demande n'a pas pu être envoyée » partout | `RESERVATIONS_API_URL` ou secret HMAC différents entre le Worker et le script | recopier la même valeur des deux côtés, redéployer |
| La ligne arrive dans la feuille mais pas l'e-mail | EmailJS : clé privée absente, API non-navigateur désactivée, quota atteint | onglet File d'envoi (colonne Erreur) et Journal |
| Erreur 403 d'EmailJS | « Use Private Key » activé mais clé privée manquante ou fausse | recopier la clé privée (feuille et Worker) |
| E-mails en indésirables | SPF / DKIM / DMARC absents | enregistrements DNS |
| Les places ne bougent pas | session non « Publiée », ou cache | menu 👁 ; attendre 75 s au plus |
| « Session complète » alors qu'il reste des places | réservation en attente non expirée, ou capacité mal saisie | menu 🔎 Vérifier la cohérence |
| Le script a été modifié mais rien ne change | déploiement non mis à jour | *Gérer les déploiements › Nouvelle version* |

## Formulaires du site

| Formulaire | Page | Destination | Référence |
|---|---|---|---|
| Contact, devis, inscription (demande), salle, être prévenu / liste d'attente | `/contact/` | Demandes + e-mail équipe | `CFD-…` |
| Réservation | `/inscription/` | Réservations + Participants (places sous verrou) ; ou Demandes | `CFS-…` / `CFD-…` |
| Question transmise par l'assistant | panneau de l'assistant | Demandes (type Assistant) + e-mail équipe | `CFD-…` |
| Secours (feuille injoignable) | tous | Supabase `outbox_requests`, rejoué | `CFW-…` |
