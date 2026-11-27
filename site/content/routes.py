"""Table unique des adresses du site, dans les 3 langues.

Le français reste à la racine (adresses actuelles inchangées) ; le néerlandais sous /nl/, l'anglais sous /en/,
avec des slugs traduits. Le sélecteur de langue, les balises hreflang, le sitemap, les e-mails (liens) et le Worker
lisent tous cette table (le Worker via worker/src/generated/routes.json, écrit par build.py).
"""

LANGS = ("fr", "nl", "en")
DEFAULT_LANG = "fr"
PREFIX = {"fr": "", "nl": "/nl", "en": "/en"}
HTML_LANG = {"fr": "fr-BE", "nl": "nl-BE", "en": "en"}
HREFLANG = {"fr": "fr-BE", "nl": "nl-BE", "en": "en"}
OG_LOCALE = {"fr": "fr_BE", "nl": "nl_BE", "en": "en_GB"}
INTL = {"fr": "fr-BE", "nl": "nl-BE", "en": "en-BE"}

# Pages simples : clé → chemin (sans préfixe de langue)
PAGES = {
    "home": {"fr": "/", "nl": "/", "en": "/"},
    "formations": {"fr": "/formations/", "nl": "/opleidingen/", "en": "/training/"},
    "agenda": {"fr": "/agenda/", "nl": "/agenda/", "en": "/schedule/"},
    "inscription": {"fr": "/inscription/", "nl": "/inschrijving/", "en": "/registration/"},
    "entreprises": {"fr": "/entreprises/", "nl": "/bedrijven/", "en": "/in-company/"},
    "salles": {"fr": "/location-salles/", "nl": "/zaalverhuur/", "en": "/room-hire/"},
    "centre": {"fr": "/le-centre/", "nl": "/het-centrum/", "en": "/about/"},
    "actualites": {"fr": "/actualites/", "nl": "/nieuws/", "en": "/news/"},
    "faq": {"fr": "/faq/", "nl": "/faq/", "en": "/faq/"},
    "contact": {"fr": "/contact/", "nl": "/contact/", "en": "/contact/"},
    "mentions": {"fr": "/mentions-legales/", "nl": "/juridische-informatie/", "en": "/legal-notice/"},
    "confidentialite": {"fr": "/confidentialite/", "nl": "/privacy/", "en": "/privacy/"},
    "cgv": {"fr": "/conditions-generales/", "nl": "/algemene-voorwaarden/", "en": "/terms/"},
    "plan": {"fr": "/plan-du-site/", "nl": "/sitemap/", "en": "/sitemap/"},
    "paiement": {"fr": "/paiement/", "nl": "/betaling/", "en": "/payment/"},
    "compte": {"fr": "/compte/", "nl": "/account/", "en": "/account/"},
    "connexion": {"fr": "/compte/connexion/", "nl": "/account/aanmelden/", "en": "/account/sign-in/"},
    "creer": {"fr": "/compte/creer/", "nl": "/account/registreren/", "en": "/account/sign-up/"},
    "motdepasse": {"fr": "/compte/mot-de-passe/", "nl": "/account/wachtwoord/", "en": "/account/password/"},
    "confirmation": {"fr": "/compte/confirmation/", "nl": "/account/bevestiging/", "en": "/account/confirm/"},
    "admin": {"fr": "/compte/equipe/", "nl": "/account/team/", "en": "/account/team/"},
    "langues": {"fr": "/langues/", "nl": "/talen/", "en": "/languages/"},
    "accessibilite": {"fr": "/accessibilite/", "nl": "/toegankelijkheid/", "en": "/accessibility/"},
    "cookies": {"fr": "/cookies/", "nl": "/cookies/", "en": "/cookies/"},
}

# Domaines : slug FR → slug traduit
DOMAINS = {
    "vca": {"nl": "vca", "en": "vca"},
    "prevention": {"nl": "preventieadviseur", "en": "prevention-advisor"},
    "incendie": {"nl": "brand", "en": "fire"},
    "secours": {"nl": "eerste-hulp", "en": "first-aid"},
    "electricite": {"nl": "elektriciteit", "en": "electrical"},
    "dangereux": {"nl": "gevaarlijke-stoffen", "en": "hazardous-substances"},
    "ergonomie": {"nl": "ergonomie", "en": "ergonomics"},
    "equipements": {"nl": "arbeidsmiddelen", "en": "work-equipment"},
}
DOMAIN_BASE = {"fr": "/domaines/", "nl": "/domeinen/", "en": "/domains/"}

