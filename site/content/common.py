"""Données communes aux 3 langues (identifiants, coordonnées, structure du catalogue).

Les TEXTES sont dans fr.py, nl.py et en.py. Les données métier chiffrées (prix HTVA, capacité par défaut,
réservable en ligne) viennent de client/formations.csv, lu par site/tools/import_client.py : ce fichier n'en
contient AUCUNE. Rien n'est inventé : une donnée absente reste vide (« Sur devis », « Nous consulter »).
"""

SITE = {
    "name": "Centre CFS",
    "url": "https://centrecfs.be",
    "phone": "+32 475 34 02 89",
    "phone_display": "0475 34 02 89",
    "email": "info@centrecfs.be",
    "linkedin": "https://www.linkedin.com/company/centre-cfs",
    "bce": None,  # À compléter (client/infos-entreprise.md) — obligatoire dans les mentions légales
    "closure_until": "2027-01-04",  # bandeau « fermeture de fin d'année » affiché jusqu'à cette date
    "closure_from": "2026-12-01",
    "since": None,  # année de création : 2012 ou 2013 selon les sources (docs/A-COMPLETER.md) ; jamais publiée tant qu'elle n'est pas confirmée
}

LIEUX = {
    "engis": {"street": "Rue de la Paix 12", "zip": "4480", "city": "Engis",
              "maps": "https://www.google.com/maps/search/?api=1&query=Rue+de+la+Paix+12+4480+Engis"},
    "charleroi": {"street": "Rue des Français 147", "zip": "6020", "city": "Charleroi",
                  "maps": "https://www.google.com/maps/search/?api=1&query=Rue+des+Fran%C3%A7ais+147+6020+Charleroi"},
    "intra": {"street": "", "zip": "", "city": "", "maps": ""},
}

# Les 11 langues de formation (codes ISO) et une salutation dans chacune (bandeau défilant de l'accueil)
LANG_CODES = ["fr", "nl", "de", "en", "it", "es", "pt", "ro", "ru", "tr", "bg"]
GREETINGS = [("fr", "Bonjour"), ("nl", "Goedendag"), ("de", "Guten Tag"), ("en", "Hello"), ("it", "Buongiorno"),
             ("es", "Buenos días"), ("pt", "Bom dia"), ("ro", "Bună ziua"), ("ru", "Здравствуйте"), ("tr", "Merhaba"),
             ("bg", "Здравейте")]

# shape : cercle = obligation (bleu) · carre = incendie (rouge) / secours (vert) · triangle = avertissement (jaune)
DOMAINES = [
    {"slug": "vca", "shape": "cercle", "color": "bleu", "icon": "casque"},
    {"slug": "prevention", "shape": "cercle", "color": "bleu", "icon": "dossier"},
    {"slug": "incendie", "shape": "carre", "color": "rouge", "icon": "flamme"},
    {"slug": "secours", "shape": "carre", "color": "vert", "icon": "croix"},
    {"slug": "electricite", "shape": "triangle", "color": "jaune", "icon": "eclair"},
    {"slug": "dangereux", "shape": "triangle", "color": "jaune", "icon": "flacon"},
    {"slug": "ergonomie", "shape": "cercle", "color": "bleu", "icon": "posture"},
    {"slug": "equipements", "shape": "cercle", "color": "bleu", "icon": "crochet"},
]

# Ordre d'affichage, domaine et lieux de chaque formation (identifiant = slug FR, partout le même)
FORMATIONS = [
    {"slug": "vca-base", "domain": "vca", "lieux": ["engis", "charleroi", "intra"], "workload": "PT8H"},
    {"slug": "vca-ligne-hierarchique", "domain": "vca", "lieux": ["engis", "charleroi", "intra"]},
    {"slug": "conseiller-prevention-base", "domain": "prevention", "lieux": ["engis", "intra"]},
    {"slug": "recyclage-conseiller-prevention", "domain": "prevention", "lieux": ["engis", "intra"]},
    {"slug": "secourisme-base", "domain": "secours", "lieux": ["engis", "intra"]},
    {"slug": "rappel-secourisme", "domain": "secours", "lieux": ["engis", "intra"]},
    {"slug": "initiation-premiers-soins", "domain": "secours", "lieux": ["intra", "engis"]},
    {"slug": "dea-defibrillateur", "domain": "secours", "lieux": ["intra", "engis"]},
    {"slug": "equipier-premiere-intervention", "domain": "incendie", "lieux": ["engis", "intra"]},
    {"slug": "recyclage-equipier-premiere-intervention", "domain": "incendie", "lieux": ["engis", "intra"]},
    {"slug": "initiation-feu", "domain": "incendie", "lieux": ["engis", "intra"]},
    {"slug": "ari-appareil-respiratoire", "domain": "incendie", "lieux": ["engis", "intra"]},
    {"slug": "ba4", "domain": "electricite", "lieux": ["engis", "intra"]},
    {"slug": "ba5", "domain": "electricite", "lieux": ["engis", "intra"]},
    {"slug": "produits-dangereux", "domain": "dangereux", "lieux": ["engis", "intra"]},
    {"slug": "amiante", "domain": "dangereux", "lieux": ["engis", "intra"]},
    {"slug": "ergonomie", "domain": "ergonomie", "lieux": ["intra", "engis"]},
    {"slug": "harnais", "domain": "equipements", "lieux": ["engis", "intra"]},
    {"slug": "nacelle", "domain": "equipements", "lieux": ["engis", "intra"]},
    {"slug": "chariot-elevateur", "domain": "equipements", "lieux": ["engis", "intra"]},
    {"slug": "echafaudage", "domain": "equipements", "lieux": ["engis", "intra"]},
    {"slug": "pont-roulant", "domain": "equipements", "lieux": ["engis", "intra"]},
]

SALLES = [
    {"cap": 10, "img": "salle-01.jpg"},
    {"cap": 15, "img": "salle-02.jpg"},
    {"cap": 25, "img": "salle-03.jpg"},
]

# Articles : date, formations liées (l'article AKT n'a pas de date publiée sur l'ancien site)
ARTICLES = [
    {"key": "vca-base-ou-vca-cadre", "date": "2026-11-26", "related": ["vca-base", "vca-ligne-hierarchique"]},
    {"key": "ba4-ou-ba5-habilitation-electrique", "date": "2026-11-26", "related": ["ba4", "ba5"]},
    {"key": "secouriste-entreprise-obligations", "date": "2026-11-26", "related": ["secourisme-base", "rappel-secourisme", "dea-defibrillateur"]},
    {"key": "centre-cfs-former-aujourdhui-pour-prevenir-demain", "date": "2026-10-26", "related": []},
]
