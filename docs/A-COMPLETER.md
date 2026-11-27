# À compléter

Ce qui manque pour que le site soit complet et exact. Rien de ceci ne bloque le travail : le site affiche « Sur devis »,
« Nous consulter » ou n'affiche pas le bloc. Mis à jour le 27/11/2026 (phase 0). Le détail des données importées est
dans `docs/RAPPORT-IMPORT.md` (régénéré à chaque construction).

## 1. Questions à trancher par le Centre CFS (sources contradictoires)

| Question | Ce qu'on a | Où ça sert |
|---|---|---|
| Année de création : **2012 ou 2013** ? | Données structurées : 2012 (« partenaire de Technifutur depuis 2012 ») ; article AKT : « fondée en 2013 » | Page « Le centre », données pour Google |
| Durée de l'**initiation aux premiers soins** : 2 h ou 8 h ? | Ancien site : titre « Programme (8h) » mais texte « 2H00 » ; catalogue : 2 h (retenu) | Fiche formation |
| Peut-on publier les **noms cités dans l'article AKT** (Dominique Cornet, Anaëlle, Christian Guyot, Julie, Xavier Vercruysse) ? | Publiés sur l'ancien site | Article AKT, page « Le centre » |
| Le certificat VCA est-il « **agréé** » ? Par qui ? | Ancien site : « certificat agréé » ; aucune preuve fournie | Fiches VCA (le mot n'est pas repris sans preuve) |

## 2. Informations de l'entreprise (`client/infos-entreprise.md`)

- [ ] Numéro BCE, forme juridique, numéro de TVA (obligatoires dans les mentions légales)
- [ ] Horaires d'ouverture du centre
- [ ] Accès, parking et transports pour Engis et Charleroi ; zone d'intervention en entreprise
- [ ] Taux de TVA des formations (21 % par défaut, **à confirmer par le comptable**) et logiciel comptable (factures Peppol)
- [ ] Durées de conservation des données (demandes, réservations, comptes)
- [ ] Réseaux sociaux : Instagram, Facebook, TikTok (s'ils existent)
- [ ] Compte Google propriétaire de la feuille (idéalement Google Workspace), personnes qui y ont accès
- [ ] Boîte e-mail à connecter à EmailJS, accès DNS du domaine centrecfs.be

## 3. Données des formations et des sessions (`client/*.csv`)

- [ ] **Prix HTVA de 18 formations** (seuls VCA Base, VCA Cadre, BA4 et BA5 ont un prix)
- [ ] **Durée de 13 formations**, horaires de 18 formations
- [ ] **Capacité de chaque session** (toutes vides : aucune session n'est réservable en ligne sans capacité) et capacité
      par défaut de chaque formation
- [ ] Modalités d'examen (16 formations sans examen décrit) et certificat délivré (18 formations sans certificat décrit)
- [ ] Prochaines dates pour les formations sans session
- [ ] Tarifs de location des 3 salles (demi-journée, journée, semaine)

## 4. Contenus et fichiers

- [ ] `client/cgv.md` : conditions générales validées (sinon le brouillon « à valider juridiquement » reste affiché)
- [ ] `client/ancien-logo.png` : logo historique (à conserver dans le dossier d'identité)
- [ ] `client/photos/` : salles, exercices, formateurs, avec les accords écrits (`accords-photos.csv`)
- [ ] `client/logos-partenaires/` : uniquement avec autorisation écrite
- [ ] `client/temoignages.csv` : uniquement avec accord écrit (sinon la section n'existe pas)
- [ ] `client/traductions-relues/` : relecture des textes néerlandais et anglais par un natif
- [ ] Texte complet de l'article AKT validé pour republication (voir section 1)
- [ ] Références réglementaires du travail en hauteur à revérifier (directives de 1989 remplacées depuis) avant de les
      reprendre sur les fiches harnais et nacelle

## 5. Actions de Rayane (outils et comptes)

- [ ] **Déposer `PROMPT_CLAUDE_CODE.md` à la racine du dépôt** (le fichier original : la mission a été collée dans la
      conversation, elle n'est pas dans le dépôt) et `GUIDE-INSTALLATION-EMAILJS.md`
- [ ] Installer **Node.js 22** (nécessaire pour `npm test`, Wrangler, Playwright, Lighthouse) et pytest
      (`python3 -m pip install pytest`)
- [ ] Décision D-001 (hébergement) avant la phase 4
- [ ] Comptes à créer au moment indiqué par `docs/PLAN.md` : Cloudflare, Supabase (région UE), EmailJS, Mollie (au nom du
      Centre CFS), Turnstile ; jamais de clé dans le code ni dans la conversation
- [ ] Remettre `FORM_EMAIL` sur `info@centrecfs.be` quand la boîte du centre est prête (variable GitHub, voir `README.md`)
