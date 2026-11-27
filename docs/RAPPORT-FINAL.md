# Rapport final (27/11/2026)

## État

| Phase | État | Preuve |
|---|---|---|
| 0 Analyse | ✅ | `ANALYSE.md`, `PLAN.md`, `A-COMPLETER.md` |
| 1 Contenus et trilingue | ✅ | 156 pages, `check_i18n.py` : 0 écart |
| 2 Direction artistique, images | ✅ | `DIRECTION-ARTISTIQUE.md`, `image-sources.md` |
| 3 Héros 3D | ✅ | WebGL2 sur mesure, replis (D-008) |
| 4 Infrastructure | ✅ | Worker, `wrangler.toml`, migrations Supabase + RLS, CI, `SETUP.md` |
| 5 Agenda et réservations | ✅ | 10 → 9 sur 10 de bout en bout (banc `tests/browser/e2e.html`) |
| 6 Formulaires | ✅ | feuille + e-mail équipe, sans JavaScript aussi, secours Supabase |
| 7 Comptes | ✅ | Supabase Auth, espace client, RLS testée (PGlite en CI) |
| 8 Paiement | ✅ | Mollie (test) : montant calculé par la feuille, webhook relu, confirmation unique |
| 9 Chatbot | ✅ | cœur local + IA Workers AI ; 68 questions, véracité 30/30, intention 68/68 |
| 10 SEO | ✅ | `check_seo.py` : 0 erreur, 0 avertissement ; `llms.txt` ; docs SEO |
| 11 Vérification | ✅ (hors mise en production) | voir ci-dessous ; production sur accord de Rayane |

## Contrôles mesurés

- Tests JavaScript (lanceur du navigateur, mêmes fichiers que `npm test`) : **64 réussis, 0 échec** ; 9 ignorés ici
  (base PGlite et en-tête Origin), exécutés par la CI GitHub.
- Construction : 156 pages ; liens : 0 cassé ; traductions : 0 écart ; SEO : 0 erreur ; syntaxe JS : OK.
- Navigateur, 390 px, 15 pages FR/NL/EN : aucun débordement horizontal, aucune image cassée ou sans `alt`, aucune erreur
  de script ; assistant présent ; panneau plein écran modal sur téléphone, Échap et retour du focus vérifiés.
- Parcours réels sur le banc (vrai Worker + vrai moteur de la feuille, feuille simulée) : contact (avec et sans
  JavaScript), réservation sur facture, paiement en ligne simulé, places mises à jour, e-mails mis en file.

## Liste de contrôle « professionnel » (mission 9.8)

✅ trois langues complètes · ✅ aucune page vide · ✅ un seul bouton jaune par écran · ✅ prix HTVA et TVAC, groupes sur
devis · ✅ pictogrammes ISO 7010 · ✅ formulaires accessibles · ✅ aucune ressource tierce (hors Turnstile) ·
✅ CSP stricte · ⬜ photos réelles du centre (à fournir) · ✅ grille de prix validée (27/11/2026) · ⬜ CGV à valider · ⬜ mesures Lighthouse sur
le domaine final (après mise en ligne).

## Limites connues

- Grille de prix validée le 27/11/2026 ; plusieurs durées restent à préciser (`docs/TARIFS.md`).
- Plan gratuit EmailJS : mention EmailJS en pied d'e-mail, 200 envois/mois (`QUOTAS.md`).
- L'IA (Workers AI) ne fonctionne qu'avec le Worker publié ; sur GitHub Pages, le cœur local répond seul et les
  formulaires préparent un e-mail.
- Tests non exécutables sur ce poste (sans Node) : PGlite (RLS) et Playwright ; ils passent par la CI.

## Mise en production (sur accord explicite de Rayane)

DNS de centrecfs.be sur Cloudflare · domaine personnalisé du Worker · `SITE_URL=https://centrecfs.be` · SPF/DKIM/DMARC ·
un e-mail réel de chaque type et de chaque langue · test de concurrence réel sur une session de test · Mollie `live`
après validation + paiement réel de 1 € remboursé · Search Console et Bing · Crawler Hints · Google Business Profile.
