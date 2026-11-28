# Rapport d'import des fichiers client (2026-11-28)

Généré par `python3 site/tools/import_client.py`. Les fichiers de `client/` ne sont jamais modifiés.

| Fichier | Résultat |
|---|---|
| `formations.csv` | 22 formations, 22 avec un prix HTVA |
| `sessions.csv` | 5 session(s) à venir, 0 avec une capacité |
| `salles.csv` | 3 salle(s) |

## Erreurs (lignes non importées)

Aucune.

## Données manquantes (avertissements)

- formations.csv ligne 2 : vca-base : capacité par défaut vide
- formations.csv ligne 3 : vca-ligne-hierarchique : capacité par défaut vide
- formations.csv ligne 4 : conseiller-prevention-base : prix HTVA vide → « Sur devis » (pas de paiement en ligne)
- formations.csv ligne 4 : conseiller-prevention-base : capacité par défaut vide
- formations.csv ligne 5 : recyclage-conseiller-prevention : prix HTVA vide → « Sur devis » (pas de paiement en ligne)
- formations.csv ligne 5 : recyclage-conseiller-prevention : capacité par défaut vide
- formations.csv ligne 6 : equipier-premiere-intervention : prix HTVA vide → « Sur devis » (pas de paiement en ligne)
- formations.csv ligne 6 : equipier-premiere-intervention : capacité par défaut vide
- formations.csv ligne 7 : recyclage-equipier-premiere-intervention : prix HTVA vide → « Sur devis » (pas de paiement en ligne)
- formations.csv ligne 7 : recyclage-equipier-premiere-intervention : capacité par défaut vide
- formations.csv ligne 8 : initiation-feu : prix HTVA vide → « Sur devis » (pas de paiement en ligne)
- formations.csv ligne 8 : initiation-feu : capacité par défaut vide
- formations.csv ligne 9 : ari-appareil-respiratoire : prix HTVA vide → « Sur devis » (pas de paiement en ligne)
- formations.csv ligne 9 : ari-appareil-respiratoire : capacité par défaut vide
- formations.csv ligne 10 : secourisme-base : prix HTVA vide → « Sur devis » (pas de paiement en ligne)
- formations.csv ligne 10 : secourisme-base : capacité par défaut vide
- formations.csv ligne 11 : rappel-secourisme : prix HTVA vide → « Sur devis » (pas de paiement en ligne)
- formations.csv ligne 11 : rappel-secourisme : capacité par défaut vide
- formations.csv ligne 12 : initiation-premiers-soins : prix HTVA vide → « Sur devis » (pas de paiement en ligne)
- formations.csv ligne 13 : dea-defibrillateur : prix HTVA vide → « Sur devis » (pas de paiement en ligne)
- formations.csv ligne 13 : dea-defibrillateur : capacité par défaut vide
- formations.csv ligne 14 : ba4 : capacité par défaut vide
- formations.csv ligne 15 : ba5 : capacité par défaut vide
- formations.csv ligne 16 : produits-dangereux : prix HTVA vide → « Sur devis » (pas de paiement en ligne)
- formations.csv ligne 16 : produits-dangereux : capacité par défaut vide
- formations.csv ligne 17 : amiante : prix HTVA vide → « Sur devis » (pas de paiement en ligne)
- formations.csv ligne 17 : amiante : capacité par défaut vide
- formations.csv ligne 18 : ergonomie : prix HTVA vide → « Sur devis » (pas de paiement en ligne)
- formations.csv ligne 18 : ergonomie : capacité par défaut vide
- formations.csv ligne 19 : harnais : prix HTVA vide → « Sur devis » (pas de paiement en ligne)
- formations.csv ligne 19 : harnais : capacité par défaut vide
- formations.csv ligne 20 : nacelle : prix HTVA vide → « Sur devis » (pas de paiement en ligne)
- formations.csv ligne 20 : nacelle : capacité par défaut vide
- formations.csv ligne 21 : chariot-elevateur : prix HTVA vide → « Sur devis » (pas de paiement en ligne)
- formations.csv ligne 21 : chariot-elevateur : capacité par défaut vide
- formations.csv ligne 22 : echafaudage : prix HTVA vide → « Sur devis » (pas de paiement en ligne)
- formations.csv ligne 22 : echafaudage : capacité par défaut vide
- formations.csv ligne 23 : pont-roulant : prix HTVA vide → « Sur devis » (pas de paiement en ligne)
- formations.csv ligne 23 : pont-roulant : capacité par défaut vide
- sessions.csv ligne 2 : vca-base du 2026-11-26 (engis) : capacité manquante → la feuille ne la publie pas tant que « Places (total) » est vide ; le site de secours affiche « Places : nous consulter »
- sessions.csv ligne 3 : vca-base du 2026-12-10 (charleroi) : capacité manquante → la feuille ne la publie pas tant que « Places (total) » est vide ; le site de secours affiche « Places : nous consulter »
- sessions.csv ligne 4 : vca-ligne-hierarchique du 2026-11-26 (engis) : capacité manquante → la feuille ne la publie pas tant que « Places (total) » est vide ; le site de secours affiche « Places : nous consulter »
- sessions.csv ligne 5 : vca-ligne-hierarchique du 2026-12-10 (charleroi) : capacité manquante → la feuille ne la publie pas tant que « Places (total) » est vide ; le site de secours affiche « Places : nous consulter »
- sessions.csv ligne 6 : vca-ligne-hierarchique du 2026-12-14 (engis) : capacité manquante → la feuille ne la publie pas tant que « Places (total) » est vide ; le site de secours affiche « Places : nous consulter »
- sessions.csv ligne 7 : ba4 du 2026-12-07 (engis) : capacité manquante → la feuille ne la publie pas tant que « Places (total) » est vide ; le site de secours affiche « Places : nous consulter »
- sessions.csv ligne 8 : ba5 du 2026-12-07 (engis) : capacité manquante → la feuille ne la publie pas tant que « Places (total) » est vide ; le site de secours affiche « Places : nous consulter »
- salles.csv ligne 2 : Salle 1 : tarifs vides → « sur demande »
- salles.csv ligne 3 : Salle 2 : tarifs vides → « sur demande »
- salles.csv ligne 4 : Salle 3 : tarifs vides → « sur demande »

## Informations

- 18 tarif(s) PROPOSÉ(S) appliqué(s) depuis site/content/tarifs.json (à valider par le Centre CFS)
- sessions.csv ligne 2 : session passée (2026-11-26), ignorée
- sessions.csv ligne 4 : session passée (2026-11-26), ignorée
- 5 session(s) publiée(s) dans le fichier de secours sessions-data.js
