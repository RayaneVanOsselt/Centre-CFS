# Fichiers à fournir

Un fichier manquant ne bloque rien : le site affiche « Sur devis », « Nous consulter » ou un emplacement propre,
et la liste à jour se trouve dans `docs/RAPPORT-IMPORT.md` (régénéré à chaque construction).

| Fichier | État au 26/11/2026 | Remarque |
|---|---|---|
| `infos-entreprise.md` | Modèle créé | BCE, forme juridique, TVA, logiciel comptable, durées de conservation, accès DNS, équipe |
| `formations.csv` | Pré-rempli (catalogue 2026-2027) | 4 prix connus sur 22 ; capacités par défaut presque toutes à compléter |
| `sessions.csv` | Pré-rempli (catalogue 2026-2027) | 7 sessions ; **capacité à compléter** pour chacune (sans capacité, la feuille ne les publie pas) |
| `salles.csv` | Pré-rempli | Tarifs de location à compléter |
| `temoignages.csv` | Vide | Uniquement des témoignages avec accord écrit |
| `ancien-logo.png` | Manquant | Logo historique (centrecfs.be/wp-content/uploads/2026/06/cfs-logo.png) |
| `photos/` | Vide | Voir `photos/LISEZMOI.txt` et `photos/accords-photos.csv` |
| `logos-partenaires/` | Vide | Uniquement avec autorisation écrite |
| `cgv.md` | Manquant | Un brouillon « à valider juridiquement » est publié en attendant |
| `traductions-relues/` | Vide | Après relecture des textes NL et EN |
| `.dev.vars` (à la racine, jamais dans Git) | À créer | Facultatif : copier `.dev.vars.example` et remplir (voir le `README.md`) |
