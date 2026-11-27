# Quotas des services gratuits et conséquences

Chiffres repris de la mission (section 2.1), **à revérifier dans la documentation officielle** au moment de la mise en
service (les offres gratuites changent). Dernière relecture de ce document : 27/11/2026.

| Service | Limite du plan gratuit | Ce que fait le projet pour rester dedans |
|---|---|---|
| Cloudflare Workers | 100 000 requêtes/jour, 10 ms de CPU par requête | Site statique servi sans exécuter le Worker (`run_worker_first = ["/api/*"]`) ; aucune image ni PDF générés ; aucune dépendance (D-009) ; cache de 30 s sur `/api/sessions` |
| Cloudflare KV | 1 000 écritures/jour | **Pas de KV** : cache par la Cache API, limites de débit dans Supabase (`rate_hit`) |
| Workers AI | 10 000 « neurons »/jour ; certains modèles réservés au plan payant | IA du chatbot avec un modèle du plan gratuit (D-017) ; questions fixes sans IA ; plafond `CHATBOT_DAILY_LIMIT` (200 par défaut) ; au-delà, réponse locale |
| Supabase | 500 Mo de base, 1 Go de fichiers, 5 Go de trafic, 50 000 utilisateurs actifs/mois, **pause après 7 jours sans activité**, pas de sauvegarde quotidienne | Comptes et métadonnées seulement ; la tâche planifiée (10 min) crée une activité réelle ; agenda, réservations et formulaires **ne dépendent pas** de Supabase ; export hebdomadaire des profils + copie de la feuille dans Drive (`RUNBOOK.md`) |
| EmailJS | **200 envois/mois**, 2 modèles, 50 Ko par envoi, pas de pièce jointe, 1 envoi/s, mention EmailJS en pied | 2 modèles génériques ; un envoi par événement ; compteur mensuel partagé (feuille + Worker, action `countEmail`) ; priorités P1 > P2 > P3 ; file d'envoi espacée de 1,1 s ; liens au lieu de pièces jointes |
| Apps Script | réponses en 1 à 3 s, ≈ 30 exécutions simultanées, quotas journaliers | Lecture publique **toujours** par le Worker avec cache (la feuille est lue au plus une fois par 30 s, quel que soit le trafic) ; écritures sous verrou avec `requestId` |
| Turnstile | gratuit | un widget par type de formulaire |

## Consommation d'e-mails estimée (par mois)

| Événement | Priorité | Hypothèse | E-mails |
|---|---|---|---|
| Demande reçue (contact, devis, salle, inscription sans paiement) → équipe | P2 | 60 demandes | 60 |
| Réservation confirmée / sur facture → client | P1 | 40 réservations | 40 |
| Paiement reçu → client | P1 | 15 | 15 |
| Comptes : confirmation, lien magique, mot de passe oublié | P1 | 20 | 20 |
| Rappel J-2 | P3 | 40 | 40 |
| Alertes et annulations | P1 | — | 5 |
| **Total** | | | **≈ 180** |

À 80 % du quota (160), les envois P3 (rappels) sont suspendus et l'équipe reçoit une alerte unique. À 100 %, tout est
gardé dans l'onglet *File d'envoi* (« Quota atteint ») et un bandeau rouge apparaît dans la feuille.

**Quand le plan gratuit ne suffira plus** : au-delà d'environ 50 réservations par mois, ou dès que les rappels sont
régulièrement suspendus. L'offre payante d'EmailJS ou un autre service d'envoi reste une **décision de Rayane** (la
mission interdit d'en changer sans son accord).

## Surveiller

- Cloudflare › Workers › centre-cfs › *Metrics* (requêtes, erreurs, CPU).
- Supabase › *Reports* (taille de la base, utilisateurs actifs).
- Feuille › onglet *Réglages* : compteur d'e-mails du mois ; onglet *Journal*.
- `GET /api/health` : état des branchements (aucune donnée personnelle).
