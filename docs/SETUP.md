# Mise en service pas à pas (Rayane)

Tout tient dans les **plans gratuits** (Cloudflare, Supabase, EmailJS, Turnstile ; Mollie sans abonnement).
Rien de public, de payant ni d'irréversible n'est fait sans ton accord : chaque étape ci-dessous, c'est toi qui la lances.

Ordre conseillé : **1 → 2 → 3 → 4** suffisent pour l'agenda en direct, les réservations et les formulaires.
Les comptes (5), le paiement (6) et l'IA du chatbot (7) viennent ensuite, chacun activé par un interrupteur.

> Règle d'or : une clé **secrète** ne va jamais dans le code, dans Git, dans une cellule de la feuille, dans le
> navigateur ni dans un chat. Elle va dans `npx wrangler secret put NOM` (Worker) ou dans les *propriétés du script*
> (Google). Le fichier local `.dev.vars` n'est jamais commité (il est dans `.gitignore`).

---

## 0. Sur ton ordinateur (une fois)

1. Installer **Node.js 22 LTS** (nodejs.org) et **Python 3.12**. Vérifier : `node -v` puis `python3 --version`.
2. Dans le dossier du projet :
   ```bash
   npm ci
   ```
   ```bash
   cp .dev.vars.example .dev.vars
   ```
3. Générer deux secrets de 64 caractères (un pour la signature HMAC, un pour `IP_HASH_SALT`) :
   ```bash
   python3 -c "import secrets; print(secrets.token_urlsafe(48))"
   ```
   Les coller dans `.dev.vars` (`RESERVATIONS_HMAC_SECRET=` et `IP_HASH_SALT=`), jamais ailleurs.

Sans Node, tu peux quand même tout construire et tout tester :
`python3 site/build.py`, `python3 site/tools/check_links.py`, `python3 site/tools/check_seo.py`,
`sh scripts/check-js-syntax.sh` (macOS), et **les tests JavaScript dans le navigateur** :
```bash
python3 scripts/serve-tests.py
```
puis ouvrir http://localhost:8766/tests/browser/ (mêmes tests que `npm test`, sauf ceux de la base PGlite).
Ils tournent aussi dans GitHub Actions (onglet *Actions*, workflow « CI ») à chaque envoi sur GitHub.

## 1. La feuille Google « Réservations – Centre CFS »

Guide détaillé avec captures : `docs/GUIDE-FEUILLE.md`. En bref :

1. Avec le **compte Google du Centre CFS** (un compte Google Workspace est préférable : contrat de traitement RGPD),
   créer une feuille vide nommée « Réservations – Centre CFS ». Ne la partager qu'avec l'équipe.
2. *Extensions › Apps Script* : remplacer le contenu par `apps-script/reservations.gs`, et le manifeste par
   `apps-script/appsscript.json` (*Paramètres du projet › Afficher le fichier manifeste*).
3. *Paramètres du projet › Propriétés du script* : ajouter `HMAC_SECRET` = la même valeur que
   `RESERVATIONS_HMAC_SECRET`. (Ajouter les clés EmailJS à l'étape 3.)
4. Exécuter la fonction `install` une fois (autoriser les accès demandés) : 9 onglets, les formations, les sessions
   de `client/sessions.csv`, la tâche automatique toutes les 10 minutes et le menu « Centre CFS ».
5. *Déployer › Nouveau déploiement › Application Web* : exécuter en tant que **moi**, accès **Tout le monde**.
   Copier l'adresse qui se termine par `/exec` : c'est `RESERVATIONS_API_URL` (secret : seul le Worker l'appelle,
   et toute requête sans signature HMAC valide est refusée).
6. Dans l'onglet *Sessions*, saisir la **capacité** de chaque session (sans capacité, la session s'affiche « sur demande »).

## 2. Cloudflare (Worker + site) — sans Node ni terminal

