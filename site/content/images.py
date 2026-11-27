"""Registre des photos du site : provenance, licence, point focal, textes alternatifs (FR / NL / EN) et usages.

Source unique : site/tools/optimize_images.py en tire les dérivés (AVIF + WebP, recadrage 3:2 sur le point focal) et
le registre public docs/image-sources.md ; site/build.py en tire les balises <picture>. Les originaux sont dans
assets-src/originaux/ (jamais servis tels quels).

Règles (mission, section 9.6) : licence vérifiée au téléchargement ; aucune marque ni logo lisible ; équipements de
protection corrects ; contexte européen ; aucune image générée par IA ; une photo libre n'est JAMAIS présentée comme le
centre, une salle, un formateur ou un participant du Centre CFS (textes alternatifs neutres). Les photos fournies par
le client (client/photos/) remplacent ces photos dès qu'elles existent.
"""

PEXELS_LICENSE = "Licence Pexels (https://www.pexels.com/license/) : usage gratuit, attribution non obligatoire"

# key : identifiant (nom des dérivés) ; focal : point focal (x, y) en fractions de la largeur et de la hauteur
IMAGES = {
    "reunion-securite-chantier": {
        "file": "vca/reunion-securite-chantier.jpg", "author": "Özkan Öztaş", "platform": "Pexels",
        "url": "https://www.pexels.com/photo/group-of-workers-in-yellow-hard-hats-at-construction-site-38043248/",
        "license": PEXELS_LICENSE, "retrieved": "2026-11-27", "focal": (0.5, 0.42), "ai": False,
        "check": "Casques portés par tous les participants ; aucune marque lisible.",
        "alt": {"fr": "Groupe d'ouvriers portant un casque de chantier jaune, réunis pour une consigne de sécurité",
                "nl": "Groep arbeiders met gele veiligheidshelm, verzameld voor een veiligheidsinstructie",
                "en": "Group of workers in yellow hard hats gathered for a safety briefing"},
    },
    "inspection-liste-controle": {
        "file": "prevention/inspection-liste-controle.jpg", "author": "RDNE Stock project", "platform": "Pexels",
        "url": "https://www.pexels.com/photo/a-bearded-man-in-safety-vest-looking-at-the-window-while-holding-a-clipboard-8293639/",
        "license": PEXELS_LICENSE, "retrieved": "2026-11-27", "focal": (0.55, 0.38), "ai": False,
        "check": "Casque, gilet haute visibilité et lunettes ; inspection intérieure.",
        "alt": {"fr": "Inspecteur en casque et gilet haute visibilité vérifiant une fenêtre, liste de contrôle en main",
                "nl": "Inspecteur met helm en fluohesje controleert een raam, met een checklist in de hand",
                "en": "Inspector in a hard hat and high-visibility vest checking a window, checklist in hand"},
    },
    "extincteur-panneau": {
        "file": "incendie/extincteur-panneau.jpg", "author": "Jakub Zerdzicki", "platform": "Pexels",
        "url": "https://www.pexels.com/photo/fire-alarm-21299748/",
        "license": PEXELS_LICENSE, "retrieved": "2026-11-27", "focal": (0.5, 0.45), "ai": False,
        "check": "Panneau ISO 7010 (F001) européen ; aucune marque lisible.",
        "alt": {"fr": "Extincteur fixé au mur sous un panneau de signalisation incendie",
                "nl": "Brandblusser aan de muur onder een brandveiligheidspictogram",
                "en": "Fire extinguisher mounted on a wall below a fire safety sign"},
    },
    "reanimation-mannequin": {
        "file": "secours/reanimation-mannequin.jpg", "author": "SHOX ART", "platform": "Pexels",
        "url": "https://www.pexels.com/photo/cpr-first-aid-cardiopulmonary-resuscitation-adult-pierwsza-pomoc-ratowanie-zycia-28271058/",
        "license": PEXELS_LICENSE, "retrieved": "2026-11-27", "focal": (0.45, 0.45), "ai": False,
        "check": "Gants à usage unique ; mannequin de formation ; aucun visage.",
        "alt": {"fr": "Mains gantées pratiquant un massage cardiaque sur un mannequin de formation",
                "nl": "Gehandschoende handen oefenen hartmassage op een oefenpop",
                "en": "Gloved hands practising chest compressions on a training manikin"},
    },
    "defibrillateur-entrainement": {
        "file": "secours/defibrillateur-entrainement.jpg", "author": "Raven Domingo", "platform": "Pexels",
        "url": "https://www.pexels.com/photo/hands-of-person-doing-cpr-on-training-dummy-11655091/",
        "license": PEXELS_LICENSE, "retrieved": "2026-11-27", "focal": (0.5, 0.55), "ai": False,
        "check": "Mannequin et électrodes d'entraînement ; aucun visage ; pas de marque lisible.",
        "alt": {"fr": "Exercice de réanimation sur mannequin avec les électrodes d'un défibrillateur d'entraînement",
                "nl": "Reanimatieoefening op een oefenpop met de elektroden van een trainings-AED",
                "en": "Resuscitation exercise on a manikin with the pads of a training defibrillator"},
    },
    "electricien-armoire": {
        "file": "electricite/electricien-armoire.jpg", "author": "Fatih Yurtman", "platform": "Pexels",
        "url": "https://www.pexels.com/photo/electrician-by-fuse-box-17842832/",
        "license": PEXELS_LICENSE, "retrieved": "2026-11-27", "focal": (0.4, 0.4), "ai": False,
        "check": "Casque, gilet haute visibilité, gants ; armoire à rails DIN (matériel de type européen).",
        "alt": {"fr": "Électricien portant casque, gilet haute visibilité et gants, intervenant dans une armoire électrique",
                "nl": "Elektricien met helm, fluohesje en handschoenen werkt in een elektrische kast",
                "en": "Electrician wearing a hard hat, high-visibility vest and gloves, working in an electrical cabinet"},
    },
    "futs-entrepot": {
        "file": "dangereux/futs-entrepot.jpg", "author": "Martin Zapata", "platform": "Pexels",
        "url": "https://www.pexels.com/photo/worker-in-warehouse-with-barrels-20379378/",
        "license": PEXELS_LICENSE, "retrieved": "2026-11-27", "focal": (0.35, 0.5), "ai": False,
        "check": "Casque et gilet haute visibilité ; étiquettes de danger normalisées sur les fûts.",
        "alt": {"fr": "Travailleur casqué en gilet haute visibilité déplaçant des fûts étiquetés dans un entrepôt",
                "nl": "Werknemer met helm en fluohesje verplaatst gelabelde vaten in een magazijn",
                "en": "Worker in a hard hat and high-visibility vest moving labelled drums in a warehouse"},
    },
    "protection-respiratoire-amiante": {
        "file": "dangereux/protection-respiratoire-amiante.jpg", "author": "Tima Miroshnichenko", "platform": "Pexels",
        "url": "https://www.pexels.com/photo/a-man-in-personal-protective-equipment-wearing-gas-mask-6474117/",
        "license": PEXELS_LICENSE, "retrieved": "2026-11-27", "focal": (0.5, 0.32), "ai": False,
        "check": "Combinaison de protection, masque respiratoire, gants ; zone confinée par bâches.",
        "alt": {"fr": "Travailleur en combinaison de protection et masque respiratoire devant une zone confinée",
                "nl": "Werknemer in beschermingspak met ademhalingsmasker voor een afgeschermde zone",
                "en": "Worker in a protective suit and respirator in front of a sealed-off area"},
    },
    "bureau-reglable": {
        "file": "ergonomie/bureau-reglable.jpg", "author": "Pavel Danilyuk", "platform": "Pexels",
        "url": "https://www.pexels.com/photo/a-monitor-on-a-height-adjustable-desk-8001036/",
        "license": PEXELS_LICENSE, "retrieved": "2026-11-27", "focal": (0.5, 0.5), "ai": False,
        "check": "Aucune personne ; aucune marque lisible.",
        "alt": {"fr": "Bureau réglable en hauteur avec un écran", "nl": "In hoogte verstelbaar bureau met een beeldscherm",
                "en": "Height-adjustable desk with a monitor"},
    },
    "travail-hauteur-harnais": {
        "file": "equipements/travail-hauteur-harnais.jpg", "author": "Carla Fontes", "platform": "Pexels",
        "url": "https://www.pexels.com/photo/trabajo-en-altura-28243011/",
        "license": PEXELS_LICENSE, "retrieved": "2026-11-27", "focal": (0.45, 0.55), "ai": False,
        "check": "Casque, harnais et cordes ; travail sur façade.",
        "alt": {"fr": "Technicien casqué, équipé d'un harnais et de cordes, travaillant en hauteur sur une façade",
                "nl": "Technicus met helm, harnas en touwen werkt op hoogte aan een gevel",
                "en": "Technician in a hard hat, with a harness and ropes, working at height on a facade"},
    },
    "nacelle-elevatrice": {
        "file": "equipements/nacelle-elevatrice.jpg", "author": "Jonathan Cooper", "platform": "Pexels",
        "url": "https://www.pexels.com/photo/orange-and-black-heavy-equipment-on-road-9690057/",
        "license": PEXELS_LICENSE, "retrieved": "2026-11-27", "focal": (0.6, 0.5), "ai": False,
        "check": "Aucune personne ; aucune marque lisible.",
        "alt": {"fr": "Nacelle élévatrice à bras articulé stationnée près d'un bâtiment",
                "nl": "Hoogwerker met knikarm geparkeerd naast een gebouw", "en": "Articulated boom lift parked next to a building"},
    },
    "chariot-entrepot": {
        "file": "equipements/chariot-entrepot.jpg", "author": "Jimmy Nilsson Masth", "platform": "Pexels",
        "url": "https://www.pexels.com/photo/man-in-machine-working-on-warehouse-13532504/",
        "license": PEXELS_LICENSE, "retrieved": "2026-11-27", "focal": (0.5, 0.45), "ai": False,
        "check": "Photo en noir et blanc ; équipements du conducteur peu visibles (pas mis en avant) ; aucune marque lisible.",
        "alt": {"fr": "Cariste conduisant un chariot dans une allée d'entrepôt",
                "nl": "Heftruckchauffeur rijdt in een magazijngang",
                "en": "Operator driving a truck down a warehouse aisle"},
    },
    "crochet-pont-roulant": {
        "file": "equipements/crochet-pont-roulant.jpg", "author": "Cemrecan Yurtman", "platform": "Pexels",
        "url": "https://www.pexels.com/photo/yellow-industrial-crane-hook-in-a-factory-setting-29224557/",
        "license": PEXELS_LICENSE, "retrieved": "2026-11-27", "focal": (0.5, 0.45), "ai": False,
        "check": "Aucune personne ; charge maximale (5 t) indiquée sur le crochet.",
        "alt": {"fr": "Crochet de pont roulant d'une capacité de 5 tonnes dans un hall industriel",
                "nl": "Haak van een rolbrug van 5 ton in een industriële hal", "en": "5-tonne overhead crane hook in an industrial hall"},
    },
    "formation-en-salle": {
        "file": "formation/formation-en-salle.jpg", "author": "fauxels", "platform": "Pexels",
        "url": "https://www.pexels.com/photo/man-wearing-gray-dress-shirt-and-blue-jeans-3184317/",
        "license": PEXELS_LICENSE, "retrieved": "2026-11-27", "focal": (0.55, 0.45), "ai": False,
        "check": "Salle neutre ; présentée comme illustration, jamais comme une salle du Centre CFS.",
        "alt": {"fr": "Formateur s'adressant à un groupe d'adultes assis dans une salle",
                "nl": "Opleider spreekt een groep volwassenen in een zaal toe", "en": "Trainer speaking to a group of seated adults in a room"},
    },
    "echange-tableau": {
        "file": "formation/echange-tableau.jpg", "author": "Gustavo Fring", "platform": "Pexels",
        "url": "https://www.pexels.com/photo/teacher-looking-at-a-white-board-7156097/",
        "license": PEXELS_LICENSE, "retrieved": "2026-11-27", "focal": (0.5, 0.4), "ai": False,
        "check": "Aucune marque lisible.",
        "alt": {"fr": "Deux personnes échangent devant un tableau de papier", "nl": "Twee mensen overleggen voor een flip-over",
                "en": "Two people talking in front of a flip chart"},
    },
}

