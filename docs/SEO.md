# SEO : ce qui est en place et le suivi

## En place (contrôlé à chaque construction par `site/tools/check_seo.py`, 0 erreur)

- URL françaises inchangées ; NL sous `/nl/`, EN sous `/en/`, slugs traduits (`site/content/routes.py`).
- Titre unique ≤ 60 caractères, description unique ≤ 155, un seul H1, hiérarchie sans saut, `lang`, canonique sur le
  domaine officiel, Open Graph avec image par page.
- `hreflang` réciproques `fr-BE`, `nl-BE`, `en` + `x-default` ; pas de redirection automatique selon la langue (bandeau discret).
- Sitemap index + un sitemap par langue (pages indexables seulement) ; `robots.txt` avec pages privées en `Disallow` et `noindex`.
- Données structurées générées, fidèles à l'affichage : `EducationalOrganization`, `WebSite`, `BreadcrumbList`, `Course`
  avec `Offer` (prix HTVA affiché) et `CourseInstance` pour les sessions réelles, `FAQPage`, `Article`.
  Google a retiré l'affichage enrichi « Course Info » (2025) et limite les FAQ enrichies aux sites officiels : ces
  balises aident à comprendre les pages, **sans promesse d'affichage enrichi**. Pas d'`AggregateRating`.
- Aucune date de session dans le HTML (contrôlé) ; redirections 301 de l'ancien WordPress (`_redirects`).
- `llms.txt` (résumé et liens clés pour les assistants IA) : **effet non garanti**.
- Aperçus (GitHub Pages, workers.dev) en `noindex` pour ne pas concurrencer le domaine officiel.

## Robots d'IA (décision de Rayane)

Proposé par défaut : autoriser les robots des moteurs de recherche et de réponse (Googlebot, Bingbot, OAI-SearchBot,
PerplexityBot…) ; robots d'entraînement au choix du Centre. Vérifier que le réglage Cloudflare « AI Scrapers and
Crawlers » (Security › Bots) correspond à ce choix.

## Au moment de la mise en ligne

1. Google Search Console et Bing Webmaster Tools : vérification du domaine par enregistrement DNS, envoi de
   `https://centrecfs.be/sitemap.xml`.
2. Cloudflare : *Crawler Hints* (IndexNow) et *Web Analytics* (sans cookie).
3. Fiche Google Business Profile et autres annuaires : `docs/SEO-LOCAL.md`.

## Contrôle mensuel (30 minutes)

Search Console : pages en erreur, requêtes qui montent (par langue), pages avec beaucoup d'impressions et peu de clics
(retravailler titre et description). Demandes et réservations par page d'origine (colonne « Page » de la feuille).
Ajuster `docs/SEO-MOTS-CLES.md` et publier les guides de `docs/PLAN-EDITORIAL.md`.
