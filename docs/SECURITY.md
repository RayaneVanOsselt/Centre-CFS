# Sécurité

## Principes

- Le navigateur ne parle **qu'au Worker** (`/api/*`, même domaine) et, pour la connexion, à Supabase Auth.
  L'adresse `/exec` de la feuille et le secret HMAC ne quittent jamais le Worker.
- Toute écriture dans la feuille est **signée** : HMAC-SHA256(secret, horodatage + « . » + nonce + « . » + contenu),
  refusée si la signature est fausse, si l'horodatage a plus de 5 minutes ou si le nonce a déjà servi (D-004).
- Les **montants** sont calculés par la feuille (prix HTVA de l'onglet Formations × places + TVA) ; un montant, un
  statut de paiement ou un rôle envoyés par le navigateur sont ignorés (test « montant jamais lu »).
- Le **webhook Mollie** ne transmet qu'un identifiant : le paiement est toujours relu auprès de l'API Mollie ; la
  confirmation est idempotente (identifiant de paiement + référence).
- **Idempotence** partout : `requestId` (formulaires, réservations), identifiant de paiement.
- **Mots de passe** : Supabase Auth uniquement (jamais dans notre code, nos journaux ni la feuille).
- **E-mails** : EmailJS appelé côté serveur avec la clé privée ; le modèle « équipe » a un destinataire **fixe** ;
  aucun appel EmailJS depuis le navigateur (le site ne peut pas servir de relais de spam).

## Défenses par couche

| Couche | Mesures |
|---|---|
| Pages | CSP stricte sans script ni style en ligne (`script-src 'self'` + Turnstile), `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy` (fichier `_headers` généré) ; aucune ressource tierce (polices et bibliothèques auto-hébergées) |
| Worker | même origine exigée pour les écritures ; corps limité à 20 Ko ; validation de chaque champ ; champ piège et délai minimal de saisie ; Turnstile ; limites de débit par empreinte d'IP salée (`rate_hit`) ; erreurs sans détail technique ; JWT Supabase vérifiés (JWKS, émetteur, audience, expiration) ; signature « Standard Webhooks » du hook d'e-mails |
| Feuille | revalide tout ; verrou sur les écritures ; injection de formules bloquée (apostrophe initiale) ; journal des actions sensibles ; limites par adresse et globales |
| Supabase | RLS sur toutes les tables, droits explicites, tables techniques inaccessibles aux comptes, admin = rôle SQL **et** double authentification (aal2), tests pgTAP et PGlite |
| Dépôt | aucun secret commité (`.dev.vars` ignoré), `gitleaks` en CI, dépendances épinglées, `npm audit` (production) en CI ; le Worker n'exécute aucun code tiers (D-009) |

## Secrets (jamais dans Git, la feuille, le navigateur ou un chat)

`RESERVATIONS_API_URL`, `RESERVATIONS_HMAC_SECRET`, `SUPABASE_SECRET_KEY`, `SUPABASE_EMAIL_HOOK_SECRET`,
`MOLLIE_API_KEY`, `EMAILJS_PRIVATE_KEY`, `TURNSTILE_SECRET_KEY`, `ANTHROPIC_API_KEY`, `IP_HASH_SALT`, `DEPLOY_HOOK_URL`.

**Rotation** (fuite supposée) : générer une nouvelle valeur, `npx wrangler secret put NOM`, mettre à jour la propriété
du script Google s'il y en a une (HMAC, EmailJS), puis révoquer l'ancienne clé chez le fournisseur. Pour le secret HMAC,
changer les deux côtés dans la même minute (les appels entre les deux sont refusés, puis rejoués par la boîte de secours).

## Signaler une faille

Écrire à info@centrecfs.be (objet « Sécurité »). Ne pas publier de détail avant correction.
