# Agenda et affichage des places

**Aucune date de session ni aucun nombre de places n'est écrit dans le HTML** (contrôlé par `check_seo.py`) : tout
est lu au chargement par `site/src/assets/js/sessions.js` (`window.CfsSessions`, sans affichage) et affiché par
`sessions-ui.js` (tickets « permis de travail », fiches de session, prochaine session de l'accueil) et `agenda.js`
(calendrier mensuel, filtres, liste).

## Sources, dans l'ordre

1. **En direct** : `GET /api/sessions` (Worker), si `CFS_CONFIG.sessionsUrl` est configuré (`WORKER_API=1`) et répond
   en moins de 6 s. Places restantes réelles ; badge « Places mises à jour en direct ».
2. **Secours** : `sessions-data.js`, généré depuis `client/sessions.csv` par `import_client.py`. Dates et capacité
   seulement, **jamais de places restantes** ; mention « Dates indicatives : disponibilité à confirmer » ; la console
   indique la raison.

## Fraîcheur

| Couche | Durée |
|---|---|
| Apps Script (`CacheService`), invalidé à chaque écriture | 20 s |
| Worker (Cache API, par centre de données ; oublié après une réservation dans le centre local) | 30 s, `ETag` + 304 |
| Navigateur : relecture si l'onglet est visible | 45 s |
| Personne qui vient de réserver | immédiat (`remaining` de la réponse) |

Quand des places changent pendant la lecture : nouveau rendu, focus clavier conservé, annonce discrète pour les
lecteurs d'écran (« Places mises à jour. »), ticket brièvement mis en évidence (sans animation si « réduire les
animations » est activé). Événement `cfs:sessions` (detail : `sessions`, `live`, `changed`).

## États et textes (annexe B, clés `availability.*` de `site/content/ui.*.json`)

| État | Condition | Texte FR |
|---|---|---|
| `open` | restantes > seuil | « 9 places disponibles sur 10 » |
| `low` | 0 < restantes ≤ max(3 ; 20 % de la capacité) | « Dernières places : 3 sur 10 » ; « Dernière place » |
| `full` | 0 restante | « Complet » + bouton « M'inscrire sur la liste d'attente » |
| `closed` | clôture passée ou statut Fermée | « Inscriptions en ligne clôturées » |
| `on_request` | capacité inconnue | « Places sur demande » |

Le même seuil est calculé par le Worker (`lowThreshold`) et par le navigateur (`CfsSessions.lowThreshold`).

## Modifier

- Textes : `site/content/ui.{fr,nl,en}.json` puis `python3 site/build.py`.
- Couleurs et jauge : `site/src/assets/css/sessions.css`.
- Une session : **dans la feuille** (`GUIDE-FEUILLE.md`), jamais dans le code.
