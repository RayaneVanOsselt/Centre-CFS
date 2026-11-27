# Traductions à relire (néerlandais et anglais)

Toutes les traductions ont été rédigées sans relecture par un natif : elles sont marquées `review: pending`
(`_meta.review` dans `site/content/ui.nl.json` et `ui.en.json`). Rien n'est traduit automatiquement sans contrôle, mais une
relecture humaine reste nécessaire avant la mise en production (mission, section 13).

## Comment relire

1. Ouvrir la version NL ou EN du site (`/nl/`, `/en/`) et le fichier source correspondant.
2. Corriger directement dans le fichier, ou déposer un fichier annoté dans `client/traductions-relues/`
   (un fichier par langue, par exemple `nl-relu.md`).
3. Une fois une section validée, la noter dans le tableau ci-dessous.

Vocabulaire de référence : glossaire de la section 13 de la mission (VCA Basis / VOL-VCA, preventieadviseur, IDPBW,
K.B., AREI, EHBO, eerste interventieploeg, BA4 gewaarschuwd persoon / BA5 vakbekwaam persoon, excl. btw / excl. VAT…).

## Ce qu'il faut relire

| Fichier (NL / EN) | Section | Textes | Remarque | Relu NL | Relu EN |
|---|---|---|---|---|---|
| `ui.nl.json` / `ui.en.json` | Textes d'interface (boutons, formulaires, agenda, e-mails) | 456 | Les clés `email.*` partent aussi dans les e-mails de la feuille Google | ☐ | ☐ |
| `nl.py` / `en.py` | `FORMATIONS` : 22 fiches | ≈ 540 | Termes techniques et références légales (K.B. / Royal Decree) | ☐ | ☐ |
| | `PAGES` : accueil, catalogue, agenda, entreprises, salles, centre, contact… | ≈ 240 | Titres et descriptions pour Google : garder des mots-clés recherchés dans la langue, pas une traduction mot à mot | ☐ | ☐ |
| | `LEGAL` : mentions légales, confidentialité, conditions générales | ≈ 110 | Brouillons à valider juridiquement **avant** la traduction définitive | ☐ | ☐ |
| | `ARTICLES` : 4 articles | ≈ 80 | Article AKT entièrement réécrit en phase 1 (voir ci-dessous) | ☐ | ☐ |
| | `DOMAINES`, `FAQ_GENERALE`, `LIEUX`, `SALLES`, `SITE` | ≈ 65 | | ☐ | ☐ |

## Textes ajoutés en phase 1 (27/11/2026), à relire en priorité

- VCA Base : question « Pourquoi le VCA est-il demandé ? »
- BA5 : question « Qui délivre l'habilitation BA5 ? »
- Conseiller en prévention niveau base : question « Pourquoi faut-il un conseiller en prévention ? » (groupes A à D)
- Secourisme de base : 2 objectifs ; A.R.I. : 1 objectif ; équipier de première intervention : 1 question
- Produits dangereux : groupe de programme « Des réponses concrètes »
- Harnais : objectifs, équipements de protection individuelle et collective, exercices pratiques ; références légales
  du harnais et de la nacelle (K.B. van 31 augustus 2005, K.B. van 13 juni 2005)
- Page « Le centre » : paragraphe sur la pédagogie (exemples réels, vidéos, mises en situation)
- Article AKT : texte complet (10 blocs)
