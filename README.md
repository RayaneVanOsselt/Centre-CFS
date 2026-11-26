# Centre CFS

Site trilingue (FR à la racine, NL sous `/nl/`, EN sous `/en/`) du Centre CFS, généré en HTML statique par un petit
générateur Python et publié automatiquement sur **GitHub Pages** à chaque envoi sur `main`.

- Aperçu actuel : `https://rayanevanosselt.github.io/Centre-CFS/` (jamais indexé par Google tant qu'il n'est pas sur centrecfs.be)
- 147 pages : accueil, catalogue, 22 fiches formation, 8 domaines, agenda, inscription, entreprises, salles, FAQ, actualités, pages légales, 404

## Structure

| Dossier | Contenu |
|---|---|
| `client/` | Données fournies par le Centre CFS : formations et prix, sessions, salles (CSV). **C'est ici qu'on met à jour les dates.** |
| `site/content/` | Textes des pages (`fr.py`, `nl.py`, `en.py`), textes d'interface (`ui.*.json`), table des adresses (`routes.py`) |
| `site/src/` | CSS, JavaScript, polices, images, icônes |
| `site/build.py` | Générateur : `site/` → `dist/` (dossier publié, jamais dans Git) |
| `site/tools/` | Import des CSV, contrôles des liens et des traductions |
| `apps-script/` | Moteur de réservation Google Sheets (pour plus tard, avec un serveur ; voir plus bas) |
| `.github/workflows/pages.yml` | Construction, contrôles et publication automatiques |

## Mettre à jour le site

1. Modifier le fichier voulu, par exemple ajouter une ligne dans `client/sessions.csv` (une session) ou un prix dans `client/formations.csv`.
2. Faire un commit et l'envoyer sur `main` (GitHub Desktop : « Commit to main » puis « Push origin »).
3. Le site est reconstruit et publié en 1 à 2 minutes (onglet **Actions** du dépôt pour suivre).

Les sessions passées disparaissent toutes seules (dans le navigateur, et chaque nuit dans les données pour Google).

## Formulaires (contact, devis, inscription)

GitHub Pages n'exécute aucun serveur. Les formulaires vérifient donc les champs, puis **préparent un e-mail complet**
adressé à `FORM_EMAIL` : la messagerie du visiteur s'ouvre, et le message reste affiché avec un bouton « Copier »
si aucune messagerie n'est configurée sur son appareil.

- Destinataire actuel : `vanosselt.rayane@gmail.com` (valeur par défaut dans `.github/workflows/pages.yml`).
- Pour le changer **sans toucher au code** : Settings › Secrets and variables › Actions › onglet **Variables** ›
  *New repository variable* › nom `FORM_EMAIL`, valeur `info@centrecfs.be` › puis Actions › « Publier le site » › *Run workflow*.
- Pour recevoir les demandes **sans passer par la messagerie du visiteur** : créer un formulaire Formspree
  (ou tout service qui accepte du JSON et répond `{ "ok": true }`), puis créer la variable `FORM_ENDPOINT` avec son adresse
  (`https://formspree.io/f/xxxxxxx`). Les données passent alors par ce service : à mentionner dans la politique de confidentialité.

## Configuration (variables)

Sur GitHub : Settings › Secrets and variables › Actions › **Variables**. En local : fichier `.dev.vars` (modèle : `.dev.vars.example`).
Aucune de ces valeurs n'est secrète : elles sont visibles dans le site publié.

| Variable | Par défaut | Rôle |
|---|---|---|
| `FORM_EMAIL` | `info@centrecfs.be` (`vanosselt.rayane@gmail.com` dans le workflow) | Destinataire des demandes |
| `FORM_ENDPOINT` | vide | Adresse qui reçoit les formulaires en JSON (sinon : e-mail pré-rempli) |
| `SESSIONS_PUBLIC_URL` | vide | Liste publique des sessions avec places en direct (sinon : `client/sessions.csv`) |
| `VAT_RATE` | `0.21` | Taux de TVA du récapitulatif d'inscription |
| `SITE_URL`, `BASE_PATH` | fournis par GitHub | Adresse et chemin de base (`/Centre-CFS` sans domaine personnalisé) |
| `ACCOUNTS_ENABLED`, `ONLINE_PAYMENT_ENABLED`, `CHATBOT_ENABLED` | `0` | Espace client, paiement Mollie et chatbot : demandent un serveur (voir plus bas) |

## Construire et tester sur son ordinateur

Seul Python 3.9 ou plus récent est nécessaire (aucune dépendance) :

```bash
python3 site/build.py
python3 site/tools/check_i18n.py
python3 site/tools/check_links.py
python3 -m http.server 8765 --directory dist
```

Puis ouvrir `http://localhost:8765/`. Pour tester exactement comme sur GitHub Pages (sous `/Centre-CFS/`),
construire avec `BASE_PATH=/Centre-CFS python3 site/build.py`, puis servir un dossier parent dont `Centre-CFS` pointe vers `dist`.

## Passer sur le domaine centrecfs.be

1. Settings › Pages › **Custom domain** : `centrecfs.be` › Save, puis cocher **Enforce HTTPS** dès que possible.
2. Chez le registraire du domaine : enregistrements `A` vers 185.199.108.153, 185.199.109.153, 185.199.110.153, 185.199.111.153
   (et `CNAME` `www` → `rayanevanosselt.github.io`).
3. Relancer le workflow : le chemin de base devient vide et le site devient indexable (sitemap, robots.txt).

Les anciennes adresses WordPress (`/blog/`, `/panier/`, `/mon-compte/`…) ne peuvent pas être redirigées par GitHub Pages
(fichier `_redirects` prévu pour Cloudflare) : elles afficheront la page 404, qui propose le catalogue, l'agenda et le contact.

## Fonctions qui demandent un serveur (désactivées)

Le code de la v2 prévoyait un Worker Cloudflare (absent du dépôt) pour l'espace client (Supabase), le paiement en ligne
(Mollie), le chatbot et l'écriture des réservations dans la feuille Google (`apps-script/reservations.gs`, appels signés HMAC).
Ces fonctions sont **désactivées** : leurs liens et pages ne sont pas générés, et le générateur refuse de construire
une page qui appellerait un script absent. Rien n'a été supprimé : elles se réactivent par variable le jour où le
Worker et les scripts correspondants (`auth.js`, `account.js`, `payment.js`, `chatbot.js`…) existeront.

## Sécurité

- Politique de sécurité du contenu (CSP) stricte dans chaque page (balise `<meta>`, GitHub Pages n'envoyant pas d'en-têtes
  personnalisés) : aucun script externe, aucun script ni style en ligne.
- Aucun cookie, aucun traceur ; polices hébergées localement.
- Champ piège et délai minimal contre les robots dans les formulaires.
- Les en-têtes `X-Frame-Options`, HSTS, etc. (`dist/_headers`) ne s'appliqueront qu'avec un hébergeur qui les lit (Cloudflare, Netlify).