# Image principale de chaque domaine, et des formations qui ont une photo plus précise (sinon : celle du domaine).
DOMAIN_IMAGE = {
    "vca": "reunion-securite-chantier", "prevention": "inspection-liste-controle", "incendie": "extincteur-panneau",
    "secours": "reanimation-mannequin", "electricite": "electricien-armoire", "dangereux": "futs-entrepot",
    "ergonomie": "bureau-reglable", "equipements": "travail-hauteur-harnais",
}
FORMATION_IMAGE = {
    "dea-defibrillateur": "defibrillateur-entrainement", "amiante": "protection-respiratoire-amiante",
    "nacelle": "nacelle-elevatrice", "chariot-elevateur": "chariot-entrepot", "pont-roulant": "crochet-pont-roulant",
    # Aucune photo européenne correcte trouvée : le pictogramme du domaine sert d'illustration.
    "echafaudage": None, "ari-appareil-respiratoire": None,
}
PAGE_IMAGE = {
    "entreprises": "reunion-securite-chantier", "centre": "formation-en-salle", "langues": "echange-tableau",
}
ARTICLE_IMAGE = {
    "vca-base-ou-vca-cadre": "reunion-securite-chantier", "ba4-ou-ba5-habilitation-electrique": "electricien-armoire",
    "secouriste-entreprise-obligations": "reanimation-mannequin", "centre-cfs-former-aujourdhui-pour-prevenir-demain": "formation-en-salle",
}
