# Grille tarifaire (validée le 27/11/2026)

Prix **HTVA par participant**, inscription individuelle au centre (Engis, Charleroi). TVA 21 % ajoutée au moment de la
réservation (taux à confirmer par le comptable). **Formation dans l'entreprise (groupe) : toujours sur devis.**

- Les **4 prix du catalogue du Centre CFS** (`client/formations.csv`) sont gardés tels quels.
- Les **18 autres** (`site/content/tarifs.json`), alignées sur les tarifs publics belges relevés le 27/11/2026, ont été
  **validées par Rayane le 27/11/2026**. Elles s'affichent sur le site, dans l'assistant et dans la feuille (montants des
  réservations). Les durées marquées « à préciser » restent à compléter. Pour modifier un prix : `client/formations.csv` (prioritaire)
  ou `site/content/tarifs.json`, puis reconstruire ; dans la feuille, onglet *Formations*, colonne Prix HTVA. Pour revenir
  à « Sur devis » partout : `CFS_PROPOSED_PRICES=0` à la construction et colonne vide dans la feuille.

| Formation | Durée (site) | Prix HTVA | TVAC (21 %) | Origine | Repère de marché |
|---|---|---|---|---|---|
| VCA Base | 1 jour | 250 € | 302,50 € | catalogue client | — |
| VCA Cadre | 2 jours | 400 € | 484 € | catalogue client | — |
| BA4 – personnel averti | 1 jour | 275 € | 332,75 € | catalogue client | — |
| BA5 – personnel qualifié | 1 jour | 275 € | 332,75 € | catalogue client | — |
| Conseiller en prévention – niveau base | 6 jours (42 h) | 1 290 € | 1 560,90 € | grille validée | formations multi-jours du marché (≈ 200 €/jour) |
| Recyclage conseiller en prévention | 8 h | 210 € | 254,10 € | grille validée | journée de formation sécurité |
| Secourisme de base | (3 jours selon l'usage) | 330 € | 399,30 € | grille validée | Croix-Rouge 350 €, UCM 322 € HTVA, EFP 250 € |
| Rappel secourisme | ½ jour | 140 € | 169,40 € | grille validée | Croix-Rouge recyclage 4 h : 150 € |
| Initiation aux premiers soins | 2 h | 60 € | 72,60 € | grille validée | — |
| D.E.A. – défibrillateur | (à préciser) | 75 € | 90,75 € | grille validée | — |
| Équipier de première intervention | 1 jour | 210 € | 254,10 € | grille validée | EPI 4 h (Luxembourg) : 230 € |
| Recyclage équipier de première intervention | (à préciser) | 130 € | 157,30 € | grille validée | — |
| Initiation feu et extincteurs | (à préciser) | 85 € | 102,85 € | grille validée | — |
| A.R.I. – appareil respiratoire isolant | (à préciser) | 240 € | 290,40 € | grille validée | — |
| Produits dangereux | (à préciser) | 160 € | 193,60 € | grille validée | — |
| Amiante | (à préciser) | 220 € | 266,20 € | grille validée | — |
| Ergonomie au poste de travail | (à préciser) | 130 € | 157,30 € | grille validée | — |
| Harnais et travail en hauteur | (à préciser) | 210 € | 254,10 € | grille validée | — |
| Nacelle élévatrice (PEMP) | (à préciser) | 260 € | 314,60 € | grille validée | — |
| Chariot élévateur | (à préciser) | 240 € | 290,40 € | grille validée | organismes belges : 155 à 275 € HT |
| Échafaudage | (à préciser) | 240 € | 290,40 € | grille validée | — |
| Pont roulant | (à préciser) | 220 € | 266,20 € | grille validée | — |

Logique : une demi-journée ≈ 130 à 160 €, une journée ≈ 210 à 260 € (pratique avec engins un peu plus chère), à
l'intérieur des fourchettes publiques ; les prix du Centre (VCA, BA4/BA5) servent de référence haute. Plusieurs durées
ne sont pas connues : les prix supposent les formats habituels du marché et doivent être confirmés avec la durée réelle.

Sources consultées (27/11/2026) : [Croix-Rouge, formation de base du secouriste](https://formations.croix-rouge.be/croixrouge/themes/pdfGenerator/generatePdfGlobal.php?id=557),
[Croix-Rouge, recyclage 4 h ou 6 h](https://formations.croix-rouge.be/files/Image/Fiche-Recyclage-4h-ou-6h.pdf),
[UCM, formations sécurité au travail](https://www.ucm.be/formations/securite-au-travail-les-formations-indispensables-pour-votre-pme),
[EFP, secouriste d'entreprise](https://www.efp.be/efp/themes/pdfGenerator/generatePdfGlobal.php?id=1285),
[Colle, formations chariot élévateur](https://www.colle.eu/fr/formations/chariots-elevateurs/base/formation-chariot-elevateurreachtruck-chariot-elevateur-retractable/),
[Lifelong Learning (LU), équipier de première intervention](https://www.lifelong-learning.lu/formation/equipier-de-premiere-intervention/en).
