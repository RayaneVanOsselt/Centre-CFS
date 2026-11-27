# RGPD : registre simplifié des traitements

> Document de travail technique. La politique de confidentialité publiée (3 langues) et les durées de conservation
> sont à **valider par le Centre CFS** (données de `client/infos-entreprise.md` ; manques listés dans `A-COMPLETER.md`).

## Traitements

| Traitement | Données | Base légale | Où | Conservation (proposée, à valider) |
|---|---|---|---|---|
| Demandes (contact, devis, salle, « être prévenu », question transmise par l'assistant) | nom, e-mail, téléphone, société, message, page d'origine | mesures précontractuelles / intérêt légitime | feuille Google (onglet Demandes) | 3 ans puis anonymisation automatique |
| Réservations et participants | client, société, TVA, adresse de facturation, participants, montants | contrat | feuille (Réservations, Participants, Paiements) | 7 ans (comptabilité) ; données personnelles anonymisées à la suppression du compte |
| Paiement | référence Mollie, statut, montant | contrat | Mollie (sous-traitant), feuille | selon obligations comptables |
| Comptes | e-mail, nom, téléphone, langue, société, consentement infolettre | contrat | Supabase (UE) | jusqu'à suppression du compte (libre-service) |
| Certificats | nom du participant, formation, dates de validité | contrat / obligation légale de l'employeur | Supabase (fichiers privés, liens de 5 min) | durée de validité + 1 an |
| Sécurité | empreinte salée de l'adresse IP (jamais l'adresse), journaux | intérêt légitime | Supabase (`rate_limits`, `audit_log`) | 2 jours (limites) ; 1 an (journal) |
| Chatbot (facultatif) | question expurgée, langue, intention | intérêt légitime | Supabase (`chat_logs`) | 90 jours (purge automatique) |
| Rédaction des réponses par l'IA | question et 6 derniers échanges de la conversation (texte seul, bornés), langue | intérêt légitime | transmis pour la réponse à Cloudflare Workers AI ; rien n'est stocké par le site | durée de la requête (conservation chez le fournisseur selon son contrat, à vérifier à l'activation) |
| Mesure d'audience | aucune donnée personnelle, aucun cookie | — | Cloudflare Web Analytics | — |

## Sous-traitants

Google (feuille, Apps Script, Drive), Cloudflare (hébergement, Worker, Turnstile, Web Analytics), Supabase (comptes,
UE), EmailJS et le fournisseur de la boîte mail connectée, Mollie (paiement), et, **seulement s'il est activé**, le
fournisseur de l'IA du chatbot (Cloudflare Workers AI). Un compte Google Workspace est préférable pour la
feuille (contrat de traitement), ce que n'offre pas un Gmail gratuit.

## Droits des personnes

- **Export** : *Mon compte › Exporter mes données* (`GET /api/account/export`, JSON : profil, sociétés, certificats, réservations).
- **Suppression** : *Mon compte › Supprimer mon compte* (adresse à confirmer) ; réservations liées à une facture
  anonymisées et conservées pour la comptabilité (`anonymizeUser`).
- Sans compte : demande à info@centrecfs.be ; l'équipe utilise le menu de la feuille.
- Autorité de protection des données : www.autoriteprotectiondonnees.be.

## Cookies

Aucun cookie de suivi. Supabase (pages compte seulement) garde la session dans le stockage local du navigateur :
nécessaire au service demandé, sans bannière. Turnstile : cookie technique de sécurité. À revérifier avant la mise en
ligne et à noter dans la page Cookies.

## Minimisation

La feuille ne contient que l'utile ; la liste publique des sessions ne contient **aucune** donnée personnelle (test
automatique) ; la page de retour du paiement non plus ; l'onglet Profils n'est qu'un miroir minimal en lecture seule.
