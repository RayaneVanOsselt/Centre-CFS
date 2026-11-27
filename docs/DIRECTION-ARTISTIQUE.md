# Direction artistique : « la signalisation qui protège »

Tout le langage visuel vient du monde réel de la sécurité au travail : panneaux ISO 7010 en tôle émaillée, film
rétro-réfléchissant, permis de travail, jauges, marquage au sol. La charte 2026 (section 4.6 de la mission) reste la loi ;
on lui donne de la matière et de la profondeur, pas de la décoration.

## 1. Jetons (source : `site/src/assets/css/main.css`, `:root`)

| Famille | Jetons | Règle |
|---|---|---|
| Couleurs de la charte | `--bleu #0D4A8C` · `--jaune #F7B500` · `--encre #0F1C2E` · `--acier #4A5869` · `--papier #F2F5F9` · `--rouge #C8241C` · `--vert #0B7F4E` | Jaune toujours avec texte encre ; rouge réservé à l'incendie et aux erreurs ; vert réservé aux secours et à « disponible » |
| Dérivés | `--bleu-fonce`, `--bleu-clair`, `--jaune-pale`, `--rouge-pale`, `--vert-pale`, `--ligne`, `--ligne-forte`, `--sur-sombre` | États (survol, fond d'alerte, bordures) ; jamais une nouvelle teinte |
| Typographie | `--f-titre` Barlow Condensed 700/800 · `--f-texte` Barlow 400 à 700 | Auto-hébergées (6 fichiers WOFF2, 2 préchargés) |
| Échelle | `--t-xs` 13 px · `--t-s` 15 · `--t-m` 17 · `--t-l` 20 · `--t-h3` 22→26 · `--t-h2` 32→48 · `--t-h1` 42→83 (fluides) | Rapport ≈ 1,25 ; chiffres tabulaires pour prix, dates et places |
| Espacements | `--s-1` 4 px … `--s-9` 96 px ; `--section` 56→112 px ; `--gutter` 16→24 px | Multiples de 4 |
| Rayons | `--r-btn` 6 px · `--r-carte` 12 px · `--r-panneau` 18 px | Le rayon suit la hiérarchie, pas un rayon unique |
| Ombres | `--ombre`, `--ombre-haute` | Teintées encre, jamais grises neutres |
| Mouvement | `--ease cubic-bezier(.2, .8, .2, 1)`, 150 à 400 ms | `transform` et `opacity` ; rien si « réduire les animations » |

## 2. Grille et mise en page

Conteneur de 1 240 px (`--max`), gouttière fluide, colonne de lecture de 760 px (`.wrap-narrow`, 70 caractères au plus).
Les pages alternent fond blanc et fond papier ; un seul fond sombre (encre) par page au plus, hors pied de page.

```
ACCUEIL                                   FICHE FORMATION                        AGENDA
┌───────────────────────────────┐         ┌───────────────────────────────┐      ┌───────────────────────────────┐
│ en-tête · « Demander un devis »│         │ fil d'Ariane                  │      │ titre · chapeau               │
├───────────────────────────────┤         │ H1 + chapeau      ┌─────────┐ │      ├───────────────────┬───────────┤
│ HÉROS (encre, 3D)             │         │ étiquettes        │ EN BREF │ │      │ calendrier du mois│ fiche de  │
│ titre · 2 actions │ panneaux  │         │ mis à jour le…    │ prix    │ │      │ pastilles « 9/10 »│ session   │
│ faits             │ du chantier│        │                   │ durée…  │ │      │                   │ + jauge   │
├───────────────────────────────┤         │                   │[Réserver]│ │      ├───────────────────┴───────────┤
│ prochaines sessions (tickets) │         │                   └─────────┘ │      │ filtres · liste de tickets    │
│ 8 domaines                    │         ├───────────────────────────────┤      └───────────────────────────────┘
│ pourquoi nous (faits)         │         │ photo · objectifs · programme │
│ inscription en 3 étapes       │         │ modalités · base légale · FAQ │
│ langues · lieux · salles · FAQ│         │ sessions · formations liées   │
└───────────────────────────────┘         └───────────────────────────────┘
```

## 3. Principes

1. **Un seul moment spectaculaire** : le héros 3D de l'accueil (phase 3). Ailleurs, le mouvement répond à une action
   (ouvrir, filtrer, réserver).
2. **La typographie porte la personnalité** : Barlow Condensed 800 très grand, interlignage serré ; texte en Barlow
   16 à 18 px.
3. **La structure est de l'information** : une bordure, un numéro ou une étiquette n'apparaît que s'il signifie quelque
   chose (étapes d'inscription, jours de programme, statut d'une session).
4. **Un seul bouton jaune par écran** : l'action principale de la page. Les boutons des sessions sont bleus.
5. **Contenu réel partout** : aucune phrase creuse ni aucun chiffre décoratif. Une donnée absente → « Sur devis » ou
   « Nous consulter », jamais un texte de remplissage.
6. **Photos** : illustrations libres de droits recadrées en 3:2, décrites honnêtement ; jamais présentées comme le centre,
   ses salles ou ses formateurs (registre : `docs/image-sources.md`).

## 4. Relecture contre la liste « à éviter » (27/11/2026)

| Marque d'un site généré | Présent avant ? | Ce qui a changé |
|---|---|---|
| Sur-titre au-dessus de chaque titre | Oui (accueil, compte) | Retiré |
| Un mot du titre mis en couleur | Oui (titre de l'accueil) | Retiré : titre d'une seule couleur |
| Bandeau de gros chiffres | Oui (22 · 8 · 11 · 3) | Retiré ; les faits restent dans le héros, en texte |
| Grilles de cartes identiques à la même ombre | Partiellement (pourquoi nous) | Cartes de tailles différentes conservées ; à revoir avec la 3D |
| Dégradés décoratifs | Fonds du héros et des en-têtes | Conservés : ce sont des fonds encre/papier sobres (effet « nuit sur le chantier ») |
| Numéros sur des contenus non séquentiels | Non | Numéros réservés aux étapes et aux jours de programme |
| Apparition en fondu-glissé au défilement | Oui (20 blocs) | Retirée (JavaScript et CSS) |
| Flèche ajoutée à chaque lien | Oui (6 liens) | Retirée |
| Bandeaux qui défilent seuls (partenaires, langues) | Oui | Remplacés par des listes fixes |
| Plusieurs boutons jaunes sur un écran | Oui (tickets de session) | Boutons des tickets en bleu |
| Police à chasse fixe pour les étiquettes | Non | — |

## 5. Limites assumées

- Pas de photo des salles du centre tant que le client n'en fournit pas : la page Location de salles garde des
  emplacements illustrés (aucune photo libre présentée comme une salle du centre).
- Échafaudage et A.R.I. : aucune photo libre au contexte européen et aux équipements corrects n'a été trouvée ; ces
  fiches gardent le pictogramme du domaine comme illustration.