1. Compte Cloudflare gratuit (dash.cloudflare.com). Noter l'**Account ID** (colonne de droite de la page d'accueil).
2. *My Profile › API Tokens › Create Token* : modèle **« Edit Cloudflare Workers »** → copier le jeton.
3. Sur GitHub, dépôt Centre-CFS › *Settings › Secrets and variables › Actions* :
   - onglet **Secrets** : `CLOUDFLARE_API_TOKEN` (le jeton) et `CLOUDFLARE_ACCOUNT_ID` ;
   - onglet **Variables** : `SITE_URL` = `https://centre-cfs.<votre-sous-domaine>.workers.dev` (tant que le domaine
     centrecfs.be n'est pas branché sur Cloudflare).
4. Onglet *Actions* › **« Publier sur Cloudflare »** › *Run workflow* (**à faire seulement avec ton accord : c'est une
   publication**). Le site et l'API sont en ligne sur l'adresse `workers.dev` (non indexée par Google).
5. Secrets du Worker : *Workers & Pages › centre-cfs › Settings › Variables and Secrets › Add* (type **Secret**) :
   `RESERVATIONS_API_URL` (adresse /exec de l'étape 1), `RESERVATIONS_HMAC_SECRET` (même valeur que `HMAC_SECRET` de la
   feuille), `IP_HASH_SALT`, puis à l'étape 3 `EMAILJS_PRIVATE_KEY`. Variables simples (type **Text**) :
   `EMAILJS_PUBLIC_KEY`, `EMAILJS_SERVICE_ID`, `EMAILJS_TEMPLATE_CLIENT`, `EMAILJS_TEMPLATE_EQUIPE`. Elles sont gardées
   à chaque nouvelle publication (`keep_vars`).
6. ✅ Ouvrir `https://centre-cfs.<…>.workers.dev/api/health` : `"sheet": true`, `"email": true`, `"chatbot": "workers-ai"`.
   Puis l'agenda (places en direct), un formulaire de contact (ligne dans la feuille + e-mail dans info@) et le chatbot.
7. Domaine `centrecfs.be` (le jour de la mise en ligne, phase 11) : ajouter le domaine à Cloudflare (changement des
   serveurs DNS chez le registraire), puis *Workers › centre-cfs › Settings › Domains & Routes › Add › Custom domain* ;
   mettre la variable GitHub `SITE_URL` à `https://centrecfs.be` et republier. Activer *Crawler Hints* et *Web Analytics*.

Avec Node (facultatif) : `npm ci`, `npx wrangler login`, `npm run dev` (essai local sur http://localhost:8787),
`npx wrangler secret put NOM` pour les secrets, `npm run deploy` pour publier.

L'IA du chatbot (Workers AI, modèle gratuit `@cf/google/gemma-4-26b-a4b-it`) est active dès la publication, sans clé :
voir l'étape 7. Le site statique est servi directement par Cloudflare ; seul `/api/*` exécute le Worker.

## 3. EmailJS (tous les e-mails, côté serveur uniquement)

Guide : `docs/README-EMAILJS.md`. En bref : compte gratuit, service relié à la boîte du Centre, **deux modèles**
(client, équipe), *Account › Security* : autoriser l'API pour les applications non-navigateur et exiger la clé privée.

```bash
npx wrangler secret put EMAILJS_PRIVATE_KEY
```
Les valeurs publiques (`EMAILJS_PUBLIC_KEY`, `EMAILJS_SERVICE_ID`, `EMAILJS_TEMPLATE_CLIENT`, `EMAILJS_TEMPLATE_EQUIPE`)
vont dans `[vars]` de `wrangler.toml`, et les cinq valeurs dans les propriétés du script Google (file d'envoi).

## 4. Turnstile (anti-robots)

*Cloudflare › Turnstile › Add widget* (mode « Managed », domaines `centrecfs.be` et `localhost`).
`TURNSTILE_SITE_KEY` dans `[vars]` et dans `.dev.vars` ; puis :
```bash
npx wrangler secret put TURNSTILE_SECRET_KEY
```

## 5. Supabase (comptes, facultatif)

1. Projet gratuit, **région UE** (Francfort ou Paris). Noter l'URL et les clés (*Project Settings › API Keys*).
2. Schéma : `npx supabase link --project-ref <ref>` puis `npx supabase db push` (fichiers de `supabase/migrations/`).
   Tests de sécurité (RLS) : `npx supabase test db` en local (`npx supabase start`, Docker requis) ; la CI les rejoue
   aussi dans PGlite (`tests/supabase/rls.test.js`).
3. *Authentication › URL Configuration* : Site URL = `https://centrecfs.be` ; Redirect URLs : les pages `/compte/`
   des 3 langues. Mot de passe : 10 caractères minimum. Confirmation d'e-mail obligatoire.
4. *Authentication › Hooks › Send Email* : HTTPS vers `https://centrecfs.be/api/hooks/supabase-email`, générer le secret.
   ```bash
   npx wrangler secret put SUPABASE_SECRET_KEY
   ```
   ```bash
   npx wrangler secret put SUPABASE_EMAIL_HOOK_SECRET
   ```
5. Activer dans `wrangler.toml` (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`) et pour le site
   `ACCOUNTS_ENABLED=1` (variable de construction), puis republier.
6. Compte admin : rôle donné **uniquement en SQL** (éditeur SQL de Supabase), après activation de la double
   authentification par la personne :
   ```sql
   update auth.users set raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}' where email = 'info@centrecfs.be';
   ```

## 6. Mollie (paiement en ligne, facultatif)

Compte marchand **au nom du Centre CFS** (Rayane y a un accès développeur). Mode **test** uniquement jusqu'à ton
accord explicite :
```bash
npx wrangler secret put MOLLIE_API_KEY
```
(clé `test_…`), puis `ONLINE_PAYMENT_ENABLED = "1"` dans `wrangler.toml` et pour la construction du site.
Les remboursements se font dans le tableau de bord Mollie ; la feuille signale « Remboursement à faire ».

## 7. IA du chatbot

Active par défaut avec le Worker : Workers AI (allocation gratuite de 10 000 « neurons » par jour, environ 250 réponses
de l'IA ; le cœur local répond aux questions simples sans l'appeler). Rien à créer. Pour la couper : `CHATBOT_PROVIDER`
= `local` dans `wrangler.toml`. Pour une meilleure qualité, payante à l'usage : `CHATBOT_PROVIDER` = `claude`, secret
`ANTHROPIC_API_KEY` (console.anthropic.com, **avec une limite de dépenses**). Détails : `docs/README-ASSISTANT.md`.

## 8. Variables de construction du site

| Variable | Valeur | Effet |
|---|---|---|
| `WORKER_API` | `1` | formulaires, agenda et réservations par `/api/*` (imposé par `npm run dev` / `npm run deploy`) |
| `ACCOUNTS_ENABLED` | `0` / `1` | pages compte (Supabase) |
| `ONLINE_PAYMENT_ENABLED` | `0` / `1` | paiement Mollie à l'inscription |
| `CHATBOT_ENABLED` | `0` / `1` | assistant du site (cœur local) |
| `TURNSTILE_SITE_KEY` | clé publique | widget anti-robots sur les formulaires |

Sur GitHub Pages (aperçu actuel), tout reste à `0` : le site fonctionne en mode « e-mail pré-rempli » sans serveur.
