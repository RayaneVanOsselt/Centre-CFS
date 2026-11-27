# EmailJS : tous les e-mails, côté serveur uniquement

Le site **n'appelle jamais EmailJS depuis le navigateur** (un modèle dont le destinataire est une variable,
déclenchable avec la seule clé publique, ferait du site un relais de spam). Les envois partent :
- du **Worker** (`worker/src/lib/services.js` › `sendEmail`) : demandes reçues (à l'équipe), e-mails de compte
  (hook Supabase), secours quand la feuille est injoignable ;
- de la **feuille** (`apps-script/reservations.gs` › File d'envoi) : confirmations, factures, paiements, annulations,
  changements d'horaire, rappels J-2, alertes.

## Créer le compte et les modèles (≈ 20 minutes)

1. Compte gratuit sur emailjs.com avec l'adresse du Centre.
2. *Email Services › Add New Service* : relier la boîte du Centre CFS (Gmail, Outlook / Microsoft 365 ou SMTP).
   Noter le **Service ID**.
3. *Email Templates* : créer **deux** modèles (le plan gratuit en autorise deux).

| Modèle | To | Reply-To | Bcc | Subject | Contenu |
|---|---|---|---|---|---|
| **CLIENT** (`EMAILJS_TEMPLATE_CLIENT`) | `{{to_email}}` | `info@centrecfs.be` | `{{bcc}}` | `{{subject}}` | `{{{html}}}` |
| **ÉQUIPE** (`EMAILJS_TEMPLATE_EQUIPE`) | `info@centrecfs.be` (**écrit en dur**, jamais une variable) | `{{reply_to}}` | — | `{{subject}}` | `{{{html}}}` |

   Les triples accolades `{{{html}}}` insèrent le HTML sans l'échapper (vérifier dans l'aperçu d'EmailJS) ; la
   version texte est disponible dans `{{text}}` si vous voulez l'ajouter. Tout le contenu est construit et échappé
   par nos serveurs, dans la langue du destinataire.
4. *Account › General* : noter la **Public Key** et la **Private Key**.
5. *Account › Security* : cocher **« Allow EmailJS API for non-browser applications »** et **« Use Private Key »**.
6. Ranger les valeurs :
   - Worker : `npx wrangler secret put EMAILJS_PRIVATE_KEY` ; `EMAILJS_PUBLIC_KEY`, `EMAILJS_SERVICE_ID`,
     `EMAILJS_TEMPLATE_CLIENT`, `EMAILJS_TEMPLATE_EQUIPE` dans `[vars]` de `wrangler.toml` ;
   - feuille : *Paramètres du projet › Propriétés du script* : les cinq mêmes valeurs.
7. ✅ Feuille › menu Centre CFS › ✉ Envoyer un e-mail de test : l'e-mail arrive dans info@ (regarder les indésirables).

## Délivrabilité

Vérifier **SPF, DKIM et DMARC** du domaine de la boîte connectée (outil gratuit : mxtoolbox.com). Sans eux, les
e-mails risquent d'arriver en indésirables. Sur le plan gratuit, EmailJS ajoute une mention en pied d'e-mail.

## Quota (200 par mois)

Compteur mensuel partagé (feuille + Worker, action signée `countEmail`), priorités P1 / P2 / P3, file d'envoi espacée
de 1,1 s, réessais (5 min, 15 min, 1 h, 6 h, 24 h) puis abandon et alerte. Estimation et seuils : `docs/QUOTAS.md`.

## Quel e-mail, à qui (mission 7.6)

| Événement | Modèle | Destinataire | Copie cachée | Priorité | Envoyé par |
|---|---|---|---|---|---|
| Demande (contact, devis, salle, être prévenu / liste d'attente, assistant, inscription sans place bloquée) | ÉQUIPE | info@ | — | P2 | Worker |
| Réservation sur facture reçue | CLIENT | le client | info@ | P1 | feuille |
| Réservation payée en ligne | CLIENT | le client | info@ | P1 | feuille |
| Réservation sur facture confirmée par l'équipe | CLIENT | le client | — | P1 | feuille |
| Annulation, changement d'horaire | CLIENT | chaque client | — | P1 | feuille |
| Compte : confirmation, lien magique, mot de passe oublié, changement d'adresse, invitation | CLIENT | l'utilisateur | — | P1 | Worker (hook Supabase) |
| Rappel J-2 | CLIENT | le client | — | P3 | feuille |
| Alertes (quota, remboursement à faire, demande non rejouée, e-mail en échec) | ÉQUIPE | info@ | — | P1 | feuille / Worker |

Les e-mails au client ne recopient jamais le message libre du visiteur ; ceux à l'équipe le contiennent, échappé.

## Dépannage

| Symptôme | Solution |
|---|---|
| Erreur 403 d'EmailJS | « Use Private Key » activé mais clé privée absente ou fausse : la recopier (Worker et feuille) |
| Ligne dans la feuille mais pas d'e-mail | onglet File d'envoi (colonne Erreur) et Journal ; quota atteint ? |
| E-mails en indésirables | SPF / DKIM / DMARC |