# Formations : slug FR (identifiant partout : feuille, sessions, réservations) → slug traduit
FORMATIONS = {
    "vca-base": {"nl": "vca-basis", "en": "vca-basic"},
    "vca-ligne-hierarchique": {"nl": "vol-vca", "en": "vol-vca"},
    "conseiller-prevention-base": {"nl": "preventieadviseur-basis", "en": "prevention-advisor-basic"},
    "recyclage-conseiller-prevention": {"nl": "bijscholing-preventieadviseur", "en": "prevention-advisor-refresher"},
    "secourisme-base": {"nl": "hulpverlener-basis", "en": "workplace-first-aid"},
    "rappel-secourisme": {"nl": "bijscholing-hulpverlener", "en": "first-aid-refresher"},
    "initiation-premiers-soins": {"nl": "initiatie-eerste-hulp", "en": "first-aid-awareness"},
    "dea-defibrillateur": {"nl": "aed-defibrillator", "en": "aed-defibrillator"},
    "equipier-premiere-intervention": {"nl": "eerste-interventieploeg", "en": "first-response-fire-team"},
    "recyclage-equipier-premiere-intervention": {"nl": "bijscholing-eerste-interventieploeg", "en": "fire-team-refresher"},
    "initiation-feu": {"nl": "initiatie-brandbestrijding", "en": "fire-extinguisher-training"},
    "ari-appareil-respiratoire": {"nl": "onafhankelijk-ademhalingstoestel", "en": "breathing-apparatus"},
    "ba4": {"nl": "ba4", "en": "ba4"},
    "ba5": {"nl": "ba5", "en": "ba5"},
    "produits-dangereux": {"nl": "gevaarlijke-producten", "en": "hazardous-substances"},
    "amiante": {"nl": "asbest", "en": "asbestos"},
    "ergonomie": {"nl": "ergonomie", "en": "ergonomics"},
    "harnais": {"nl": "harnas-werken-op-hoogte", "en": "harness-work-at-height"},
    "nacelle": {"nl": "hoogwerker", "en": "aerial-work-platform"},
    "chariot-elevateur": {"nl": "heftruck", "en": "forklift"},
    "echafaudage": {"nl": "steigerbouw", "en": "scaffolding"},
    "pont-roulant": {"nl": "rolbrug", "en": "overhead-crane"},
}
FORMATION_BASE = {"fr": "/formations/", "nl": "/opleidingen/", "en": "/training/"}

# Articles : clé → chemin complet par langue (l'article AKT garde son adresse WordPress d'origine en français)
ARTICLES = {
    "vca-base-ou-vca-cadre": {"fr": "/actualites/vca-base-ou-vca-cadre/", "nl": "/nieuws/vca-basis-of-vol-vca/", "en": "/news/vca-basic-or-vol-vca/"},
    "ba4-ou-ba5-habilitation-electrique": {"fr": "/actualites/ba4-ou-ba5-habilitation-electrique/", "nl": "/nieuws/ba4-of-ba5/", "en": "/news/ba4-or-ba5/"},
    "secouriste-entreprise-obligations": {"fr": "/actualites/secouriste-entreprise-obligations/", "nl": "/nieuws/hulpverlener-op-het-werk-verplichtingen/", "en": "/news/workplace-first-aider-obligations/"},
    "centre-cfs-former-aujourdhui-pour-prevenir-demain": {"fr": "/centre-cfs-former-aujourdhui-pour-prevenir-demain/", "nl": "/nieuws/centre-cfs-lid-van-akt/", "en": "/news/centre-cfs-joins-akt/"},
}


def page(key, lang):
    """Chemin complet d'une page simple (« /nl/opleidingen/ »)."""
    p = PAGES[key][lang]
    return PREFIX[lang] + p if p != "/" else (PREFIX[lang] + "/" if PREFIX[lang] else "/")


def formation(slug, lang):
    s = slug if lang == "fr" else FORMATIONS[slug][lang]
    return PREFIX[lang] + FORMATION_BASE[lang] + s + "/"


def domain(slug, lang):
    s = slug if lang == "fr" else DOMAINS[slug][lang]
    return PREFIX[lang] + DOMAIN_BASE[lang] + s + "/"


def article(key, lang):
    return PREFIX[lang] + ARTICLES[key][lang]


def og_image(slug, lang):
    """Image de partage d'une formation (une par langue)."""
    return f"/assets/img/og/{slug}{'' if lang == 'fr' else '.' + lang}.png"


def export():
    """Table complète pour le JavaScript et le Worker (JSON)."""
    return {
        "langs": list(LANGS),
        "pages": {k: {l: page(k, l) for l in LANGS} for k in PAGES},
        "formations": {s: {l: formation(s, l) for l in LANGS} for s in FORMATIONS},
        "domains": {s: {l: domain(s, l) for l in LANGS} for s in DOMAINS},
        "articles": {k: {l: article(k, l) for l in LANGS} for k in ARTICLES},
    }
