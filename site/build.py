#!/usr/bin/env python3
"""Générateur du site statique Centre CFS, en 3 langues (FR à la racine, NL sous /nl/, EN sous /en/).

    python3 site/build.py          # site de production dans dist/
    python3 site/build.py --dev    # idem, avec la configuration locale (.dev.vars) et sans cache long

Le contenu est dans site/content/ (textes par langue, table des adresses, chaînes d'interface), les données métier
chiffrées dans client/ (lues par site/tools/import_client.py). Aucune date ni aucune place n'est écrite dans le
HTML : l'agenda, les blocs « Prochaines sessions » et l'inscription lisent window.CfsSessions dans le navigateur.
Compatible Python 3.9 (aucune dépendance obligatoire).
"""
import hashlib
import html
import importlib
import json
import os
import re
import shutil
import sys
import urllib.request
from datetime import date
from urllib.parse import urlparse

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)

from content import common as C  # noqa: E402
from content import routes as R  # noqa: E402
from content import images as IMG  # noqa: E402
from lib import logo as L  # noqa: E402
from lib.icons import icon, sign  # noqa: E402
sys.path.insert(0, os.path.join(HERE, "tools"))
import import_client  # noqa: E402
import sync_gas_i18n  # noqa: E402
import build_kb  # noqa: E402

OUT = os.path.join(ROOT, "dist")
SRC = os.path.join(HERE, "src")
LANGS = R.LANGS
DEV = "--dev" in sys.argv
BUILD_DATE = date.fromisoformat(os.environ["BUILD_DATE"]) if os.environ.get("BUILD_DATE") else date.today()
NBSP = " "
NNBSP = " "

T = {lang: importlib.import_module(f"content.{lang}") for lang in LANGS}
UI = {lang: json.load(open(os.path.join(HERE, "content", f"ui.{lang}.json"), encoding="utf-8")) for lang in LANGS}
DOM = {d["slug"]: d for d in C.DOMAINES}
FORM = {f["slug"]: f for f in C.FORMATIONS}
L._sid[0] = 100  # identifiants SVG uniques (les fichiers de logo utilisent cfs2…cfs11)


def E(s):
    return html.escape(str(s), quote=True)


# ───────────────────────────── configuration publique (jamais de secret ici)
def read_dev_vars():
    out = {}
    path = os.path.join(ROOT, ".dev.vars")
    if DEV and os.path.exists(path):
        for line in open(path, encoding="utf-8"):
            m = re.match(r"\s*([A-Z0-9_]+)\s*=\s*\"?(.*?)\"?\s*$", line)
            if m and not line.lstrip().startswith("#"):
                out[m.group(1)] = m.group(2)
    return out


_DV = read_dev_vars()


def cfg(key, default=""):
    # BASE_PATH vide et explicite (site servi à la racine, Worker Cloudflare) l'emporte sur .dev.vars
    if key == "BASE_PATH" and key in os.environ:
        return os.environ[key]
    return os.environ.get(key) or _DV.get(key) or default


def base_path(v):
    """« Centre-CFS/ » → « /Centre-CFS » ; vide → « » (site servi à la racine du domaine)."""
    v = (v or "").strip().strip("/")
    if v and not re.match(r"^[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)*$", v):
        sys.exit(f"Configuration invalide : BASE_PATH = {v}")
    return "/" + v if v else ""


# Chemin de base : « /Centre-CFS » quand le site est servi par GitHub Pages sans domaine personnalisé
# (https://<compte>.github.io/Centre-CFS/), vide avec un domaine (https://centrecfs.be/).
BASE = base_path(cfg("BASE_PATH"))

# Les fonctions qui demandent un serveur (Worker Cloudflare, Supabase, Mollie) sont DÉSACTIVÉES par défaut : un site
# statique (GitHub Pages) ne peut pas les faire tourner. Le code reste en place ; chaque option s'active par une variable.
# WORKER_API=1 : le site est servi par le Worker Cloudflare (même domaine) et utilise son API /api/*.
API = cfg("WORKER_API", "0") == "1"
# « Tout chez Google » (DECISIONS.md D-018) : le site parle directement à l'application Web de la feuille Google
# (formulaires, agenda en direct, réservations sur facture), sans Worker. Adresse publique « …/exec » du déploiement.
GOOGLE = cfg("GOOGLE_SCRIPT_URL", "").strip()
if GOOGLE and API:
    sys.exit("GOOGLE_SCRIPT_URL et WORKER_API=1 s'excluent : choisir l'accès direct à la feuille OU le Worker")
if GOOGLE and not (re.match(r"^https://script\.google\.com/macros/s/[A-Za-z0-9_-]{20,200}/exec$", GOOGLE)
                   or (DEV and re.match(r"^/[A-Za-z0-9/_-]+$", GOOGLE))):
    sys.exit(f"Configuration invalide : GOOGLE_SCRIPT_URL = {GOOGLE} (adresse https://script.google.com/macros/s/…/exec)")
PUBLIC = {
    # Envoi réel des demandes (Worker ou feuille Google en direct) ; sinon le formulaire prépare un e-mail
    "api": API or bool(GOOGLE),
    # Accès direct à la feuille : corps JSON envoyé en text/plain (requête « simple », sans pré-vérification CORS)
    "direct": bool(GOOGLE),
    "siteUrl": cfg("SITE_URL", "http://localhost:8787" if DEV else C.SITE["url"]).rstrip("/"),
    "basePath": BASE,
    "supabaseUrl": cfg("SUPABASE_URL"),
    "supabaseKey": cfg("SUPABASE_PUBLISHABLE_KEY"),
    "turnstileSiteKey": cfg("TURNSTILE_SITE_KEY"),
    "googleAuth": cfg("AUTH_GOOGLE_ENABLED", "0") == "1",
    "chatbot": cfg("CHATBOT_ENABLED", "0") == "1",
    "accounts": cfg("ACCOUNTS_ENABLED", "0") == "1",
    "onlinePayment": cfg("ONLINE_PAYMENT_ENABLED", "0") == "1",
    # Adresse qui reçoit les formulaires en JSON (Worker, Formspree…). Vide : le formulaire prépare un e-mail.
    "formEndpoint": cfg("FORM_ENDPOINT", "/api/contact" if API else f"{GOOGLE}?route=contact" if GOOGLE else ""),
    # Liste publique des sessions avec les places en direct (JSON { status: "ok", sessions: [...] }). Vide : fichier de secours.
    "sessionsUrl": cfg("SESSIONS_PUBLIC_URL", "/api/sessions" if API else f"{GOOGLE}?route=sessions" if GOOGLE else ""),
    # Réservations (Worker) : places vérifiées sous verrou par la feuille, montant calculé par la feuille
    "registrationEndpoint": "/api/registrations" if API else f"{GOOGLE}?route=registration" if GOOGLE else "",
    "email": C.SITE["email"],
    # Destinataire des demandes préparées par e-mail (mode sans FORM_ENDPOINT). Par défaut : l'adresse du centre.
    "formEmail": cfg("FORM_EMAIL", C.SITE["email"]),
    "phone": C.SITE["phone_display"],
    "vatRate": float(cfg("VAT_RATE", "0.21")),
}
for k in ("supabaseUrl",):
    if PUBLIC[k] and not re.match(r"^https?://[A-Za-z0-9.-]+(:\d+)?$", PUBLIC[k]):
        sys.exit(f"Configuration invalide : {k} = {PUBLIC[k]}")
for k in ("formEndpoint", "sessionsUrl"):
    if PUBLIC[k] and not re.match(r"^(https://[A-Za-z0-9.-]+(:\d+)?|)/[A-Za-z0-9._~/?=&%-]*$", PUBLIC[k]):
        sys.exit(f"Configuration invalide : {k} = {PUBLIC[k]} (adresse https:// ou chemin commençant par /)")
if not re.match(r"^[^@\s\"<>]+@[^@\s\"<>]+\.[A-Za-z]{2,}$", PUBLIC["formEmail"]):
    sys.exit(f"Configuration invalide : FORM_EMAIL = {PUBLIC['formEmail']}")
if PUBLIC["accounts"] and not (PUBLIC["supabaseUrl"] and PUBLIC["supabaseKey"]):
    sys.exit("ACCOUNTS_ENABLED=1 demande SUPABASE_URL et SUPABASE_PUBLISHABLE_KEY")
if PUBLIC["onlinePayment"] and not API:
    sys.exit("ONLINE_PAYMENT_ENABLED=1 demande le Worker (WORKER_API=1)")
if PUBLIC["accounts"] and not API:
    sys.exit("ACCOUNTS_ENABLED=1 demande le Worker (WORKER_API=1)")
CANON = C.SITE["url"]  # adresses canoniques et données structurées : toujours le domaine officiel
# Aperçu (GitHub Pages sans domaine, développement) : jamais indexé, pour ne pas concurrencer le domaine officiel.
PREVIEW = urlparse(PUBLIC["siteUrl"]).netloc.removeprefix("www.") != urlparse(CANON).netloc.removeprefix("www.")


# ───────────────────────────── données client (prix, capacités) et sessions réelles
import_client.run(quiet=True)
CLIENT = json.load(open(os.path.join(HERE, "content", "client_data.json"), encoding="utf-8"))
PRICE = {s: CLIENT["formations"].get(s, {}).get("prix") for s in FORM}
BOOKABLE = {s: CLIENT["formations"].get(s, {}).get("reservable", True) for s in FORM}


def load_sessions():
    """Sessions réelles pour les données structurées : la feuille (via SESSIONS_SOURCE_URL) ou le fichier de secours."""
    url = cfg("SESSIONS_SOURCE_URL")
    if url:
        try:
            with urllib.request.urlopen(url, timeout=15) as res:
                data = json.load(res)
            if data.get("status") == "ok" and isinstance(data.get("sessions"), list):
                return data["sessions"], "sheets"
        except Exception as exc:  # noqa: BLE001 — la construction ne doit jamais échouer pour ça
            print(f"  (sessions en direct indisponibles : {exc} — fichier de secours utilisé)")
    raw = open(os.path.join(SRC, "assets", "js", "sessions-data.js"), encoding="utf-8").read()
    m = re.search(r"sessions: (\[.*?\])\s*};", raw, re.S)
    return (json.loads(m.group(1)) if m else []), "data"


SESSIONS, SESSIONS_SOURCE = load_sessions()
SESSIONS = [s for s in SESSIONS if (s.get("endDate") or s["date"]) >= BUILD_DATE.isoformat() and s.get("status") != "cancelled"]


# ───────────────────────────── utilitaires de langue
def t(lang, key, **kw):
    s = UI[lang].get(key)
    if s is None:
        raise KeyError(f"clé d'interface absente : {key} ({lang})")
    for k, v in kw.items():
        s = s.replace("{" + k + "}", str(v))
    return s


def P(lang, *keys):
    d = T[lang].PAGES
    for k in keys:
        d = d[k]
    return d


# Sans places en direct ni paiement en ligne (site statique), les textes qui les promettent sont remplacés
# par leur variante « _static » (même clé suffixée, dans fr.py, nl.py et en.py).
STATIC_TEXTS = not (PUBLIC["sessionsUrl"] and PUBLIC["onlinePayment"])


def PS(lang, *keys):
    """Comme P(), mais renvoie la variante « _static » quand elle existe et que le site est statique."""
    parent = P(lang, *keys[:-1]) if len(keys) > 1 else T[lang].PAGES
    key = keys[-1]
    return parent.get(key + "_static", parent[key]) if STATIC_TEXTS else parent[key]


def fmt_num(v, lang):
    if float(v).is_integer():
        s = f"{int(v):,}"
        return s.replace(",", NNBSP if lang != "en" else ",")
    s = f"{v:,.2f}"
    if lang == "en":
        return s
    return s.replace(",", "X").replace(".", ",").replace("X", NNBSP)


def money(v, lang):
    if v is None:
        return None
    n = fmt_num(v, lang)
    return f"{n}{NBSP}€" if lang == "fr" else (f"€{NBSP}{n}" if lang == "nl" else f"€{n}")


MONTHS = {
    "fr": ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"],
    "nl": ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"],
    "en": ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
}


def long_date(iso, lang):
    d = date.fromisoformat(iso)
    return f"{d.day} {MONTHS[lang][d.month - 1]} {d.year}"


def dsign(slug, cls="sign", label=None):
    d = DOM[slug]
    return sign(d["shape"], d["color"], d["icon"], cls, label)


def formation(slug, lang):
    """Formation fusionnée : structure commune + textes de la langue + prix du fichier client."""
    f = dict(FORM[slug])
    f.update(T[lang].FORMATIONS[slug])
    f["prix"] = PRICE[slug]
    f["url"] = R.formation(slug, lang)
    return f


def domain(slug, lang):
    d = dict(DOM[slug])
    d.update(T[lang].DOMAINES[slug])
    d["url"] = R.domain(slug, lang)
    d["formations"] = [formation(f["slug"], lang) for f in C.FORMATIONS if f["domain"] == slug]
    return d


def tel():
    return "tel:" + C.SITE["phone"].replace(" ", "")


# ───────────────────────────── logo et ressources
def strip_size(svg):
    return re.sub(r'\s(width|height)="[^"]+"', "", svg, count=2)


def read_svg(name):
    return strip_size(open(os.path.join(SRC, "assets", "img", name), encoding="utf-8").read())


LOGO_HEADER = read_svg("cfs-logo-signature-couleur.svg")
LOGO_FOOTER = read_svg("cfs-logo-signature-negatif.svg")
ASSET_V = {}


def asset(path):
    """Adresse versionnée d'un fichier de site/src/assets (empreinte du contenu)."""
    if path not in ASSET_V:
        full = os.path.join(SRC, path.lstrip("/"))
        if os.path.exists(full):
            ASSET_V[path] = hashlib.sha256(open(full, "rb").read()).hexdigest()[:10]
        else:
            ASSET_V[path] = BUILD_DATE.strftime("%Y%m%d")
    return f"{path}?v={ASSET_V[path]}"


# ───────────────────────────── en-tête, pied de page
NAV = [("agenda", "nav.agenda"), ("entreprises", "nav.entreprises"), ("salles", "nav.salles"), ("centre", "nav.centre"), ("contact", "nav.contact")]


def lang_switch(lang, alternates):
    items = []
    for lg in LANGS:
        href = alternates.get(lg) or R.page("home", lg)
        cur = ' aria-current="true"' if lg == lang else ""
        items.append(f'<li><a href="{E(href)}" hreflang="{R.HREFLANG[lg]}" lang="{R.HTML_LANG[lg]}" data-lang-link="{lg}"{cur}>'
                     f'<span class="lang-code">{E(UI[lg]["lang.short"])}</span>{E(UI[lg]["lang.name"])}</a></li>')
    return (f'<details class="lang-switch"><summary aria-label="{E(t(lang, "lang.switch"))} : {E(t(lang, "lang.name"))}">'
            f'{icon("globe")}<span>{E(t(lang, "lang.short"))}</span>{icon("chevron")}</summary>'
            f'<ul class="lang-menu">{"".join(items)}</ul></details>')


def nav_html(lang, active):
    cols = []
    for d in C.DOMAINES:
        dd = domain(d["slug"], lang)
        lis = "".join(f'<li><a href="{f["url"]}">{E(f["title"])}</a></li>' for f in dd["formations"])
        cols.append(f'<div class="mega-col"><h3>{dsign(d["slug"])}<a href="{dd["url"]}">{E(dd["name"])}</a></h3><ul>{lis}</ul></div>')
    links = []
    for key, label in NAV:
        cur = ' aria-current="page"' if active == key else ""
        links.append(f'<li><a href="{R.page(key, lang)}"{cur}>{E(t(lang, label))}</a></li>')
    cur_f = ' aria-current="page"' if active == "formations" else ""
    account_btn = (f'<a class="btn btn--contour" href="{R.page("compte", lang)}">{icon("user")} {E(t(lang, "nav.account"))}</a>'
                   if PUBLIC["accounts"] else "")
    return f'''<nav class="nav" id="nav" aria-label="{E(t(lang, "nav.main"))}">
<ul class="nav-list">
<li class="has-mega"><button class="nav-btn" type="button" aria-expanded="false" aria-controls="mega">{E(t(lang, "nav.formations"))}{icon("chevron")}</button>
<div class="mega" id="mega"><div class="wrap"><div class="mega-grid">{"".join(cols)}</div>
<div class="mega-foot"><a class="btn btn--bleu btn--petit" href="{R.page("formations", lang)}"{cur_f}>{E(t(lang, "nav.catalog_all"))}</a><p>{E(t(lang, "nav.mega_note"))}</p></div></div></div></li>
{"".join(links)}
</ul>
<div class="nav-mobile-cta"><a class="btn btn--bleu" href="{R.page("contact", lang)}?type=devis">{E(t(lang, "nav.quote"))}</a>{account_btn}<a class="btn btn--contour" href="{tel()}">{icon("phone")} {C.SITE["phone_display"]}</a></div>
</nav>'''


def header_html(lang, active, alternates):
    account_link = (f'<a class="icon-link" href="{R.page("compte", lang)}" aria-label="{E(t(lang, "nav.account"))}" data-account-link>{icon("user")}</a>\n'
                    if PUBLIC["accounts"] else "")
    return f'''<header class="header">
<div class="wrap">
<a class="logo" href="{R.page("home", lang)}" aria-label="{E(t(lang, "nav.home"))}">{LOGO_HEADER}</a>
{nav_html(lang, active)}
<div class="header-actions">
<a class="icon-link search-btn" href="{R.page("recherche", lang)}" data-search-open aria-haspopup="dialog" aria-label="{E(t(lang, "search.open"))}" title="{E(t(lang, "search.open"))} (/)">{icon("search")}</a>
{lang_switch(lang, alternates)}
{account_link}<a class="tel-link" href="{tel()}" aria-label="{E(t(lang, "nav.call", phone=C.SITE["phone_display"]))}">{icon("phone")}<span>{C.SITE["phone_display"]}</span></a>
<a class="btn btn--contour btn--petit header-quote" href="{R.page("contact", lang)}?type=devis">{E(t(lang, "nav.quote"))}</a>
<button class="burger" type="button" aria-expanded="false" aria-controls="nav" aria-label="{E(t(lang, "nav.open_menu"))}" data-label-open="{E(t(lang, "nav.open_menu"))}" data-label-close="{E(t(lang, "nav.close_menu"))}"><span class="i-open">{icon("menu")}</span><span class="i-close" hidden>{icon("close")}</span></button>
</div>
</div>
</header>'''


def footer_html(lang):
    tx = T[lang]
    doms = "".join(f'<li><a href="{R.domain(d["slug"], lang)}">{E(tx.DOMAINES[d["slug"]]["name"])}</a></li>' for d in C.DOMAINES)
    eng, cha = C.LIEUX["engis"], C.LIEUX["charleroi"]
    links = [("formations", "footer.catalog"), ("agenda", "footer.agenda"), ("entreprises", "footer.companies"), ("salles", "footer.rooms"),
             ("centre", "footer.about_link"), ("langues", "footer.languages"), ("actualites", "footer.news"), ("faq", "footer.faq"), ("contact", "nav.contact")]
    lis = "".join(f'<li><a href="{R.page(k, lang)}">{E(t(lang, lab))}</a></li>' for k, lab in links)
    legal = [("mentions", "footer.legal"), ("confidentialite", "footer.privacy"), ("cgv", "footer.terms"), ("accessibilite", "footer.accessibility"),
             ("cookies", "footer.cookies"), ("plan", "footer.sitemap")]
    leg = "".join(f'<li><a href="{R.page(k, lang)}">{E(t(lang, lab))}</a></li>' for k, lab in legal)
    return f'''<footer class="footer on-dark">
<div class="tape tape--thin" aria-hidden="true"></div>
<div class="wrap">
<div class="footer-grid">
<div class="footer-brand"><a class="logo" href="{R.page("home", lang)}" aria-label="{E(t(lang, "nav.home"))}">{LOGO_FOOTER}</a>
<p>{E(t(lang, "footer.about"))}</p>
<p class="footer-slogan">{E(t(lang, "footer.slogan"))}</p>
<div class="social"><a href="{C.SITE["linkedin"]}" rel="noopener" target="_blank" aria-label="{E(t(lang, "footer.linkedin"))}">{icon("linkedin")}</a></div></div>
<div><h2>{E(t(lang, "footer.reach"))}</h2>
<address>{E(eng["street"])}<br>{eng["zip"]} {eng["city"]}</address>
<ul><li><a href="{tel()}">{C.SITE["phone_display"]}</a></li><li><a href="mailto:{C.SITE["email"]}">{C.SITE["email"]}</a></li>
<li>{E(t(lang, "footer.branch"))} : CEME, {E(cha["street"])}, {cha["zip"]} {cha["city"]}</li></ul></div>
<div><h2>{E(t(lang, "footer.domains"))}</h2><ul>{doms}</ul></div>
<div><h2>{E(t(lang, "footer.centre"))}</h2><ul>{lis}</ul></div>
</div>
<div class="footer-bottom"><p>© {BUILD_DATE.year} Centre CFS. {E(t(lang, "footer.rights"))}</p><ul>{leg}</ul></div>
</div>
<p class="footer-word" aria-hidden="true">Centre CFS</p>
</footer>'''


def closure_html(lang):
    if BUILD_DATE.isoformat() >= C.SITE["closure_until"]:
        return ""
    s = T[lang].SITE
    return (f'<div class="annonce" data-until="{C.SITE["closure_until"]}" role="region" aria-label="{E(s["closure_label"])}">'
            f'<div class="wrap"><p><strong>{E(s["closure_label"])}</strong> {E(s["closure_text"])}</p>'
            f'<button type="button" aria-label="{E(t(lang, "common.close"))}">{icon("close")}</button></div></div>')


def intro_html(lang):
    """Animation d'accueil (page d'accueil, une fois par session, jamais si « réduire les animations »)."""
    signs = "".join(f'<span class="intro-sign">{dsign(d["slug"])}</span>' for d in C.DOMAINES)
    sym = L.symbol(0, 0, 1)
    return f'''<div class="intro" aria-hidden="true" data-intro>
<div class="intro-stage">
<svg class="intro-symbol" viewBox="0 0 64 64">{sym}</svg>
<p class="intro-word">Centre <span>CFS</span></p>
<p class="intro-tag">{E(T[lang].SITE["tagline"])}</p>
<div class="intro-signs">{signs}</div>
</div>
<div class="intro-tape"></div>
<button class="intro-skip" type="button" tabindex="-1" data-intro-skip>{E(t(lang, "intro.skip"))}</button>
</div>'''


# ───────────────────────────── données structurées
def org_jsonld(lang):
    eng = C.LIEUX["engis"]
    return {
        "@context": "https://schema.org", "@type": ["EducationalOrganization", "LocalBusiness"], "@id": CANON + "/#organisation",
        "name": C.SITE["name"], "alternateName": T[lang].SITE["legal_name"], "url": CANON + R.page("home", lang),
        "logo": CANON + "/assets/img/logo-cfs.png", "image": CANON + "/assets/img/og-default.png",
        "email": C.SITE["email"], "telephone": C.SITE["phone"], "slogan": t(lang, "footer.slogan"),
        "address": {"@type": "PostalAddress", "streetAddress": eng["street"], "postalCode": eng["zip"], "addressLocality": eng["city"], "addressRegion": "Liège", "addressCountry": "BE"},
        "location": [{"@type": "Place", "name": T[lang].LIEUX[k]["full"], "address": {"@type": "PostalAddress", "streetAddress": C.LIEUX[k]["street"], "postalCode": C.LIEUX[k]["zip"], "addressLocality": C.LIEUX[k]["city"], "addressCountry": "BE"}} for k in ("engis", "charleroi")],
        "areaServed": [{"@type": "AdministrativeArea", "name": "Wallonie"}, {"@type": "Country", "name": "Belgique"}],
        "knowsLanguage": C.LANG_CODES, "sameAs": [C.SITE["linkedin"]], **({"foundingDate": str(C.SITE["since"])} if C.SITE["since"] else {}),
        "memberOf": {"@type": "Organization", "name": "AKT – Chambres de commerce et d'industrie de Liège-Verviers-Namur"},
    }


def crumbs_jsonld(items):
    return {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": i + 1, "name": n, "item": CANON + u} for i, (n, u) in enumerate(items)]}


def faq_jsonld(items):
    return {"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [
        {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in items]}


def course_jsonld(f, lang):
    d = {"@context": "https://schema.org", "@type": "Course", "name": f["full"], "description": f["intro"], "url": CANON + f["url"],
         "provider": {"@type": "EducationalOrganization", "@id": CANON + "/#organisation", "name": C.SITE["name"], "sameAs": CANON + "/"},
         "inLanguage": "fr", "availableLanguage": C.LANG_CODES}
    if f.get("certificat"):
        d["educationalCredentialAwarded"] = f["certificat"]
    if f["prix"]:
        d["offers"] = [{"@type": "Offer", "category": "Paid", "price": f["prix"], "priceCurrency": "EUR", "url": CANON + R.page("inscription", lang) + "?formation=" + f["slug"],
                        "priceSpecification": {"@type": "UnitPriceSpecification", "price": f["prix"], "priceCurrency": "EUR", "valueAddedTaxIncluded": False}}]
    inst = []
    for s in SESSIONS:
        if s["training"] != f["slug"] or s.get("location") not in ("engis", "charleroi"):
            continue
        loc = C.LIEUX[s["location"]]
        i = {"@type": "CourseInstance", "courseMode": "Onsite", "startDate": s["date"] + ("T" + s["startTime"] if s.get("startTime") else ""),
             "endDate": (s.get("endDate") or s["date"]) + ("T" + s["endTime"] if s.get("endTime") else ""), "inLanguage": s.get("language") or "fr",
             "location": {"@type": "Place", "name": T[lang].LIEUX[s["location"]]["full"], "address": {"@type": "PostalAddress", "streetAddress": loc["street"], "postalCode": loc["zip"], "addressLocality": loc["city"], "addressCountry": "BE"}}}
        if f.get("workload"):
            i["courseWorkload"] = f["workload"]
        inst.append(i)
    if inst:
        d["hasCourseInstance"] = inst
    return d


# ───────────────────────────── gabarit de page
PAGES = []  # (lang, path, alternates, prio) pour le sitemap
GENERATED = set()
TITLE_MAX, DESC_MAX = 60, 155  # longueurs conseillées (mission, section 10.2) : contrôlées par site/tools/check_seo.py


def seo_title(title):
    """Titre de l'onglet : marque ajoutée si la place le permet ; précision de lieu entre parenthèses retirée si trop long."""
    if "Centre CFS" not in title and len(title) + 13 <= TITLE_MAX:
        return f"{title} | Centre CFS"
    if len(title) > TITLE_MAX:
        short = re.sub(r"\s*\([^)]*\)\s*$", "", title)
        if len(short) <= TITLE_MAX:
            return short
        short = re.sub(r"\s*[:–]\s*[^:–]*$", "", title)  # « Nom : formation à Engis (Liège) » → « Nom »
        if 20 <= len(short) <= TITLE_MAX:
            return short + (" | Centre CFS" if len(short) + 13 <= TITLE_MAX else "")
        short = re.sub(r"\s*\|\s*Centre CFS$", "", title)
        if len(short) <= TITLE_MAX and short != title:
            return short
    return title


def seo_desc(desc):
    """Meta description de 155 caractères au plus : coupée à la fin d'une phrase, sinon à un espace (« … »).
    Le texte visible de la page n'est jamais modifié."""
    desc = re.sub(r"\s+", " ", desc or "").strip()
    if len(desc) <= DESC_MAX:
        return desc
    cut = desc[:DESC_MAX]
    end = max(cut.rfind(". "), cut.rfind("! "), cut.rfind("? "))
    if end >= 80:
        return cut[:end + 1]
    return cut[:cut.rfind(" ")].rstrip(" ,;:–-") + "…"


def page(lang, path, title, desc, body, *, alternates=None, active=None, jsonld=None, body_class="", og_image="/assets/img/og-default.png",
         robots="index, follow", progress=False, sitemap=True, prio="0.6", scripts=(), styles=(), crumbs=None, home=False):
    alternates = alternates or {lang: path}
    url = CANON + path
    lds = [org_jsonld(lang)] if home else []
    if crumbs:
        lds.append(crumbs_jsonld(crumbs))
    lds += jsonld or []
    ld_html = "".join('<script type="application/ld+json">' + safe_json(x) + "</script>" for x in lds)
    full_title = seo_title(title)
    desc = seo_desc(desc)
    hreflang = "".join(f'<link rel="alternate" hreflang="{R.HREFLANG[lg]}" href="{CANON + p}">' for lg, p in alternates.items())
    if "fr" in alternates:
        hreflang += f'<link rel="alternate" hreflang="x-default" href="{CANON + alternates["fr"]}">'
    og_local = os.path.join(SRC, og_image.lstrip("/"))
    if not os.path.exists(og_local):
        og_image = re.sub(r"\.(nl|en)\.png$", ".png", og_image)
    css = "".join(f'<link rel="stylesheet" href="{asset("/assets/css/" + s)}">' for s in ("main.css",) + tuple(styles))
    js_before = f'<script src="{asset("/assets/js/intro-gate.js")}"></script>' if home else ""
    js = [f"/assets/js/site-data.{lang}.js", "/assets/js/i18n.js", "/assets/js/main.js"] + list(scripts)
    if PUBLIC["chatbot"]:
        js.append("/assets/js/assistant/launcher.js")
    for js_path in js:  # aucune page ne doit appeler un script absent (lien cassé + erreur dans la console)
        if not js_path.startswith("/assets/js/site-data") and not os.path.exists(os.path.join(SRC, js_path.lstrip("/"))):
            raise SystemExit(f"Script introuvable : site/src{js_path} (page {path}). Ajoutez le fichier ou désactivez l'option qui l'utilise.")
    if PREVIEW:
        robots = "noindex, nofollow"
    js_html = "".join(f'<script src="{asset(s) if not s.startswith("/assets/js/site-data") else s + "?v=" + DATA_V[lang]}" defer></script>' for s in js)
    progress_html = '<div class="progress" aria-hidden="true"></div>' if progress else ""
    # Lanceur de l'assistant : panneau d'information rond (« i » façon ISO 7010), pastille IA, point de disponibilité
    chat = (f'<button class="chat-launcher" type="button" data-chat-open hidden aria-haspopup="dialog" aria-label="{E(t(lang, "chat.open_long"))}">'
            f'<span class="chat-avatar" aria-hidden="true"><span class="chat-avatar-i">i</span><span class="chat-launcher-dot"></span></span>'
            f'<span class="chat-launcher-text">{E(t(lang, "chat.open"))}</span>'
            f'<span class="chat-badge" data-chat-badge hidden aria-hidden="true">{E(t(lang, "chat.badge"))}</span></button>') if PUBLIC["chatbot"] else ""
    doc = f'''<!doctype html>
<html lang="{R.HTML_LANG[lang]}" data-lang="{lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{E(full_title)}</title>
<meta name="description" content="{E(desc)}">
<meta name="robots" content="{robots}">
<meta http-equiv="Content-Security-Policy" content="{csp(meta=True)}">
<meta name="referrer" content="strict-origin-when-cross-origin">
<link rel="canonical" href="{url}">
{hreflang}
<meta name="theme-color" content="#0D4A8C">
<meta property="og:type" content="website">
<meta property="og:locale" content="{R.OG_LOCALE[lang]}">
<meta property="og:site_name" content="Centre CFS">
<meta property="og:title" content="{E(title)}">
<meta property="og:description" content="{E(desc)}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{CANON}{og_image}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<link rel="preload" href="/assets/fonts/barlow-condensed-800.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/assets/fonts/barlow-400.woff2" as="font" type="font/woff2" crossorigin>
{css}
{js_before}
{js_html}
{ld_html}
</head>
<body class="{body_class}">
{intro_html(lang) if home else ""}
<a class="skip-link" href="#contenu">{E(t(lang, "nav.skip"))}</a>
{progress_html}
{closure_html(lang)}
<div class="lang-banner" data-lang-banner hidden></div>
{header_html(lang, active, alternates)}
<main id="contenu" tabindex="-1">
{body}
</main>
{footer_html(lang)}
{chat}
</body>
</html>'''
    doc = rebase(doc)
    out = os.path.join(OUT, path.strip("/"), "index.html") if not path.endswith(".html") else os.path.join(OUT, path.strip("/"))
    if path == "/":
        out = os.path.join(OUT, "index.html")
    if out in GENERATED:
        raise RuntimeError(f"page générée deux fois : {path}")
    GENERATED.add(out)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as fh:
        fh.write(doc)
    if sitemap:
        PAGES.append((lang, path, alternates, prio))


# L'API du Worker (/api/…) est toujours servie à la racine du domaine : jamais préfixée par le chemin de base
_ROOT_URL = re.compile(r'(\s(?:href|src|action|poster)=")/(?!/|api/)')


_SRCSET = re.compile(r'(\ssrcset=")([^"]*)"')


def rebase(doc):
    """Préfixe les adresses internes (« /formations/ ») par le chemin de base (« /Centre-CFS/formations/ »)."""
    if not BASE:
        return doc
    doc = _ROOT_URL.sub(lambda m: m.group(1) + BASE + "/", doc)
    return _SRCSET.sub(lambda m: m.group(1) + re.sub(r"(^|,\s*)/(?!/)", lambda n: n.group(1) + BASE + "/", m.group(2)) + '"', doc)


def safe_json(x):
    """JSON pour une balise <script> (aucune fermeture de balise possible)."""
    return json.dumps(x, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")


def all_alts(key):
    return {lg: R.page(key, lg) for lg in LANGS}


# ───────────────────────────── composants
def crumbs_html(lang, items):
    lis = []
    for i, (name, url) in enumerate(items):
        lis.append(f'<li><a href="{url}">{E(name)}</a></li>' if i < len(items) - 1 else f'<li aria-current="page">{E(name)}</li>')
    return f'<nav class="crumbs" aria-label="{E(t(lang, "nav.breadcrumb"))}"><ol>{"".join(lis)}</ol></nav>'


def home_crumb(lang):
    return (t(lang, "nav.home_crumb"), R.page("home", lang))


def page_head(lang, crumbs, title, lead=None, extra="", narrow=False, eyebrow=""):
    w = "wrap-narrow" if narrow else "wrap"
    lead_html = f'<p class="lead">{E(lead)}</p>' if lead else ""
    return (f'<div class="page-head"><div class="page-head-bg" aria-hidden="true"></div><div class="{w}">{crumbs_html(lang, crumbs)}{eyebrow}'
            f'<h1>{E(title)}</h1>{lead_html}{extra}</div></div>')


def price_text(f, lang):
    return f'{money(f["prix"], lang)} {t(lang, "common.htva")}' if f["prix"] else t(lang, "common.quote")


CARD_SIZES = "(min-width: 1240px) 380px, (min-width: 700px) 46vw, 100vw"


def f_card(f, lang, media=True):
    """Carte formation. media=False là où la page montre déjà la photo du domaine en grand (pas de doublon)."""
    d = T[lang].DOMAINES[f["domain"]]
    search = " ".join([f["title"], f["full"], d["name"], f["pitch"], f.get("kw", "")])
    thumb = picture(IMG.FORMATION_IMAGE.get(f["slug"]) or IMG.DOMAIN_IMAGE.get(f["domain"]), lang, sizes=CARD_SIZES, cls="card-media", alt="") if media else ""
    return f'''<li><article class="f-card spot" data-item data-training="{f["slug"]}" data-domain="{f["domain"]}" data-lieux="{" ".join(f["lieux"])}" data-search="{E(search)}">
{thumb}<div class="f-card-top">{dsign(f["domain"])}<span>{E(d["name"])}</span></div>
<h3><a href="{f["url"]}">{E(f["title"])}</a></h3>
<p>{E(f["pitch"])}</p>
<dl><div><dt>{E(t(lang, "common.duration"))}</dt><dd>{E(f["duree"] or t(lang, "common.consult"))}</dd></div><div><dt>{E(t(lang, "common.price"))}</dt><dd>{E(price_text(f, lang))}</dd></div><div><dt>{E(t(lang, "common.next_date"))}</dt><dd data-next-for="{f["slug"]}">{E(t(lang, "common.on_request"))}</dd></div></dl>
</article></li>'''


def faq_html(items):
    out = []
    for q, a in items:
        out.append(f'<details><summary>{E(q)}<span class="plus" aria-hidden="true">{icon("plus")}</span></summary><div class="faq-a"><p>{E(a)}</p></div></details>')
    return f'<div class="faq">{"".join(out)}</div>'


def cta_band(lang, title=None, text=None):
    cb = P(lang, "cta_band")
    return f'''<section class="cta-band" aria-label="{E(title or cb["title"])}"><div class="wrap"><div><h2>{E(title or cb["title"])}</h2><p>{E(text or cb["text"])}</p></div>
<div class="btn-row"><a class="btn btn--encre" href="{R.page("contact", lang)}?type=devis">{E(t(lang, "cta.quote"))}</a><a class="btn btn--contour-encre" href="{tel()}">{icon("phone")} {C.SITE["phone_display"]}</a></div></div></section>'''


_IMG_META_PATH = os.path.join(HERE, "content", "images.generated.json")
IMG_META = json.load(open(_IMG_META_PATH, encoding="utf-8")) if os.path.exists(_IMG_META_PATH) else {}


def picture(key, lang, sizes="(min-width: 1100px) 760px, 100vw", cls="media", eager=False, alt=None):
    """Photo du registre (site/content/images.py) : <picture> AVIF + WebP en 3:2, ou rien si elle n'existe pas.
    alt="" : vignette décorative d'une carte dont le titre dit déjà tout (évite de répéter le texte aux lecteurs d'écran)."""
    if not key or key not in IMG_META or key not in IMG.IMAGES:
        return ""
    dims = IMG_META[key]["sizes"]

    def srcset(ext):
        return ", ".join(f"/assets/img/photos/{key}-{w}.{ext} {dims[str(w)][0]}w" for w in (480, 960, 1600))
    w, h = dims["960"]
    load = 'fetchpriority="high"' if eager else 'loading="lazy"'
    return (f'<figure class="{cls}"><picture><source type="image/avif" srcset="{srcset("avif")}" sizes="{sizes}">'
            f'<source type="image/webp" srcset="{srcset("webp")}" sizes="{sizes}">'
            f'<img src="/assets/img/photos/{key}-960.webp" alt="{E(IMG.IMAGES[key]["alt"][lang] if alt is None else alt)}" width="{w}" height="{h}" {load} decoding="async">'
            f'</picture></figure>')


def share_image(key):
    """Image de partage 1200 × 630 d'une photo du registre (sinon l'image par défaut)."""
    return f"/assets/img/partage/{key}.jpg" if key and os.path.exists(os.path.join(SRC, "assets", "img", "partage", f"{key}.jpg")) else "/assets/img/og-default.png"


def updated_html(lang, iso=None):
    return f'<p class="updated">{E(t(lang, "common.updated", date=long_date(iso or C.CONTENT_UPDATED, lang)))}</p>'


def photo(img, label, alt):
    ph = f'<span class="photo-ph" aria-hidden="true">{icon("photo")}{E(label)}</span>'
    if os.path.exists(os.path.join(SRC, "assets", "img", "photos", img)):
        return f'<figure class="photo"><img src="/assets/img/photos/{img}" alt="{E(alt)}" loading="lazy" decoding="async" width="1600" height="1200">{ph}</figure>'
    return f'<figure class="photo" role="img" aria-label="{E(alt)}">{ph}</figure>'


def lieux_html(lang, clair=False):
    out = []
    for k in ("engis", "charleroi", "intra"):
        lx, tx = C.LIEUX[k], T[lang].LIEUX[k]
        addr = f'<address>{E(lx["street"])}<br>{lx["zip"]} {E(lx["city"])}</address>' if lx["street"] else ""
        link = (f'<a class="lien-fleche" href="{lx["maps"]}" rel="noopener" target="_blank">{E(t(lang, "common.directions"))}</a>' if lx["maps"]
                else f'<a class="lien-fleche" href="{R.page("entreprises", lang)}">{E(t(lang, "common.onsite"))}</a>')
        pin = icon("building") if k == "intra" else icon("pin")
        out.append(f'<div class="lieu"><span class="lieu-ico">{pin}</span><h3>{E(tx["full"])}</h3>{addr}<p>{E(tx["desc"])}</p>{link}</div>')
    return f'<div class="lieux{" lieux--clair" if clair else ""}">{"".join(out)}</div>'


def sessions_block(lang, attrs, empty_text, limit=None):
    """Liste de tickets « permis de travail » remplie par agenda.js (aucune date dans le HTML)."""
    lim = f' data-limit="{limit}"' if limit else ""
    skel = "".join('<li class="permit permit--skeleton" aria-hidden="true"><span></span><span></span></li>' for _ in range(3 if limit else 4))
    return f'''<p class="live-badge" data-live hidden><span class="live-dot" aria-hidden="true"></span>{E(t(lang, "sess.live"))}</p>
<ul class="permits" data-session-list{lim} {attrs} aria-live="polite" aria-busy="true">{skel}</ul>
<div class="empty" data-session-empty hidden>{icon("calendar")}<p><strong>{E(t(lang, "sess.none"))}</strong> {E(empty_text)}</p>
<div class="btn-row" data-center><a class="btn btn--bleu" href="{R.page("contact", lang)}?type=prevenir">{E(t(lang, "cta.notify"))}</a><a class="btn btn--contour" href="{R.page("contact", lang)}">{E(t(lang, "cta.contact"))}</a></div></div>
<noscript><p class="notice">{E(t(lang, "sess.noscript"))}</p></noscript>'''


SESSION_SCRIPTS = ["/assets/js/sessions-data.js", "/assets/js/sessions.js", "/assets/js/sessions-ui.js", "/assets/js/agenda.js"]


# ───────────────────────────── pages
def build_home(lang):
    p = P(lang, "home")
    tx = T[lang]
    board = "".join(f'<li><a href="{R.domain(d["slug"], lang)}" data-domain="{d["slug"]}">{dsign(d["slug"])}<span>{E(tx.DOMAINES[d["slug"]]["name"])}</span></a></li>' for d in C.DOMAINES)
    partners = "".join(f"<li>{E(x)}</li>" for x in tx.PARTENAIRES)
    domains = []
    for i, d in enumerate(C.DOMAINES):
        dd = domain(d["slug"], lang)
        n = len(dd["formations"])
        count = t(lang, "common.formation_count_one" if n == 1 else "common.formation_count", n=n)
        items = "".join(f'<li><a href="{f["url"]}">{E(f["title"])}</a></li>' for f in dd["formations"])
        dimg = picture(IMG.DOMAIN_IMAGE.get(d["slug"]), lang, sizes="(min-width: 1240px) 290px, (min-width: 700px) 46vw, 100vw", cls="card-media", alt="")
        domains.append(f'''<article class="domain spot domain--{d["color"]}">{dimg}<div class="domain-top">{dsign(d["slug"])}<div><h3><a href="{dd["url"]}">{E(dd["name"])}</a></h3><p class="count">{E(count)}</p></div></div><ul>{items}</ul></article>''')
    why = "".join(f'<div class="bento-card spot{" bento-card--wide" if i in (0, 3) else ""}"><span class="atout-ico">{icon(ic)}</span><h3>{E(ti)}</h3><p>{E(te)}</p>'
                  + (f'<ul class="langues">{"".join(f"<li>{E(x)}</li>" for x in tx.LANGUES)}</ul>' if ic == "globe" else "") + "</div>"
                  for i, (ic, ti, te) in enumerate(p["why"]))
    steps = "".join(f'<li><h3>{E(a)}</h3><p>{E(b)}</p></li>' for a, b in PS(lang, "home", "steps"))
    greets = "".join(f'<li lang="{code}"><span>{E(g)}</span></li>' for code, g in C.GREETINGS)
    feats = "".join(f"<li>{icon(i)}{E(x)}</li>" for i, x in zip(("screen", "wifi", "users"), p["rooms_features"]))
    faq5 = tx.FAQ_GENERALE[:5]
    facts = "".join(f"<li>{icon(i)}{E(x)}</li>" for i, x in zip(("shield", "globe", "pin"), p["facts"]))
    body = f'''
<section class="hero on-dark" aria-labelledby="h1" data-spotlight>
<div class="hero-bg" aria-hidden="true"><span class="hero-grid"></span><span class="hero-glow"></span></div>
<div class="wrap hero-inner">
<div class="hero-copy">
<p class="kicker"><span class="kicker-dot" aria-hidden="true"></span>{E(p["kicker"])}</p>
<h1 id="h1">{E(p["title_a"])} {E(p["title_b"])}</h1>
<p class="lead">{E(p["lead"])}</p>
<div class="btn-row"><a class="btn btn--signal" href="{R.page("formations", lang)}">{E(p["cta_catalog"])}</a><a class="btn btn--clair" href="{R.page("agenda", lang)}">{icon("calendar")} {E(t(lang, "cta.agenda"))}</a></div>
<ul class="hero-facts">{facts}</ul>
</div>
<div class="hero-side">
<div class="board" data-board>
<p class="board-title">{E(p["board_title"])}</p>
<ul class="board-grid">{board}</ul>
<div class="board-next" data-hero-next data-label="{E(p["board_next"])}"><p class="board-next-empty">{E(p["board_next_none"])} <a href="{R.page("agenda", lang)}">{E(t(lang, "cta.agenda"))}</a></p></div>
</div>
</div>
</div>
<div class="tape tape--move" aria-hidden="true"></div>
</section>


<section class="partners" aria-labelledby="t-part"><div class="wrap"><h2 id="t-part" class="partners-title">{E(p["partners"])}</h2></div>
<div class="wrap"><ul class="partner-chips">{partners}</ul></div></section>

<section class="section" aria-labelledby="t-dom">
<div class="wrap">
<div class="section-head"><h2 id="t-dom">{E(p["domains_title"])}</h2><p>{E(p["domains_lead"])}</p></div>
<div class="domains">{"".join(domains)}</div>
<p class="mt-6"><a class="btn btn--bleu" href="{R.page("formations", lang)}">{E(t(lang, "cta.catalog"))}</a></p>
</div>
</section>

<section class="section section--papier" aria-labelledby="t-ag">
<div class="wrap">
<div class="section-head section-head--split"><div><h2 id="t-ag">{E(p["sessions_title"])}</h2><p>{E(PS(lang, "home", "sessions_lead"))}</p></div><a class="lien-fleche" href="{R.page("agenda", lang)}">{E(p["agenda_more"])}</a></div>
{sessions_block(lang, "", T[lang].PAGES["formation"]["sessions_empty"], limit=6)}
</div>
</section>

<section class="promise on-dark" aria-label="{E(p["promise"])}"><div class="wrap">
<figure ><span class="promise-mark" aria-hidden="true">“</span><blockquote><p>{E(p["promise"])}</p></blockquote><figcaption>{E(p["promise_text"])}</figcaption></figure>
</div></section>

<section class="section" aria-labelledby="t-pq"><div class="wrap">
<div class="section-head"><h2 id="t-pq">{E(p["why_title"])}</h2></div>
<div class="bento">{why}</div>
</div></section>

<section class="section section--papier" aria-labelledby="t-steps"><div class="wrap">
<div class="section-head"><h2 id="t-steps">{E(p["steps_title"])}</h2></div>
<ol class="steps steps--draw">{steps}</ol>
<p class="mt-6"><a class="btn btn--bleu" href="{R.page("agenda", lang)}">{E(t(lang, "cta.agenda"))}</a></p>
</div></section>

<section class="langs-band" aria-labelledby="t-langs"><div class="wrap"><div class="section-head"><h2 id="t-langs">{E(p["langs_title"])}</h2><p>{E(p["langs_lead"])}</p></div></div>
<div class="wrap"><ul class="greetings">{greets}</ul></div></section>

<section class="section section--encre on-dark" aria-labelledby="t-lieux"><div class="wrap">
<div class="section-head"><h2 id="t-lieux">{E(p["how_title"])}</h2><p>{E(p["how_lead"])}</p></div>
{lieux_html(lang)}
</div></section>

<section class="section" aria-labelledby="t-salles"><div class="wrap split">
{photo("salle-03.jpg", P(lang, "salles", "photo").format(name=tx.SALLES[2]["name"]), P(lang, "salles", "photo_alt").format(name=tx.SALLES[2]["name"], cap=25))}
<div><h2 id="t-salles">{E(p["rooms_title"])}</h2><p class="lead">{E(p["rooms_lead"])}</p>
<ul class="features">{feats}</ul>
<p class="mt-6"><a class="btn btn--bleu" href="{R.page("salles", lang)}">{E(p["rooms_cta"])}</a></p></div>
</div></section>

<section class="section section--papier" aria-labelledby="t-faq"><div class="wrap-narrow">
<h2 id="t-faq">{E(p["faq_title"])}</h2>{faq_html(faq5)}
<p class="mt-6"><a class="lien-fleche" href="{R.page("faq", lang)}">{E(p["faq_more"])}</a></p>
</div></section>
{cta_band(lang)}'''
    page(lang, R.page("home", lang), p["meta_title"], p["meta_desc"], body, alternates=all_alts("home"), active="home",
         jsonld=[faq_jsonld(faq5)], prio="1.0", home=True, styles=("sessions.css",), scripts=SESSION_SCRIPTS, body_class="is-home")


def build_catalogue(lang):
    p = P(lang, "catalogue")
    tx = T[lang]
    chips = f'<li><button class="chip chip--simple" type="button" data-filter="domain" data-value="" aria-pressed="true">{E(p["all_domains"])}</button></li>' + "".join(
        f'<li><button class="chip" type="button" data-filter="domain" data-value="{d["slug"]}" aria-pressed="false">{dsign(d["slug"])}{E(tx.DOMAINES[d["slug"]]["name"])}</button></li>' for d in C.DOMAINES)
    lieux = f'<li><button class="chip chip--simple" type="button" data-filter="lieu" data-value="" aria-pressed="true">{E(p["all_places"])}</button></li>' + "".join(
        f'<li><button class="chip chip--simple" type="button" data-filter="lieu" data-value="{k}" aria-pressed="false">{E(tx.LIEUX[k]["name"])}</button></li>' for k in ("engis", "charleroi", "intra"))
    groups = []
    for d in C.DOMAINES:
        dd = domain(d["slug"], lang)
        cards = "".join(f_card(f, lang) for f in dd["formations"])
        groups.append(f'<section class="domain-block" data-group aria-labelledby="g-{d["slug"]}"><header>{dsign(d["slug"])}<h2 id="g-{d["slug"]}">{E(dd["long"])}</h2></header><ul class="f-list">{cards}</ul></section>')
    crumbs = [home_crumb(lang), (t(lang, "nav.formations"), R.page("formations", lang))]
    body = f'''{page_head(lang, crumbs, p["title"], p["lead"])}
<section class="section" data-filter-root>
<div class="wrap">
<div class="filters" role="search">
<div class="filters-row">
<div class="field search"><label for="q">{E(p["search"])}</label><div class="search-box">{icon("search")}<input id="q" type="search" placeholder="{E(p["search_ph"])}" data-filter-q autocomplete="off"></div></div>
<div class="field"><span class="label">{E(p["dates"])}</span><button class="chip chip--simple" type="button" data-filter="dates" aria-pressed="false">{icon("calendar")}{E(p["dates_chip"])}</button></div>
</div>
<div class="field"><span class="label">{E(p["domain"])}</span><ul class="chips">{chips}</ul></div>
<div class="field"><span class="label">{E(p["place"])}</span><ul class="chips">{lieux}</ul></div>
</div>
<p class="results-info" aria-live="polite" data-results></p>
{"".join(groups)}
<div class="no-results"><h2>{E(p["none_title"])}</h2><p class="muted">{E(p["none_text"])}</p><a class="btn btn--bleu" href="{R.page("contact", lang)}?type=devis">{E(t(lang, "cta.describe"))}</a></div>
</div>
</section>
{cta_band(lang)}'''
    ld = {"@context": "https://schema.org", "@type": "ItemList", "itemListElement": [
        {"@type": "ListItem", "position": i + 1, "url": CANON + R.formation(f["slug"], lang), "name": tx.FORMATIONS[f["slug"]]["full"]} for i, f in enumerate(C.FORMATIONS)]}
    page(lang, R.page("formations", lang), p["meta_title"], p["meta_desc"], body, alternates=all_alts("formations"), active="formations",
         jsonld=[ld], crumbs=crumbs, prio="0.9", scripts=["/assets/js/sessions-data.js", "/assets/js/sessions.js"])


def build_formation(slug, lang):
    f = formation(slug, lang)
    p = P(lang, "formation")
    d = domain(f["domain"], lang)
    tx = T[lang]
    crumbs = [home_crumb(lang), (t(lang, "nav.formations"), R.page("formations", lang)), (d["name"], d["url"]), (f["title"], f["url"])]
    lieux_txt = ", ".join(tx.LIEUX[k]["name"] for k in f["lieux"])
    facts = [("clock", t(lang, "common.duration"), f["duree"] or t(lang, "common.consult"))]
    if f["horaires"]:
        facts.append(("calendar", t(lang, "common.hours"), f["horaires"]))
    facts.append(("pin", t(lang, "common.places"), lieux_txt))
    if f["validite"]:
        facts.append(("award", t(lang, "common.validity"), f["validite"]))
    facts.append(("globe", t(lang, "common.languages"), t(lang, "common.languages_value")))
    dl = "".join(f'<div>{icon(i)}<dt>{E(k)}</dt><dd>{E(v)}</dd></div>' for i, k, v in facts)
    if f["prix"]:
        note = f'<small class="prix-note">{E(f["prix_note"])}</small>' if f.get("prix_note") else ""
        incl = round(round(f["prix"] * 100) * (1 + PUBLIC["vatRate"])) / 100  # même arrondi que la feuille et pricing.js
        tvac = f'<small class="prix-note">{E(t(lang, "common.price_incl", price=money(incl, lang)))}</small>'
        prix = (f'<div class="facts-price"><span class="facts-label">{E(t(lang, "common.price_per"))}</span><span class="prix">{E(money(f["prix"], lang))}</span> '
                f'<small>{E(t(lang, "common.htva"))}</small>{tvac}{note}<small class="prix-note">{E(t(lang, "common.intra_quote"))}</small></div>')
    else:
        prix = f'<div class="facts-price"><span class="facts-label">{E(t(lang, "common.price"))}</span><span class="prix prix--quote">{E(t(lang, "common.quote"))}</span><small class="prix-note">{E(t(lang, "common.price_quote_long"))}</small></div>'
    book = f'<a class="btn btn--signal btn--bloc" href="{R.page("inscription", lang)}?formation={slug}">{E(t(lang, "cta.book"))}</a>'
    intra = f'<a class="btn btn--contour btn--bloc" href="{R.page("contact", lang)}?type=devis&amp;formation={slug}">{E(t(lang, "cta.intra"))}</a>'
    obj = "".join(f"<li>{icon('check-circle')}<span>{E(o)}</span></li>" for o in f["objectifs"])
    seq = all(re.match(r"^(Jour|Dag|Day) \d", g[0]) for g in f["programme"])
    prog = []
    for i, (gt, items) in enumerate(f["programme"]):
        num = f'<span class="num" aria-hidden="true">{i + 1}</span>' if seq else ""
        lis = "".join(f"<li>{E(x)}</li>" for x in items)
        prog.append(f'<div class="prog-group"><h3>{num}{E(gt)}</h3><ul>{lis}</ul></div>')
    infos = [(p["for_whom"], f["public"])]
    for key, label in (("prerequis", p["prereq"]), ("examen", p["evaluation"]), ("certificat", p["certification"])):
        if f.get(key):
            infos.append((label, f[key]))
    infos_html = "".join(f'<div class="info"><h3>{E(a)}</h3><p>{E(b)}</p></div>' for a, b in infos)
    legal = f'<div class="legal mt-6">{icon("scale")}<p><strong>{E(p["legal"])}</strong> {E(f["legal"])}</p></div>' if f.get("legal") else ""
    related = [x for x in d["formations"] if x["slug"] != slug]
    if len(related) < 2:
        related += [formation(x["slug"], lang) for x in C.FORMATIONS if x["domain"] != f["domain"] and x["domain"] in ("vca", "secours", "incendie")][: 3 - len(related)]
    rel = "".join(f_card(x, lang, media=False) for x in related[:3])
    faq = f'<section aria-labelledby="t-faq"><h2 id="t-faq">{E(p["faq"])}</h2>{faq_html(f["faq"])}</section>' if f["faq"] else ""
    tags = [f["duree"]] if f["duree"] else []
    tags += [tx.LIEUX[k]["name"] for k in f["lieux"]]
    tags_html = "".join(f'<li>{E(x)}</li>' for x in tags)
    body = f'''<article class="f-page" data-formation="{slug}">
<header class="f-hero f-hero--{d["color"]}"><div class="page-head-bg" aria-hidden="true"></div><div class="wrap">{crumbs_html(lang, crumbs)}
<div class="f-hero-grid">
<div class="f-hero-copy">
<a class="f-domain" href="{d["url"]}">{dsign(f["domain"])}{E(d["long"])}</a>
<h1>{E(f["full"])}</h1>
<p class="lead">{E(f["intro"])}</p>
<ul class="f-tags">{tags_html}</ul>
{updated_html(lang)}
</div>
<aside class="facts" aria-labelledby="t-brief"><h2 class="facts-title" id="t-brief">{E(t(lang, "common.in_brief"))}</h2>{prix}<dl>{dl}</dl><div class="btn-row">{book}{intra}</div></aside>
</div></div></header>

<section class="section section--papier f-sessions" data-sessions-for="{slug}" aria-labelledby="t-sess" hidden><div class="wrap">
<div class="section-head section-head--split"><div><h2 id="t-sess">{E(t(lang, "sess.next"))}</h2></div><p class="live-badge" data-wss-live hidden><span class="live-dot" aria-hidden="true"></span>{E(t(lang, "sess.live"))}</p></div>
<ul class="wss-list" data-wss-list></ul></div></section>
<div class="wrap"><div class="f-nosession notice" data-sessions-empty-for="{slug}" hidden><p>{E(p["sessions_empty"])}</p><a class="btn btn--bleu btn--petit" href="{R.page("contact", lang)}?type=prevenir&amp;formation={slug}">{E(t(lang, "cta.notify"))}</a></div></div>

<div class="section"><div class="wrap f-body">
<div class="f-main">
{picture(IMG.FORMATION_IMAGE.get(slug, IMG.DOMAIN_IMAGE[f["domain"]]), lang, cls="media media--wide")}
<section aria-labelledby="t-obj"><h2 id="t-obj">{E(p["learn"])}</h2><ul class="checks">{obj}</ul></section>
<section aria-labelledby="t-prog"><h2 id="t-prog">{E(p["program"])}</h2><div class="prog{" prog--days" if seq else ""}">{"".join(prog)}</div></section>
<section aria-labelledby="t-info"><h2 id="t-info">{E(p["modalities"])}</h2><div class="info-grid">{infos_html}</div>{legal}</section>
{faq}
</div>
<aside class="f-aside" aria-label="{E(p["question"])}">
<div class="aside-box contact-box on-dark"><h2>{E(p["question"])}</h2><p>{E(p["question_text"])}</p>
<ul class="contact-lines"><li>{icon("phone")}<a href="{tel()}">{C.SITE["phone_display"]}</a></li><li>{icon("mail")}<a href="mailto:{C.SITE["email"]}?subject={E(f["title"])}">{C.SITE["email"]}</a></li></ul>
<a class="btn btn--clair btn--petit btn--bloc" href="{R.page("contact", lang)}?type=devis&amp;formation={slug}">{E(t(lang, "cta.quote"))}</a></div>
<button class="btn btn--contour btn--petit btn--bloc print-btn" type="button" data-print hidden>{icon("print")} {E(p["print"])}</button>
</aside>
</div></div>

<section class="section section--papier" aria-labelledby="t-rel"><div class="wrap"><h2 id="t-rel">{E(p["related"])}</h2><ul class="related">{rel}</ul></div></section>
{cta_band(lang, p["intra_title"], p["intra_text"])}
<div class="mobile-bar"><a class="btn btn--signal btn--petit" href="{R.page("inscription", lang)}?formation={slug}">{E(t(lang, "cta.book"))}</a><a class="btn btn--bleu btn--petit" href="{tel()}">{icon("phone")} {E(t(lang, "cta.call"))}</a></div>
</article>'''
    ld = [course_jsonld(f, lang)]
    if f["faq"]:
        ld.append(faq_jsonld(f["faq"]))
    places = "charleroi" in f["lieux"]
    title = (p["title_with_places"] if places else p["title_engis"]).format(title=f["title"])
    if len(title) > 58:
        title = (p["title_short_places"] if places else p["title_short_engis"]).format(title=f["title"])
    desc = " ".join(x for x in [f["pitch"], p["desc_duration"].format(v=f["duree"]) if f["duree"] else "",
                                 p["desc_price"].format(v=money(f["prix"], lang)) if f["prix"] else "", p["desc_suffix"]] if x)
    alts = {lg: R.formation(slug, lg) for lg in LANGS}
    page(lang, f["url"], title, desc[:300], body, alternates=alts, active="formations", jsonld=ld, crumbs=crumbs, body_class="has-mobile-bar",
         og_image=R.og_image(slug, lang), progress=True, prio="0.8", styles=("sessions.css",), scripts=SESSION_SCRIPTS)


def build_domain(slug, lang):
    d = domain(slug, lang)
    p = P(lang, "domain")
    crumbs = [home_crumb(lang), (t(lang, "nav.formations"), R.page("formations", lang)), (d["name"], d["url"])]
    cards = "".join(f_card(f, lang, media=False) for f in d["formations"])
    faqs = [qa for f in d["formations"] for qa in f["faq"]][:6]
    faq = f'<section class="section" aria-labelledby="t-f"><div class="wrap-narrow"><h2 id="t-f">{E(P(lang, "faq", "title"))}</h2>{faq_html(faqs)}</div></section>' if faqs else ""
    head = (f'<div class="page-head page-head--domain"><div class="page-head-bg" aria-hidden="true"></div><div class="wrap">{crumbs_html(lang, crumbs)}'
            f'<div class="domain-hero">{dsign(slug, "sign sign--xl", d["name"])}<div><h1>{E(p["title"].format(name=d["long"]))}</h1><p class="lead">{E(d["intro"])}</p></div></div></div></div>')
    body = f'''{head}
<section class="section" aria-labelledby="t-c"><div class="wrap"><h2 class="sr-only" id="t-c">{E(t(lang, "nav.formations"))} : {E(d["name"])}</h2>{picture(IMG.DOMAIN_IMAGE.get(slug), lang, sizes="(min-width: 1240px) 1180px, 100vw", cls="media media--band")}<ul class="f-list">{cards}</ul></div></section>
<section class="section section--papier" aria-labelledby="t-s"><div class="wrap">
<div class="section-head section-head--split"><h2 id="t-s">{E(t(lang, "sess.next"))}</h2><a class="lien-fleche" href="{R.page("agenda", lang)}">{E(t(lang, "cta.agenda"))}</a></div>
{sessions_block(lang, f'data-domain="{slug}"', T[lang].PAGES["formation"]["sessions_empty"], limit=6)}
</div></section>
{faq}
{cta_band(lang)}'''
    ld = [faq_jsonld(faqs)] if faqs else []
    alts = {lg: R.domain(slug, lg) for lg in LANGS}
    page(lang, d["url"], p["meta_title"].format(name=d["name"]), f'{d["intro"]} {p["meta_suffix"]}', body, alternates=alts, active="formations",
         jsonld=ld, crumbs=crumbs, prio="0.8", og_image=share_image(IMG.DOMAIN_IMAGE.get(slug)), styles=("sessions.css",), scripts=SESSION_SCRIPTS)


def build_agenda(lang):
    p = P(lang, "agenda")
    tx = T[lang]
    crumbs = [home_crumb(lang), (t(lang, "nav.agenda"), R.page("agenda", lang))]
    dom_chips = f'<li><button class="chip chip--simple" type="button" data-sf="domain" data-value="" aria-pressed="true">{E(t(lang, "sess.all_domains"))}</button></li>' + "".join(
        f'<li><button class="chip" type="button" data-sf="domain" data-value="{d["slug"]}" aria-pressed="false" hidden>{dsign(d["slug"])}{E(tx.DOMAINES[d["slug"]]["name"])}</button></li>' for d in C.DOMAINES)
    place_chips = f'<li><button class="chip chip--simple" type="button" data-sf="location" data-value="" aria-pressed="true">{E(t(lang, "sess.all_places"))}</button></li>' + "".join(
        f'<li><button class="chip chip--simple" type="button" data-sf="location" data-value="{k}" aria-pressed="false" hidden>{E(tx.LIEUX[k]["name"])}</button></li>' for k in ("engis", "charleroi", "intra"))
    opts = f'<option value="">{E(t(lang, "sess.all_trainings"))}</option>' + "".join(f'<option value="{f["slug"]}">{E(tx.FORMATIONS[f["slug"]]["title"])}</option>' for f in C.FORMATIONS)
    legend = "".join(f'<li><span class="wsc-chip wsc-chip--{lv} wsc-chip--legend" aria-hidden="true"></span>{E(t(lang, key))}</li>' for lv, key in (("open", "sess.legend_open"), ("low", "sess.legend_low"), ("full", "sess.legend_full")))
    body = f'''{page_head(lang, crumbs, p["title"], PS(lang, "agenda", "lead"))}
<section class="section" aria-labelledby="t-cal"><div class="wrap">
<h2 id="t-cal" class="sr-only">{E(p["calendar_title"])}</h2>
<div class="cal" data-sessions-calendar>
<div class="cal-main">
<div class="cal-bar"><button class="cal-nav" type="button" data-wsc-prev aria-label="{E(t(lang, "sess.prev"))}">{icon("chevron-left")}</button><p class="cal-month" data-wsc-month aria-live="polite">&nbsp;</p><button class="cal-nav" type="button" data-wsc-next aria-label="{E(t(lang, "sess.next_month"))}">{icon("chevron-right")}</button></div>
<div class="cal-grid" data-wsc-grid role="group" aria-label="{E(t(lang, "sess.calendar_label"))}"><p class="cal-loading">{E(t(lang, "sess.loading"))}</p></div>
<p class="cal-status" data-wsc-status hidden></p>
<div class="cal-foot"><ul class="cal-legend" aria-label="{E(t(lang, "sess.legend"))}">{legend}</ul><p class="live-badge" data-wsc-live hidden><span class="live-dot" aria-hidden="true"></span>{E(t(lang, "sess.live"))}</p></div>
</div>
<div class="cal-detail" data-wsc-detail aria-live="polite"></div>
</div>
<noscript><p class="notice">{E(t(lang, "sess.noscript"))}</p></noscript>
</div></section>
<section class="section section--papier" aria-labelledby="t-list"><div class="wrap" data-session-root>
<div class="section-head"><h2 id="t-list">{E(p["list_title"])}</h2></div>
<div class="filters filters--sessions">
<div class="field"><label for="sf-training">{E(t(lang, "sess.training"))}</label><select id="sf-training" data-sf-select="training">{opts}</select></div>
<div class="field"><span class="label">{E(t(lang, "sess.domain"))}</span><ul class="chips">{dom_chips}</ul></div>
<div class="field"><span class="label">{E(t(lang, "sess.place"))}</span><ul class="chips">{place_chips}</ul></div>
</div>
<p class="results-info" aria-live="polite" data-session-results></p>
{sessions_block(lang, 'data-filters="1"', p["cta_text"])}
</div></section>
{cta_band(lang, p["cta_title"], p["cta_text"])}'''
    page(lang, R.page("agenda", lang), p["meta_title"], PS(lang, "agenda", "meta_desc"), body, alternates=all_alts("agenda"), active="agenda", crumbs=crumbs, prio="0.9",
         styles=("sessions.css",), scripts=SESSION_SCRIPTS)


def build_entreprises(lang):
    p = P(lang, "entreprises")
    tx = T[lang]
    crumbs = [home_crumb(lang), (t(lang, "nav.entreprises"), R.page("entreprises", lang))]
    lists = "".join(f'<div class="mega-col"><h3>{dsign(d["slug"])}<a href="{R.domain(d["slug"], lang)}">{E(tx.DOMAINES[d["slug"]]["name"])}</a></h3><ul>'
                    + "".join(f'<li><a href="{R.formation(f["slug"], lang)}">{E(tx.FORMATIONS[f["slug"]]["title"])}</a></li>' for f in C.FORMATIONS if f["domain"] == d["slug"])
                    + "</ul></div>" for d in C.DOMAINES)
    adv = "".join(f'<div class="bento-card spot"><span class="atout-ico">{icon(i)}</span><h3>{E(a)}</h3><p>{E(b)}</p>'
                  + (f'<ul class="langues">{"".join(f"<li>{E(x)}</li>" for x in tx.LANGUES)}</ul>' if i == "globe" else "") + "</div>" for i, a, b in p["adv"])
    steps = "".join(f'<li><h3>{E(a)}</h3><p>{E(b)}</p></li>' for a, b in p["steps"])
    extra = f'<div class="btn-row mt-6"><a class="btn btn--signal" href="{R.page("contact", lang)}?type=devis">{E(t(lang, "cta.quote"))}</a><a class="btn btn--contour" href="{tel()}">{icon("phone")} {C.SITE["phone_display"]}</a></div>'
    body = f'''{page_head(lang, crumbs, p["title"], p["lead"], extra)}
<section class="section" aria-labelledby="t-av"><div class="wrap">{picture(IMG.PAGE_IMAGE["entreprises"], lang, sizes="(min-width: 1240px) 1180px, 100vw", cls="media media--band")}<div class="section-head"><h2 id="t-av">{E(p["adv_title"])}</h2></div><div class="bento bento--even">{adv}</div></div></section>
<section class="section section--papier" aria-labelledby="t-st"><div class="wrap"><div class="section-head"><h2 id="t-st">{E(p["steps_title"])}</h2></div><ol class="steps steps--draw">{steps}</ol></div></section>
<section class="section" aria-labelledby="t-all"><div class="wrap"><div class="section-head"><h2 id="t-all">{E(p["all_title"])}</h2></div><div class="mega-grid mega-grid--page">{lists}</div></div></section>
{cta_band(lang, p["cta_title"], p["cta_text"])}'''
    page(lang, R.page("entreprises", lang), p["meta_title"], p["meta_desc"], body, alternates=all_alts("entreprises"), active="entreprises", crumbs=crumbs, prio="0.8",
         og_image=share_image(IMG.PAGE_IMAGE["entreprises"]))


def build_salles(lang):
    p = P(lang, "salles")
    tx = T[lang]
    crumbs = [home_crumb(lang), (t(lang, "nav.salles"), R.page("salles", lang))]
    cards = []
    for base, txt in zip(C.SALLES, tx.SALLES):
        nm = txt["name"]
        cards.append(f'<article class="salle">{photo(base["img"], p["photo"].format(name=nm), p["photo_alt"].format(name=nm, cap=base["cap"]))}<h3>{E(p["room_title"].format(name=nm, cap=base["cap"]))}</h3><p>{E(txt["desc"])}</p></article>')
    feats = "".join(f"<li>{icon(i)}{E(x)}</li>" for i, x in zip(("screen", "wifi", "users", "clock"), p["features"]))
    prices = CLIENT.get("salles") or []
    table = ""
    if any(any(r["prices"].values()) for r in prices):
        rows = "".join(f'<tr><th scope="row">{E(tx.SALLES[i]["name"] if i < len(tx.SALLES) else r["name"])}</th>' + "".join(f'<td>{E(money(r["prices"][k], lang) or "—")}</td>' for k in ("demi_journee", "journee", "semaine")) + "</tr>" for i, r in enumerate(prices))
        table = f'<table class="price-table"><caption>{E(p["pricing_table"])}</caption><thead><tr><th></th><th scope="col">{E(p["half"])}</th><th scope="col">{E(p["day"])}</th><th scope="col">{E(p["week"])}</th></tr></thead><tbody>{rows}</tbody></table>'
    eng = C.LIEUX["engis"]
    body = f'''{page_head(lang, crumbs, p["title"], p["lead"])}
<section class="section" aria-labelledby="t-s"><div class="wrap"><h2 id="t-s" class="sr-only">{E(p["rooms_h"])}</h2><div class="salles">{"".join(cards)}</div></div></section>
<section class="section section--papier" aria-labelledby="t-eq"><div class="wrap split">
<div><h2 id="t-eq">{E(p["equip_title"])}</h2><ul class="features">{feats}</ul>{table}<p class="mt-6">{E(p["pricing"])}</p>
<a class="btn btn--signal" href="{R.page("contact", lang)}?type=salle">{E(p["cta"])}</a></div>
<div class="lieux lieux--clair lieux--one"><div class="lieu"><span class="lieu-ico">{icon("pin")}</span><h3>{E(tx.LIEUX["engis"]["full"])}</h3><address>{E(eng["street"])}<br>{eng["zip"]} Engis</address><a class="lien-fleche" href="{eng["maps"]}" rel="noopener" target="_blank">{E(t(lang, "common.directions"))}</a></div></div>
</div></section>
{cta_band(lang, p["cta_title"], p["cta_text"])}'''
    page(lang, R.page("salles", lang), p["meta_title"], p["meta_desc"], body, alternates=all_alts("salles"), active="salles", crumbs=crumbs, prio="0.7")


def build_centre(lang):
    p = P(lang, "centre")
    tx = T[lang]
    crumbs = [home_crumb(lang), (t(lang, "nav.centre"), R.page("centre", lang))]
    partners = "".join(f"<li>{E(x)}</li>" for x in tx.PARTENAIRES)
    langs = "".join(f"<li>{E(x)}</li>" for x in tx.LANGUES)
    miles = "".join(f'<li><h3>{E(a)}</h3><p>{E(b)}</p></li>' for a, b in p["milestones"])
    trainers = "".join(f"<p>{E(x)}</p>" for x in p["trainers"])
    body = f'''{page_head(lang, crumbs, p["title"], p["lead"])}
<section class="section"><div class="wrap split split--top">
<div><h2>{E(p["trainers_title"])}</h2>{trainers}<ul class="langues">{langs}</ul>{picture(IMG.PAGE_IMAGE["centre"], lang, sizes="(min-width: 980px) 560px, 100vw", cls="media mt-6")}</div>
<div><h2>{E(p["milestones_title"])}</h2><ol class="timeline">{miles}</ol></div>
</div></section>
<section class="section section--papier" aria-labelledby="t-p"><div class="wrap"><div class="section-head"><h2 id="t-p">{E(p["partners_title"])}</h2></div><ul class="partner-chips">{partners}</ul></div></section>
<section class="section section--encre on-dark" aria-labelledby="t-l"><div class="wrap"><div class="section-head"><h2 id="t-l">{E(p["where_title"])}</h2></div>{lieux_html(lang)}</div></section>
{cta_band(lang)}'''
    page(lang, R.page("centre", lang), p["meta_title"], p["meta_desc"], body, alternates=all_alts("centre"), active="centre", crumbs=crumbs, prio="0.6",
         og_image=share_image(IMG.PAGE_IMAGE["centre"]))


def build_langues(lang):
    p = P(lang, "langues")
    tx = T[lang]
    crumbs = [home_crumb(lang), (p["title"], R.page("langues", lang))]
    langs = "".join(f"<li>{E(x[:1].upper() + x[1:])}</li>" for x in tx.LANGUES)
    greets = "".join(f'<li lang="{code}"><span>{E(g)}</span></li>' for code, g in C.GREETINGS)
    how = "".join(f"<p>{E(x)}</p>" for x in p["how"])
    body = f'''{page_head(lang, crumbs, p["title"], p["lead"])}
<section class="section"><div class="wrap split split--top">
<div><h2>{E(p["list_title"])}</h2><ul class="langues">{langs}</ul><ul class="greetings mt-6" aria-hidden="true">{greets}</ul></div>
<div>{picture(IMG.PAGE_IMAGE["langues"], lang, sizes="(min-width: 980px) 560px, 100vw")}<h2>{E(p["how_title"])}</h2>{how}
<p class="mt-6"><a class="btn btn--bleu" href="{R.page("contact", lang)}?type=devis">{E(t(lang, "cta.quote"))}</a></p></div>
</div></section>
{cta_band(lang, p["cta_title"], p["cta_text"])}'''
    page(lang, R.page("langues", lang), p["meta_title"], p["meta_desc"], body, alternates=all_alts("langues"), crumbs=crumbs, prio="0.6",
         og_image=share_image(IMG.PAGE_IMAGE["langues"]))


def options_formations(lang, with_price=False):
    tx = T[lang]
    out = [f'<option value="">{E(t(lang, "form.choose_training"))}</option>']
    for d in C.DOMAINES:
        out.append(f'<optgroup label="{E(tx.DOMAINES[d["slug"]]["name"])}">')
        for f in C.FORMATIONS:
            if f["domain"] != d["slug"]:
                continue
            pr = f' data-price="{PRICE[f["slug"]]}"' if with_price and PRICE[f["slug"]] else ""
            out.append(f'<option value="{f["slug"]}"{pr}>{E(tx.FORMATIONS[f["slug"]]["title"])}</option>')
        out.append("</optgroup>")
    return "".join(out)


def contact_side(lang):
    p = P(lang, "contact")
    eng, cha = C.LIEUX["engis"], C.LIEUX["charleroi"]
    return f'''<aside class="stack" aria-label="{E(p["reach"])}">
<div class="aside-box contact-box on-dark"><h2>{E(p["reach"])}</h2>
<ul class="contact-lines"><li>{icon("phone")}<a href="{tel()}">{C.SITE["phone_display"]}</a></li><li>{icon("mail")}<a href="mailto:{C.SITE["email"]}">{C.SITE["email"]}</a></li><li>{icon("linkedin")}<a href="{C.SITE["linkedin"]}" rel="noopener" target="_blank">LinkedIn</a></li></ul>
<p>{E(p["reach_text"])}</p></div>
<div class="aside-box"><h2>{E(p["places"])}</h2>
<p><strong>Engis</strong><br>{E(eng["street"])}, {eng["zip"]} Engis<br><a href="{eng["maps"]}" rel="noopener" target="_blank">{E(t(lang, "common.directions"))}</a></p>
<p><strong>Charleroi (CEME)</strong><br>{E(cha["street"])}, {cha["zip"]} Charleroi<br><a href="{cha["maps"]}" rel="noopener" target="_blank">{E(t(lang, "common.directions"))}</a></p></div>
</aside>'''


def consent_field(lang, fid="consent"):
    return (f'<label class="check field" for="{fid}"><input type="checkbox" id="{fid}" name="consent" value="1" required>'
            f'<span>{E(t(lang, "form.consent"))} <a href="{R.page("confidentialite", lang)}">{E(t(lang, "form.consent_link"))}</a>. <span class="req" aria-hidden="true">*</span></span>'
            f'<span class="error">{E(t(lang, "form.consent_error"))}</span></label>')


def hp_field():
    return '<div class="hp" aria-hidden="true"><label for="website">Website</label><input type="text" id="website" name="website" tabindex="-1" autocomplete="off"></div>'


def field(lang, fid, label, typ="text", required=False, auto="", extra="", error_key="form.error_required", placeholder=""):
    req = f' <span class="req" aria-hidden="true">*</span><span class="sr-only">({E(t(lang, "form.required"))})</span>' if required else ""
    ac = f' autocomplete="{auto}"' if auto else ""
    ph = f' placeholder="{E(placeholder)}"' if placeholder else ""
    err = f'<span class="error" id="{fid}-err">{E(t(lang, error_key))}</span>'
    if typ == "textarea":
        ctl = f'<textarea id="{fid}" name="{fid}"{" required" if required else ""}{ph} aria-describedby="{fid}-err" {extra}></textarea>'
    else:
        ctl = f'<input id="{fid}" name="{fid}" type="{typ}"{ac}{" required" if required else ""}{ph} aria-describedby="{fid}-err" {extra}>'
    return f'<div class="field"><label for="{fid}">{E(label)}{req}</label>{ctl}{err}</div>'


def nojs_form(lang):
    """Avec le Worker ou la feuille en direct, le formulaire fonctionne aussi sans JavaScript : envoi classique, réponse
    par une page de confirmation dans la bonne langue. La langue voyage dans un champ caché ajouté après l'ouverture."""
    if not PUBLIC["api"]:
        return ""
    return f' method="post" action="{E(PUBLIC["formEndpoint"])}"><input type="hidden" name="lang" value="{lang}"'


def build_contact(lang):
    p = P(lang, "contact")
    crumbs = [home_crumb(lang), (t(lang, "nav.contact"), R.page("contact", lang))]
    types = [("contact", "form.type_contact"), ("inscription", "form.type_inscription"), ("devis", "form.type_devis"), ("salle", "form.type_salle"), ("prevenir", "form.type_prevenir")]
    topts = f'<option value="">{E(t(lang, "form.choose"))}</option>' + "".join(f'<option value="{v}">{E(t(lang, k))}</option>' for v, k in types)
    body = f'''{page_head(lang, crumbs, p["title"], p["lead"])}
<section class="section"><div class="wrap form-layout">
<div>
<div class="form-status" data-status tabindex="-1" role="status"></div>
<form class="form" data-api-form="contact" novalidate{nojs_form(lang)}>
{hp_field()}
<fieldset><legend>{E(t(lang, "form.your_request"))}</legend>
<div class="row-2">
<div class="field"><label for="type">{E(t(lang, "form.type"))} <span class="req" aria-hidden="true">*</span></label><select id="type" name="form" required aria-describedby="type-err">{topts}</select><span class="error" id="type-err">{E(t(lang, "form.error_required"))}</span></div>
<div class="field"><label for="formation">{E(t(lang, "form.training"))}</label><select id="formation" name="training">{options_formations(lang)}</select></div>
</div>
{field(lang, "message", t(lang, "form.message"), "textarea", placeholder=t(lang, "form.message_placeholder"))}
</fieldset>
<fieldset><legend>{E(t(lang, "form.your_details"))}</legend>
{field(lang, "name", t(lang, "form.name"), required=True, auto="name")}
<div class="row-2">{field(lang, "email", t(lang, "form.email"), "email", True, "email", error_key="form.error_email")}{field(lang, "phone", t(lang, "form.phone"), "tel", False, "tel", error_key="form.error_phone")}</div>
{field(lang, "company", t(lang, "form.company"), auto="organization")}
</fieldset>
{consent_field(lang)}
<div class="turnstile" data-turnstile></div>
<div><button class="btn btn--signal" type="submit">{E(t(lang, "form.submit_contact"))}</button></div>
</form>
{"" if PUBLIC["api"] else '<noscript><p class="notice">' + E(t(lang, "form.error_text")) + "</p></noscript>"}
</div>
{contact_side(lang)}
</div></section>'''
    page(lang, R.page("contact", lang), p["meta_title"], p["meta_desc"], body, alternates=all_alts("contact"), active="contact", crumbs=crumbs, prio="0.7",
         scripts=["/assets/js/forms.js"], styles=("account.css",))


def build_inscription(lang):
    p = P(lang, "inscription")
    crumbs = [home_crumb(lang), (t(lang, "nav.agenda"), R.page("agenda", lang)), (p["title"], R.page("inscription", lang))]
    langs = "".join(f'<option value="{code}">{E(name[:1].upper() + name[1:])}</option>' for code, name in zip(C.LANG_CODES, T[lang].LANGUES))
    pay_online = (f'\n<label class="pay-option"><input type="radio" name="payMode" value="online" checked><span><strong>{E(t(lang, "reg.pay_online"))}</strong><small>{E(t(lang, "reg.pay_online_hint"))}</small>'
                  '<span class="pay-logos" aria-hidden="true"><span>Bancontact</span><span>Visa</span><span>Mastercard</span><span>Apple Pay</span></span></span></label>') if PUBLIC["onlinePayment"] else ""
    body = f'''{page_head(lang, crumbs, p["title"], PS(lang, "inscription", "lead"))}
<section class="section"><div class="wrap form-layout reg" data-registration>
<div>
<div class="form-status" data-status tabindex="-1" role="status"></div>
<div class="reg-auth notice" data-reg-auth hidden></div>
<form class="form" data-reg-form novalidate>
{hp_field()}
<fieldset><legend><span class="step-n">1</span>{E(t(lang, "reg.step_session"))}</legend>
<div class="field"><label for="r-training">{E(t(lang, "reg.training"))} <span class="req" aria-hidden="true">*</span></label><select id="r-training" name="training" required aria-describedby="r-training-err">{options_formations(lang, with_price=True)}</select><span class="error" id="r-training-err">{E(t(lang, "form.error_required"))}</span></div>
<div class="field"><span class="label">{E(t(lang, "reg.session"))}</span><div class="session-picks" data-session-picks role="radiogroup" aria-label="{E(t(lang, "reg.session"))}"></div><p class="hint" data-session-hint aria-live="polite"></p></div>
<div class="field"><label for="r-lang">{E(t(lang, "reg.training_lang"))}</label><select id="r-lang" name="trainingLanguage">{langs}</select><span class="hint">{E(t(lang, "reg.training_lang_hint"))}</span></div>
</fieldset>
<fieldset><legend><span class="step-n">2</span>{E(t(lang, "reg.step_people"))}</legend>
<div data-participants class="stack"></div>
<div><button class="btn btn--contour btn--petit" type="button" data-add-participant>{icon("plus")} {E(t(lang, "reg.add_participant"))}</button></div>
</fieldset>
<fieldset><legend><span class="step-n">3</span>{E(t(lang, "reg.step_billing"))}</legend>
<div class="field"><span class="label">{E(t(lang, "reg.who"))}</span><div class="seg" role="radiogroup">
<label><input type="radio" name="billingType" value="individual" checked> {E(t(lang, "reg.who_individual"))}</label>
<label><input type="radio" name="billingType" value="company"> {E(t(lang, "reg.who_company"))}</label></div></div>
<div class="row-2" data-company-fields hidden>{field(lang, "company", t(lang, "form.company"), auto="organization")}{field(lang, "vat", t(lang, "reg.vat"), placeholder="BE0123.456.749", error_key="form.error_vat")}</div>
<div class="row-2">{field(lang, "firstName", t(lang, "form.first_name"), required=True, auto="given-name")}{field(lang, "lastName", t(lang, "form.last_name"), required=True, auto="family-name")}</div>
<div class="row-2">{field(lang, "email", t(lang, "form.email"), "email", True, "email", error_key="form.error_email")}{field(lang, "phone", t(lang, "form.phone"), "tel", True, "tel", error_key="form.error_phone")}</div>
{field(lang, "street", t(lang, "reg.street"), required=True, auto="street-address")}
<div class="row-3">{field(lang, "zip", t(lang, "reg.zip"), required=True, auto="postal-code")}{field(lang, "city", t(lang, "reg.city"), required=True, auto="address-level2")}{field(lang, "country", t(lang, "reg.country"), auto="country", extra='value="BE"')}</div>
{field(lang, "notes", t(lang, "reg.notes"), "textarea", placeholder=t(lang, "reg.notes_placeholder"))}
</fieldset>
<fieldset data-pay-fieldset><legend><span class="step-n">4</span>{E(t(lang, "reg.step_payment"))}</legend>
<div class="pay-options">{pay_online}
<label class="pay-option"><input type="radio" name="payMode" value="invoice"{"" if PUBLIC["onlinePayment"] else " checked"}><span><strong>{E(t(lang, "reg.pay_invoice"))}</strong><small>{E(t(lang, "reg.pay_invoice_hint" if PUBLIC["onlinePayment"] else "reg.pay_invoice_hint_request"))}</small></span></label>
</div>
<p class="hint" data-pay-hint></p>
</fieldset>
<label class="check field" for="terms"><input type="checkbox" id="terms" name="terms" value="1" required><span>{E(t(lang, "reg.accept_terms"))} <a href="{R.page("cgv", lang)}">{E(t(lang, "reg.terms_link"))}</a> {E(t(lang, "reg.and_privacy"))} <a href="{R.page("confidentialite", lang)}">{E(t(lang, "form.consent_link"))}</a>. <span class="req" aria-hidden="true">*</span></span><span class="error">{E(t(lang, "form.consent_error"))}</span></label>
<div class="turnstile" data-turnstile></div>
<div class="btn-row"><button class="btn btn--signal" type="submit" data-reg-submit>{E(t(lang, "reg.submit_pay" if PUBLIC["onlinePayment"] else "reg.submit_request"))}</button></div>
</form>
<template id="tpl-participant"><div class="participant"><p class="participant-title"></p><button class="btn btn--contour btn--petit remove" type="button">{E(t(lang, "reg.remove"))}</button>
<div class="row-2"><div class="field"><label data-for="p-first">{E(t(lang, "form.first_name"))} <span class="req" aria-hidden="true">*</span></label><input data-name="p-first" type="text" required autocomplete="off"><span class="error">{E(t(lang, "form.error_required"))}</span></div>
<div class="field"><label data-for="p-last">{E(t(lang, "form.last_name"))} <span class="req" aria-hidden="true">*</span></label><input data-name="p-last" type="text" required autocomplete="off"><span class="error">{E(t(lang, "form.error_required"))}</span></div></div>
<div class="field"><label data-for="p-email">{E(t(lang, "reg.participant_email"))}</label><input data-name="p-email" type="email" autocomplete="off"><span class="error">{E(t(lang, "form.error_email"))}</span></div></div></template>
<noscript><p class="notice">{E(t(lang, "sess.noscript"))}</p></noscript>
</div>
<aside class="stack" aria-label="{E(t(lang, "reg.recap"))}">
<div class="recap" data-recap><h2>{E(t(lang, "reg.recap"))}</h2>
<dl class="recap-dl"><div><dt>{E(t(lang, "reg.training"))}</dt><dd data-r-training>—</dd></div><div><dt>{E(t(lang, "reg.session"))}</dt><dd data-r-session>—</dd></div><div><dt>{E(t(lang, "reg.recap_seats"))}</dt><dd data-r-seats>1</dd></div>
<div><dt>{E(t(lang, "reg.recap_excl"))}</dt><dd data-r-excl>—</dd></div><div><dt data-r-vat-label>{E(t(lang, "reg.recap_vat", rate=round(PUBLIC["vatRate"] * 100)))}</dt><dd data-r-vat>—</dd></div><div class="recap-total"><dt>{E(t(lang, "reg.recap_incl"))}</dt><dd data-r-incl>—</dd></div></dl>
<p class="muted small">{E(t(lang, "reg.recap_note"))}</p></div>
{contact_side(lang)}
</aside>
</div></section>'''
    page(lang, R.page("inscription", lang), p["meta_title"], p["meta_desc"], body, alternates=all_alts("inscription"), active="agenda", crumbs=crumbs,
         robots="noindex, follow", sitemap=False, styles=("sessions.css", "account.css"),
         scripts=(["/assets/vendor/supabase.js", "/assets/js/auth.js"] if PUBLIC["accounts"] else [])
         + ["/assets/js/sessions-data.js", "/assets/js/sessions.js", "/assets/js/pricing.js", "/assets/js/vat.js", "/assets/js/forms.js", "/assets/js/registration.js"])


def build_faq(lang):
    p = P(lang, "faq")
    tx = T[lang]
    crumbs = [home_crumb(lang), (p["title"], R.page("faq", lang))]
    trainings = [qa for f in C.FORMATIONS for qa in tx.FORMATIONS[f["slug"]]["faq"]]
    body = f'''{page_head(lang, crumbs, p["title"], p["lead"])}
<section class="section"><div class="wrap-narrow"><h2>{E(p["general"])}</h2>{faq_html(tx.FAQ_GENERALE)}</div></section>
<section class="section section--papier"><div class="wrap-narrow"><h2>{E(p["trainings"])}</h2>{faq_html(trainings)}</div></section>
{cta_band(lang, p["cta_title"], p["cta_text"])}'''
    page(lang, R.page("faq", lang), p["meta_title"], p["meta_desc"], body, alternates=all_alts("faq"), crumbs=crumbs, jsonld=[faq_jsonld(tx.FAQ_GENERALE)], prio="0.6")


def build_articles(lang):
    p = P(lang, "actualites")
    tx = T[lang]
    crumbs = [home_crumb(lang), (p["title"], R.page("actualites", lang))]
    cards = []
    for a in C.ARTICLES:
        txt = tx.ARTICLES[a["key"]]
        url = R.article(a["key"], lang)
        tm = f'<time datetime="{a["date"]}">{E(long_date(a["date"], lang))}</time>' if a["date"] else f'<span class="tag">{E(p["news"])}</span>'
        aimg = picture(IMG.ARTICLE_IMAGE.get(a["key"]), lang, sizes=CARD_SIZES, cls="card-media", alt="")
        cards.append(f'<li><article class="post spot">{aimg}{tm}<h2><a href="{url}">{E(txt["title"])}</a></h2><p>{E(txt["desc"])}</p></article></li>')
    body = f'''{page_head(lang, crumbs, p["title"], p["lead"])}
<section class="section"><div class="wrap"><ul class="post-list">{"".join(cards)}</ul></div></section>'''
    page(lang, R.page("actualites", lang), p["meta_title"], p["meta_desc"], body, alternates=all_alts("actualites"), crumbs=crumbs, prio="0.6")
    for a in C.ARTICLES:
        txt = tx.ARTICLES[a["key"]]
        url = R.article(a["key"], lang)
        cr = crumbs + [(txt["title"], url)]
        parts = []
        for kind, val in txt["body"]:
            if kind == "p":
                parts.append(f"<p>{E(val)}</p>")
            elif kind == "h2":
                parts.append(f"<h2>{E(val)}</h2>")
            elif kind == "ul":
                parts.append("<ul>" + "".join(f"<li>{E(x)}</li>" for x in val) + "</ul>")
        rel = "".join(f_card(formation(s, lang), lang, media=False) for s in a["related"])
        rel_html = f'<section class="section section--papier"><div class="wrap"><h2>{E(p["related"])}</h2><ul class="related">{rel}</ul></div></section>' if rel else ""
        meta = f'<p class="muted"><time datetime="{a["date"]}">{E(p["published"].format(date=long_date(a["date"], lang)))}</time></p>' if a["date"] else ""
        body = f'''{page_head(lang, cr, txt["title"], None, meta, narrow=True)}
<article class="section"><div class="wrap-narrow prose">{picture(IMG.ARTICLE_IMAGE.get(a["key"]), lang, sizes="(min-width: 800px) 760px, 100vw", cls="media media--wide")}{"".join(parts)}{updated_html(lang, a.get("updated") or a["date"])}</div></article>
{rel_html}{cta_band(lang)}'''
        ld = {"@context": "https://schema.org", "@type": "Article", "headline": txt["title"], "description": txt["desc"],
              "author": {"@type": "Organization", "@id": CANON + "/#organisation", "name": "Centre CFS"}, "publisher": {"@id": CANON + "/#organisation"},
              "mainEntityOfPage": CANON + url, "inLanguage": R.HTML_LANG[lang], "image": CANON + share_image(IMG.ARTICLE_IMAGE.get(a["key"]))}
        if a["date"]:
            ld["datePublished"] = a["date"]
        alts = {lg: R.article(a["key"], lg) for lg in LANGS}
        page(lang, url, txt.get("meta_title", txt["title"]), txt["desc"], body, alternates=alts, crumbs=cr, jsonld=[ld], progress=True, prio="0.5",
             og_image=share_image(IMG.ARTICLE_IMAGE.get(a["key"])))


def legal_blocks(lang, blocks):
    bce = C.SITE["bce"] or {"fr": "[à compléter]", "nl": "[in te vullen]", "en": "[to be completed]"}[lang]
    out = []
    for kind, val in blocks:
        if kind == "ul":
            out.append("<ul>" + "".join(f"<li>{E(x)}</li>" for x in val) + "</ul>")
        else:
            txt = E(val.format(legal_name=T[lang].SITE["legal_name"], bce=bce))
            out.append(f"<{kind}>{txt}</{kind}>")
    return "".join(out)


def build_legal(lang):
    for key in ("mentions", "confidentialite", "cgv", "accessibilite", "cookies"):
        lg = T[lang].LEGAL[key]
        crumbs = [home_crumb(lang), (lg["title"], R.page(key, lang))]
        draft = f'<div class="notice notice--draft">{icon("alert")}<p>{E(lg["draft"])}</p></div>' if lg.get("draft") else ""
        body = f'''{page_head(lang, crumbs, lg["title"], lg.get("lead"), narrow=True)}
<section class="section"><div class="wrap-narrow prose">{draft}{legal_blocks(lang, lg["blocks"])}</div></section>'''
        page(lang, R.page(key, lang), lg["meta_title"], lg["meta_desc"], body, alternates=all_alts(key), crumbs=crumbs, prio="0.2")


def build_plan(lang):
    p = P(lang, "plan")
    tx = T[lang]
    crumbs = [home_crumb(lang), (p["title"], R.page("plan", lang))]
    doms = "".join(f'<li><a href="{R.domain(d["slug"], lang)}">{E(tx.DOMAINES[d["slug"]]["long"])}</a><ul>'
                   + "".join(f'<li><a href="{R.formation(f["slug"], lang)}">{E(tx.FORMATIONS[f["slug"]]["full"])}</a></li>' for f in C.FORMATIONS if f["domain"] == d["slug"])
                   + "</ul></li>" for d in C.DOMAINES)
    arts = "".join(f'<li><a href="{R.article(a["key"], lang)}">{E(tx.ARTICLES[a["key"]]["title"])}</a></li>' for a in C.ARTICLES)
    simple = [("agenda", "nav.agenda"), ("entreprises", "footer.companies"), ("salles", "nav.salles"), ("centre", "nav.centre"), ("langues", "footer.languages"), ("faq", "footer.faq"),
              ("contact", "nav.contact")] + ([("compte", "nav.account")] if PUBLIC["accounts"] else []) + [("mentions", "footer.legal"), ("confidentialite", "footer.privacy"), ("cgv", "footer.terms"), ("accessibilite", "footer.accessibility"), ("cookies", "footer.cookies")]
    lis = "".join(f'<li><a href="{R.page(k, lang)}">{E(t(lang, lab))}</a></li>' for k, lab in simple)
    body = f'''{page_head(lang, crumbs, p["title"], narrow=True)}
<section class="section"><div class="wrap-narrow prose"><ul>
<li><a href="{R.page("home", lang)}">{E(t(lang, "nav.home_crumb"))}</a></li><li><a href="{R.page("formations", lang)}">{E(t(lang, "footer.catalog"))}</a><ul>{doms}</ul></li>
<li><a href="{R.page("actualites", lang)}">{E(t(lang, "footer.news"))}</a><ul>{arts}</ul></li>{lis}</ul></div></section>'''
    page(lang, R.page("plan", lang), p["meta_title"], p["meta_desc"], body, alternates=all_alts("plan"), crumbs=crumbs, prio="0.2")


def build_search(lang):
    """Page de résultats de recherche (non indexée). Formulaire GET ?q=… ; résultats calculés dans le navigateur
    à partir de la base de connaissances du site (site/src/assets/js/search/search.js)."""
    title = t(lang, "search.title")
    crumbs = [home_crumb(lang), (title, R.page("recherche", lang))]
    body = f'''{page_head(lang, crumbs, t(lang, "search.label"), None, narrow=True)}
<section class="section search-page" data-search-page><div class="wrap-narrow">
<form class="search-form" role="search" action="{R.page("recherche", lang)}" method="get">
<label class="sr-only" for="search-q">{E(t(lang, "search.label"))}</label>
<input id="search-q" name="q" type="search" autocomplete="off" spellcheck="false" maxlength="120" placeholder="{E(t(lang, "search.placeholder"))}">
<button class="btn btn--bleu" type="submit">{icon("search")} {E(t(lang, "search.submit"))}</button></form>
<p class="search-hint muted">{E(t(lang, "search.hint"))}</p>
<p class="search-count" data-search-count role="status" aria-live="polite"></p>
<ol class="search-results" data-search-results></ol>
<noscript><p class="notice">{E(t(lang, "search.noscript"))} <a href="{R.page("plan", lang)}">{E(P(lang, "plan", "title"))}</a></p></noscript>
</div></section>'''
    page(lang, R.page("recherche", lang), title, t(lang, "search.meta_desc"), body, alternates=all_alts("recherche"), robots="noindex, follow", sitemap=False)


def build_404(lang):
    p = P(lang, "404")
    body = f'''<section class="section err-404"><div class="wrap-narrow center">
<div class="center-flex">{sign("triangle", "jaune", "eclair", "sign sign--xl", p["sign"])}</div>
<h1>{E(p["title"])}</h1>
<p class="lead">{E(p["lead"])}</p>
<div class="btn-row" data-center><a class="btn btn--signal" href="{R.page("formations", lang)}">{E(t(lang, "cta.catalog"))}</a><a class="btn btn--contour" href="{R.page("agenda", lang)}">{E(t(lang, "nav.agenda"))}</a><a class="btn btn--contour" href="{R.page("contact", lang)}">{E(t(lang, "nav.contact"))}</a></div>
</div></section>'''
    path = "/404.html" if lang == "fr" else f"/{lang}/404.html"
    page(lang, path, p["meta_title"], p["title"], body, robots="noindex", sitemap=False, alternates={lang: path})


def build_paiement(lang):
    p = P(lang, "paiement")
    body = f'''<section class="section pay-page"><div class="wrap-narrow">
<div class="pay-card" data-payment aria-live="polite"><div class="pay-spinner" aria-hidden="true"></div><h1>{E(p["title"])}</h1><p class="lead" data-pay-text>{E(t(lang, "pay.checking"))}</p>
<div class="btn-row" data-center data-pay-actions hidden><a class="btn btn--signal" href="{R.page("compte", lang)}">{E(t(lang, "pay.to_account"))}</a><a class="btn btn--contour" href="{R.page("agenda", lang)}">{E(t(lang, "pay.to_agenda"))}</a></div></div>
<noscript><p class="notice">{E(t(lang, "sess.noscript"))}</p></noscript>
</div></section>'''
    page(lang, R.page("paiement", lang), p["meta_title"], p["title"], body, alternates=all_alts("paiement"), robots="noindex, nofollow", sitemap=False,
         styles=("account.css",), scripts=["/assets/js/payment.js"])


def auth_shell(lang, title, inner, side=True):
    lead = P(lang, "compte", "lead")
    aside = f'''<aside class="auth-side on-dark" aria-hidden="true"><div class="auth-board">{"".join(dsign(d["slug"]) for d in C.DOMAINES)}</div><p>{E(lead)}</p></aside>''' if side else ""
    return f'''<section class="section auth-page"><div class="wrap"><div class="auth-card"><div class="auth-main">
<h1>{E(title)}</h1>
<div class="auth-unavailable notice" data-auth-unavailable hidden><p>{E(t(lang, "acc.unavailable"))}</p></div>
<div class="form-status" data-status tabindex="-1" role="status"></div>
{inner}
<noscript><p class="notice">{E(t(lang, "sess.noscript"))}</p></noscript>
</div>{aside}</div></div></section>'''


ACCOUNT_SCRIPTS = ["/assets/vendor/supabase.js", "/assets/js/auth.js", "/assets/js/vat.js", "/assets/js/forms.js", "/assets/js/account.js"]


def pw_field(lang, fid, label, auto, meter=False):
    m = ""
    if meter:
        m = (f'<div class="pw-meter" data-pw-meter aria-live="polite"><span class="pw-bar"><i></i></span><span class="pw-label" data-pw-label>{E(t(lang, "acc.strength_0"))}</span></div>'
             f'<span class="hint">{E(t(lang, "acc.password_hint"))}</span>')
    return (f'<div class="field"><label for="{fid}">{E(label)} <span class="req" aria-hidden="true">*</span></label><div class="pw-wrap"><input id="{fid}" name="{fid}" type="password" autocomplete="{auto}" required minlength="{10 if meter else 1}" aria-describedby="{fid}-err">'
            f'<button class="pw-toggle" type="button" data-pw-toggle aria-label="{E(t(lang, "acc.show_password"))}" aria-pressed="false">{icon("eye")}</button></div>{m}'
            f'<span class="error" id="{fid}-err">{E(t(lang, "acc.error_weak" if meter else "form.error_required"))}</span></div>')


def build_account_pages(lang):
    def acc_page(key, title, inner, side=True, robots="noindex, nofollow"):
        page(lang, R.page(key, lang), title, P(lang, "compte", "lead"), auth_shell(lang, title, inner, side), alternates=all_alts(key), robots=robots,
             sitemap=False, styles=("account.css",), scripts=ACCOUNT_SCRIPTS, body_class="is-account")

    google = (f'<p class="auth-or"><span>{E(t(lang, "acc.or"))}</span></p><button class="btn btn--contour btn--bloc" type="button" data-auth-google>{icon("google")} {E(t(lang, "acc.google"))}</button>'
              if PUBLIC["googleAuth"] else "")
    login = f'''<form class="form form--auth" data-auth="login" novalidate>
{field(lang, "email", t(lang, "acc.email"), "email", True, "email", error_key="form.error_email")}
{pw_field(lang, "password", t(lang, "acc.password"), "current-password")}
<div class="field mfa-field" data-mfa-field hidden><label for="mfa-code">{E(t(lang, "acc.mfa_code"))}</label><input id="mfa-code" name="mfa" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{{6}}" maxlength="6"><span class="hint">{E(t(lang, "acc.mfa_required"))}</span></div>
<div class="turnstile" data-turnstile></div>
<button class="btn btn--signal btn--bloc" type="submit">{E(t(lang, "acc.login"))}</button>
<p class="auth-links"><a href="{R.page("motdepasse", lang)}">{E(t(lang, "acc.forgot"))}</a><button class="link-btn" type="button" data-auth-magic>{E(t(lang, "acc.magic"))}</button></p>
</form>{google}
<p class="auth-switch">{E(t(lang, "acc.no_account"))} <a href="{R.page("creer", lang)}">{E(t(lang, "acc.signup"))}</a></p>'''
    acc_page("connexion", t(lang, "acc.login_title"), login)

    signup = f'''<form class="form form--auth" data-auth="signup" novalidate>
<div class="row-2">{field(lang, "firstName", t(lang, "form.first_name"), required=True, auto="given-name")}{field(lang, "lastName", t(lang, "form.last_name"), required=True, auto="family-name")}</div>
{field(lang, "email", t(lang, "acc.email"), "email", True, "email", error_key="form.error_email")}
{pw_field(lang, "password", t(lang, "acc.password"), "new-password", meter=True)}
<label class="check field" for="accept"><input type="checkbox" id="accept" name="accept" required><span>{E(t(lang, "acc.accept_terms"))} (<a href="{R.page("cgv", lang)}">{E(t(lang, "reg.terms_link"))}</a>, <a href="{R.page("confidentialite", lang)}">{E(t(lang, "form.consent_link"))}</a>) <span class="req" aria-hidden="true">*</span></span><span class="error">{E(t(lang, "form.consent_error"))}</span></label>
<label class="check field" for="newsletter"><input type="checkbox" id="newsletter" name="newsletter"><span>{E(t(lang, "acc.newsletter"))}</span></label>
<div class="turnstile" data-turnstile></div>
<button class="btn btn--signal btn--bloc" type="submit">{E(t(lang, "acc.signup"))}</button>
</form>{google}
<p class="auth-switch">{E(t(lang, "acc.have_account"))} <a href="{R.page("connexion", lang)}">{E(t(lang, "acc.login"))}</a></p>'''
    acc_page("creer", t(lang, "acc.signup_title"), signup)

    reset = f'''<form class="form form--auth" data-auth="reset" novalidate>
{field(lang, "email", t(lang, "acc.email"), "email", True, "email", error_key="form.error_email")}
<div class="turnstile" data-turnstile></div>
<button class="btn btn--signal btn--bloc" type="submit">{E(t(lang, "acc.reset_send"))}</button></form>
<p class="auth-switch"><a href="{R.page("connexion", lang)}">{E(t(lang, "acc.login"))}</a></p>'''
    acc_page("motdepasse", t(lang, "acc.reset_title"), reset)

    confirm = f'''<p class="lead" data-confirm-text>{E(t(lang, "common.loading"))}</p>
<form class="form form--auth" data-auth="newpassword" novalidate hidden><p>{E(t(lang, "acc.set_new_password"))}</p>
{pw_field(lang, "password", t(lang, "acc.password_new"), "new-password", meter=True)}
<button class="btn btn--signal btn--bloc" type="submit">{E(t(lang, "acc.save"))}</button></form>
<p class="auth-switch" data-confirm-next hidden><a class="btn btn--bleu" href="{R.page("compte", lang)}">{E(t(lang, "acc.title"))}</a></p>'''
    acc_page("confirmation", t(lang, "acc.confirm_title"), confirm)

    tabs = [("bookings", "acc.tab_bookings", "calendar"), ("certificates", "acc.tab_certificates", "award"), ("profile", "acc.tab_profile", "user"),
            ("company", "acc.tab_company", "building"), ("security", "acc.tab_security", "shield"), ("data", "acc.tab_data", "doc")]
    tab_btns = "".join(f'<button class="acc-tab" type="button" role="tab" id="tab-{k}" aria-controls="panel-{k}" aria-selected="{"true" if i == 0 else "false"}" tabindex="{0 if i == 0 else -1}" data-tab="{k}">{icon(ic)}<span>{E(t(lang, lab))}</span></button>'
                       for i, (k, lab, ic) in enumerate(tabs))
    locale_opts = "".join(f'<option value="{lg}">{E(UI[lg]["lang.name"])}</option>' for lg in LANGS)
    dashboard = f'''<section class="section acc-page" data-account hidden><div class="wrap">
<div class="acc-head"><div><h1 data-acc-hello>{E(t(lang, "acc.title"))}</h1><p class="muted" data-acc-email></p></div>
<div class="btn-row"><a class="btn btn--signal" href="{R.page("agenda", lang)}">{E(t(lang, "cta.book"))}</a><button class="btn btn--contour" type="button" data-auth-logout>{E(t(lang, "acc.logout"))}</button></div></div>
<div class="notice" data-mfa-admin hidden><p>{E(t(lang, "acc.mfa_admin"))}</p></div>
<div class="acc-layout"><div class="acc-tabs" role="tablist" aria-orientation="vertical">{tab_btns}</div>
<div class="acc-panels">
<div class="form-status" data-status tabindex="-1" role="status"></div>
<section class="acc-panel" role="tabpanel" id="panel-bookings" aria-labelledby="tab-bookings"><h2>{E(t(lang, "acc.tab_bookings"))}</h2><div data-bookings><p class="muted">{E(t(lang, "common.loading"))}</p></div></section>
<section class="acc-panel" role="tabpanel" id="panel-certificates" aria-labelledby="tab-certificates" hidden><h2>{E(t(lang, "acc.tab_certificates"))}</h2><div data-certificates></div></section>
<section class="acc-panel" role="tabpanel" id="panel-profile" aria-labelledby="tab-profile" hidden><h2>{E(t(lang, "acc.tab_profile"))}</h2>
<form class="form" data-profile-form novalidate>
<div class="field"><span class="label">{E(t(lang, "acc.profile_type"))}</span><div class="seg"><label><input type="radio" name="account_type" value="individual"> {E(t(lang, "acc.type_individual"))}</label><label><input type="radio" name="account_type" value="company_manager"> {E(t(lang, "acc.type_company"))}</label></div></div>
<div class="row-2">{field(lang, "first_name", t(lang, "form.first_name"), required=True, auto="given-name")}{field(lang, "last_name", t(lang, "form.last_name"), required=True, auto="family-name")}</div>
<div class="row-2">{field(lang, "phone", t(lang, "form.phone"), "tel", False, "tel", error_key="form.error_phone")}<div class="field"><label for="locale">{E(t(lang, "acc.locale"))}</label><select id="locale" name="locale">{locale_opts}</select></div></div>
<label class="check field" for="marketing"><input type="checkbox" id="marketing" name="marketing_consent"><span>{E(t(lang, "acc.marketing"))}</span></label>
<button class="btn btn--bleu" type="submit">{E(t(lang, "acc.save"))}</button></form></section>
<section class="acc-panel" role="tabpanel" id="panel-company" aria-labelledby="tab-company" hidden><h2>{E(t(lang, "acc.tab_company"))}</h2>
<form class="form" data-company-form novalidate>
<div class="row-2">{field(lang, "c_name", t(lang, "acc.company_name"), required=True, auto="organization")}{field(lang, "c_vat", t(lang, "acc.company_vat"), required=True, placeholder="BE0123.456.749", error_key="form.error_vat")}</div>
{field(lang, "c_street", t(lang, "reg.street"), required=True, auto="street-address")}
<div class="row-3">{field(lang, "c_zip", t(lang, "reg.zip"), required=True, auto="postal-code")}{field(lang, "c_city", t(lang, "reg.city"), required=True, auto="address-level2")}{field(lang, "c_country", t(lang, "reg.country"), extra='value="BE"')}</div>
<button class="btn btn--bleu" type="submit">{E(t(lang, "acc.company_create"))}</button></form>
<div data-company-extra hidden><h3>{E(t(lang, "acc.company_members"))}</h3><ul class="plain-list" data-company-members></ul>
<form class="form form--inline" data-invite-form novalidate>{field(lang, "invite_email", t(lang, "acc.company_invite"), "email", True, "email", error_key="form.error_email")}<button class="btn btn--contour" type="submit">{E(t(lang, "acc.company_invite"))}</button></form>
<h3>{E(t(lang, "acc.company_workers"))}</h3><div data-company-workers></div>
<h3>{E(t(lang, "acc.company_deadlines"))}</h3><div data-company-deadlines></div></div></section>
<section class="acc-panel" role="tabpanel" id="panel-security" aria-labelledby="tab-security" hidden><h2>{E(t(lang, "acc.tab_security"))}</h2>
<h3>{E(t(lang, "acc.mfa_title"))}</h3><p class="muted">{E(t(lang, "acc.mfa_intro"))}</p><div data-mfa></div>
<h3>{E(t(lang, "acc.change_password"))}</h3><form class="form" data-password-form novalidate>{pw_field(lang, "new_password", t(lang, "acc.password_new"), "new-password", meter=True)}<button class="btn btn--bleu" type="submit">{E(t(lang, "acc.save"))}</button></form></section>
<section class="acc-panel" role="tabpanel" id="panel-data" aria-labelledby="tab-data" hidden><h2>{E(t(lang, "acc.tab_data"))}</h2>
<p>{E(t(lang, "acc.export_hint"))}</p><button class="btn btn--bleu" type="button" data-export>{icon("download")} {E(t(lang, "acc.export"))}</button>
<div class="danger-zone"><h3>{E(t(lang, "acc.delete"))}</h3><p>{E(t(lang, "acc.delete_hint"))}</p>
<form class="form" data-delete-form novalidate>{field(lang, "confirm_email", t(lang, "acc.delete_confirm"), "email", True, "off", error_key="form.error_email")}<button class="btn btn--danger" type="submit">{E(t(lang, "acc.delete_button"))}</button></form></div></section>
</div></div></div></section>
<div class="wrap" data-account-gate><p class="lead center acc-gate">{E(t(lang, "common.loading"))}</p></div>'''
    page(lang, R.page("compte", lang), t(lang, "acc.title"), P(lang, "compte", "lead"), dashboard, alternates=all_alts("compte"), robots="noindex, nofollow",
         sitemap=False, styles=("account.css",), scripts=ACCOUNT_SCRIPTS + ["/assets/js/pricing.js"], body_class="is-account")

    ad = P(lang, "admin")
    opts = options_formations(lang)
    admin = f'''<section class="section"><div class="wrap-narrow" data-admin hidden>
<h1>{E(ad["title"])}</h1><p class="lead">{E(ad["lead"])}</p>
<div class="form-status" data-status tabindex="-1" role="status"></div>
<form class="form" data-cert-form novalidate>
{field(lang, "user_email", ad["user_email"], "email", True, "off", error_key="form.error_email")}
<div class="row-2">{field(lang, "participant", ad["participant"], required=True)}<div class="field"><label for="formation_slug">{E(ad["formation"])}</label><select id="formation_slug" name="formation_slug" required>{opts}</select></div></div>
<div class="row-3">{field(lang, "issued_on", ad["issued"], "date", True)}{field(lang, "valid_until", ad["valid"], "date")}{field(lang, "reservation_ref", ad["ref"], placeholder="CFS-2026-XXXXX")}</div>
<div class="field"><label for="file">{E(ad["file"])}</label><input id="file" name="file" type="file" accept="application/pdf" required></div>
<button class="btn btn--bleu" type="submit">{E(ad["submit"])}</button></form></div>
<div class="wrap-narrow" data-admin-forbidden hidden><p class="notice">{E(ad["forbidden"])}</p></div></section>'''
    page(lang, R.page("admin", lang), ad["meta_title"], ad["lead"], admin, alternates=all_alts("admin"), robots="noindex, nofollow", sitemap=False,
         styles=("account.css",), scripts=ACCOUNT_SCRIPTS, body_class="is-account")  # account.js gère aussi la page admin


# ───────────────────────────── fichiers techniques
DATA_V = {}
KB_V = {}  # empreintes des bases de connaissances de l'assistant (cache)
JS_KEYS = ("lang.", "nav.", "common.", "cta.", "loc.", "sess.", "availability.", "search.", "form.", "reg.", "pay.", "acc.", "chat.", "intro.")


def site_data(lang):
    """window.CFS_I18N (chaînes d'interface) + window.CFS_CATALOG (formations, domaines, lieux, adresses) + config publique."""
    tx = T[lang]
    cat = {
        "lang": lang, "locale": R.INTL[lang],
        "formations": [{"id": f["slug"], "domain": f["domain"], "title": tx.FORMATIONS[f["slug"]]["title"], "full": tx.FORMATIONS[f["slug"]]["full"],
                        "url": BASE + R.formation(f["slug"], lang), "price": PRICE[f["slug"]], "bookable": BOOKABLE[f["slug"]], "lieux": f["lieux"],
                        "duration": tx.FORMATIONS[f["slug"]]["duree"], "hours": tx.FORMATIONS[f["slug"]]["horaires"],
                        "epi": f["domain"] == "equipements"} for f in C.FORMATIONS],
        "domains": [{"id": d["slug"], "name": tx.DOMAINES[d["slug"]]["name"], "url": BASE + R.domain(d["slug"], lang), "color": d["color"], "sign": dsign(d["slug"])} for d in C.DOMAINES],
        "locations": {k: {"name": tx.LIEUX[k]["name"], "full": tx.LIEUX[k]["full"], "street": C.LIEUX[k]["street"], "zip": C.LIEUX[k]["zip"], "city": C.LIEUX[k]["city"], "maps": C.LIEUX[k]["maps"]} for k in C.LIEUX},
        "languages": dict(zip(C.LANG_CODES, tx.LANGUES)),
        "routes": {k: BASE + R.page(k, lang) for k in R.PAGES},
        "alternates": {lg: BASE + R.page("home", lg) for lg in LANGS},
        "langNames": {lg: UI[lg]["lang.name"] for lg in LANGS},
        "bannerText": {lg: {"text": UI[lg]["lang.banner"], "go": UI[lg]["lang.banner_go"], "close": UI[lg]["lang.banner_close"]} for lg in LANGS},
        "icons": {n: icon(n) for n in ("pin", "clock", "globe", "calendar", "arrow", "mail", "phone", "users", "check-circle", "alert", "info", "doc", "close")},
    }
    strings = {k: v for k, v in UI[lang].items() if k.startswith(JS_KEYS)}
    cfg_pub = {k: v for k, v in PUBLIC.items() if k not in ("supabaseUrl", "supabaseKey") or PUBLIC["accounts"]}
    cfg_pub["dev"] = DEV
    cfg_pub["hero3d"] = BASE + asset("/assets/js/hero-3d.js")  # module chargé à la demande par main.js (accueil)
    # Recherche du site : module et base de connaissances (même base que l'assistant) chargés à la demande par main.js
    cfg_pub["search"] = {"module": BASE + asset("/assets/js/search/search.js"), "kb": BASE + f"/assets/data/kb.{lang}.json?v={KB_V.get(lang, '')}",
                         "page": BASE + R.page("recherche", lang)}
    if PUBLIC["chatbot"]:
        # Assistant : moteur, base de connaissances et panneau chargés à la demande par launcher.js
        cfg_pub["assistant"] = {
            "module": BASE + asset("/assets/js/assistant/assistant.js"), "css": BASE + asset("/assets/css/assistant.css"),
            "kb": BASE + f"/assets/data/kb.{lang}.json?v={KB_V.get(lang, '')}",
            "sessions": [BASE + asset("/assets/js/sessions-data.js"), BASE + asset("/assets/js/sessions.js")],
            "ai": cfg("CHATBOT_PROVIDER", "local") != "local",
        }
    js = ("/* Généré par site/build.py — ne pas modifier. Aucune donnée secrète. */\n"
          f"self.CFS_CONFIG={json.dumps(cfg_pub, ensure_ascii=False)};\n"
          f"self.CFS_I18N={json.dumps(strings, ensure_ascii=False, separators=(',', ':'))};\n"
          f"self.CFS_CATALOG={json.dumps(cat, ensure_ascii=False, separators=(',', ':'))};\n")
    DATA_V[lang] = hashlib.sha256(js.encode()).hexdigest()[:10]
    return js


def write_site_data():
    os.makedirs(os.path.join(OUT, "assets", "js"), exist_ok=True)
    for lang in LANGS:
        js = site_data(lang)
        with open(os.path.join(OUT, "assets", "js", f"site-data.{lang}.js"), "w", encoding="utf-8") as fh:
            fh.write(js)


def write_worker_data():
    """Données partagées avec le Worker (routes, catalogue pour le chatbot et les e-mails)."""
    if not os.path.isdir(os.path.join(ROOT, "worker", "src")):
        return
    gen = os.path.join(ROOT, "worker", "src", "generated")
    os.makedirs(gen, exist_ok=True)
    catalog = {}
    for lang in LANGS:
        tx = T[lang]
        catalog[lang] = {
            "formations": [{"id": f["slug"], "domain": f["domain"], "domainName": tx.DOMAINES[f["domain"]]["name"], "title": tx.FORMATIONS[f["slug"]]["title"],
                            "full": tx.FORMATIONS[f["slug"]]["full"], "pitch": tx.FORMATIONS[f["slug"]]["pitch"], "duration": tx.FORMATIONS[f["slug"]]["duree"],
                            "hours": tx.FORMATIONS[f["slug"]]["horaires"], "validity": tx.FORMATIONS[f["slug"]]["validite"], "price": PRICE[f["slug"]],
                            "places": [tx.LIEUX[k]["name"] for k in f["lieux"]], "public": tx.FORMATIONS[f["slug"]]["public"],
                            "prerequisites": tx.FORMATIONS[f["slug"]]["prerequis"], "exam": tx.FORMATIONS[f["slug"]]["examen"],
                            "certificate": tx.FORMATIONS[f["slug"]]["certificat"], "legal": tx.FORMATIONS[f["slug"]]["legal"],
                            "keywords": tx.FORMATIONS[f["slug"]].get("kw", ""), "url": R.formation(f["slug"], lang)} for f in C.FORMATIONS],
            "faq": [{"q": q, "a": a} for q, a in tx.FAQ_GENERALE],
            "locations": {k: {"name": tx.LIEUX[k]["full"], "address": (C.LIEUX[k]["street"] + ", " + C.LIEUX[k]["zip"] + " " + C.LIEUX[k]["city"]) if C.LIEUX[k]["street"] else ""} for k in C.LIEUX},
            "languages": tx.LANGUES,
            "rooms": [{"name": s["name"], "capacity": b["cap"]} for s, b in zip(tx.SALLES, C.SALLES)],
            "pages": {k: R.page(k, lang) for k in ("agenda", "contact", "formations", "entreprises", "salles", "inscription", "faq")},
        }
    with open(os.path.join(gen, "catalog.json"), "w", encoding="utf-8") as fh:
        json.dump({"contact": {"phone": C.SITE["phone_display"], "email": C.SITE["email"]}, "langs": catalog}, fh, ensure_ascii=False, indent=1)
        fh.write("\n")
    with open(os.path.join(gen, "routes.json"), "w", encoding="utf-8") as fh:
        json.dump(R.export(), fh, ensure_ascii=False, indent=1)
        fh.write("\n")
    # Textes des e-mails et des réponses du Worker (mêmes sources que le site : aucune traduction dupliquée)
    worker_keys = ("email.", "form.", "reg.", "nav.", "common.", "pay.", "acc.", "sess.", "availability.")
    with open(os.path.join(gen, "ui.json"), "w", encoding="utf-8") as fh:
        json.dump({lg: {k: v for k, v in UI[lg].items() if k.startswith(worker_keys)} for lg in LANGS}, fh, ensure_ascii=False, indent=1)
        fh.write("\n")


def origin(url):
    u = urlparse(url)
    return f"{u.scheme}://{u.netloc}" if u.scheme and u.netloc else ""


def csp(meta=False):
    """Politique de sécurité du contenu. meta=True : version <meta> (GitHub Pages n'envoie pas d'en-têtes
    personnalisés ; frame-ancestors y est ignoré par les navigateurs, il n'est donc pas repris)."""
    connect = ["'self'"]
    if PUBLIC["accounts"] and PUBLIC["supabaseUrl"]:
        connect += [PUBLIC["supabaseUrl"], PUBLIC["supabaseUrl"].replace("https://", "wss://").replace("http://", "ws://")]
    connect += [o for o in (origin(PUBLIC["formEndpoint"]), origin(PUBLIC["sessionsUrl"])) if o and o not in connect]
    # Accès direct à la feuille : l'application Web Google répond par une redirection vers script.googleusercontent.com
    google = [o for o in ("https://script.google.com", "https://script.googleusercontent.com") if GOOGLE.startswith("https://")]
    connect += [o for o in google if o not in connect]
    forms = " ".join(["'self'"] + google)
    turnstile = bool(PUBLIC["turnstileSiteKey"])
    cf = " https://challenges.cloudflare.com" if turnstile else ""
    return (f"default-src 'self'; script-src 'self'{cf}; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; "
            f"connect-src {' '.join(connect)}; " + (f"frame-src{cf}; " if turnstile else "") + f"form-action {forms}; "
            + ("" if meta else "frame-ancestors 'none'; ")
            + "base-uri 'self'; object-src 'none'; manifest-src 'self'" + ("" if DEV else "; upgrade-insecure-requests"))


def minify_css():
    """Minifie les feuilles de style publiées si rcssmin est installé (pip install rcssmin ; installé par la CI).
    Le JavaScript n'est pas minifié : les minifieurs Python ne gèrent pas toute la syntaxe ES2022 (voir DECISIONS.md)."""
    try:
        import rcssmin
    except ImportError:
        return 0
    folder = os.path.join(OUT, "assets", "css")
    for fn in os.listdir(folder):
        if fn.endswith(".css"):
            path = os.path.join(folder, fn)
            src = open(path, encoding="utf-8").read()
            with open(path, "w", encoding="utf-8") as fh:
                fh.write(rcssmin.cssmin(src))
    return 1


def write_static():
    # Ressources (sources lisibles servies telles quelles ; compression brotli par Cloudflare)
    for sub in ("css", "js", "fonts", "img", "vendor"):
        src = os.path.join(SRC, "assets", sub)
        if os.path.isdir(src):
            shutil.copytree(src, os.path.join(OUT, "assets", sub), dirs_exist_ok=True, ignore=shutil.ignore_patterns("package.json", ".DS_Store", "*.md"))
    minify_css()
    for fn in os.listdir(os.path.join(SRC, "static")):
        shutil.copy(os.path.join(SRC, "static", fn), os.path.join(OUT, fn))
    with open(os.path.join(OUT, "favicon.svg"), "w") as fh:
        fh.write(L.favicon())
    # Sitemaps : un fichier par langue (avec les équivalents hreflang), réunis par un index sitemap.xml
    by_lang = {lg: [] for lg in LANGS}
    for lang, path, alts, prio in PAGES:
        links = "".join(f'<xhtml:link rel="alternate" hreflang="{R.HREFLANG[lg]}" href="{CANON + p}"/>' for lg, p in alts.items())
        if "fr" in alts:
            links += f'<xhtml:link rel="alternate" hreflang="x-default" href="{CANON + alts["fr"]}"/>'
        by_lang[lang].append(f"<url><loc>{CANON + path}</loc><lastmod>{BUILD_DATE.isoformat()}</lastmod><priority>{prio}</priority>{links}</url>")
    for lang, urls in by_lang.items():
        with open(os.path.join(OUT, f"sitemap-{lang}.xml"), "w", encoding="utf-8") as fh:
            fh.write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">'
                     + "".join(urls) + "</urlset>\n")
    with open(os.path.join(OUT, "sitemap.xml"), "w", encoding="utf-8") as fh:
        fh.write('<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
                 + "".join(f"<sitemap><loc>{CANON}/sitemap-{lg}.xml</loc><lastmod>{BUILD_DATE.isoformat()}</lastmod></sitemap>" for lg in LANGS)
                 + "</sitemapindex>\n")
    private = ["inscription"] + (["compte"] if PUBLIC["accounts"] else []) + (["paiement"] if PUBLIC["onlinePayment"] else [])
    disallow = "".join(f"Disallow: {BASE}{R.page(k, lg)}\n" for k in private for lg in LANGS)
    with open(os.path.join(OUT, "robots.txt"), "w") as fh:
        if PREVIEW:  # aperçu (GitHub Pages sans domaine) : rien n'est indexé
            fh.write("User-agent: *\nDisallow: /\n")
        else:
            fh.write(f"User-agent: *\nAllow: /\nDisallow: {BASE}/api/\n{disallow}\nSitemap: {CANON}/sitemap.xml\n")
    # llms.txt : résumé du site et liens vers les pages clés pour les assistants IA (effet non garanti, docs/SEO.md)
    tx = T["fr"]
    lines = [f"# {C.SITE['name']}", "", f"> {tx.SITE['legal_name']}. Formations à la sécurité au travail à Engis (Liège), Charleroi et en entreprise, "
             "en français et sur demande dans 10 autres langues. Prix HTVA par participant ; formations en entreprise sur devis.", "",
             f"Contact : {C.SITE['phone_display']} · {C.SITE['email']} · Rue de la Paix 12, 4480 Engis", "", "## Formations"]
    lines += [f"- [{tx.FORMATIONS[f['slug']]['full']}]({CANON}{R.formation(f['slug'], 'fr')})" + (f" : {fmt_num(PRICE[f['slug']], 'fr').replace(NNBSP, ' ')} € HTVA" if PRICE.get(f['slug']) else "")
              for f in C.FORMATIONS]
    lines += ["", "## Pages utiles"] + [f"- [{P('fr', k)['title']}]({CANON}{R.page(k, 'fr')})" for k in ("agenda", "entreprises", "salles", "langues", "faq", "contact")]
    lines += ["", "## Autres langues", f"- [Nederlands]({CANON}{R.page('home', 'nl')})", f"- [English]({CANON}{R.page('home', 'en')})", ""]
    with open(os.path.join(OUT, "llms.txt"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines))
    with open(os.path.join(OUT, "site.webmanifest"), "w") as fh:
        json.dump({"name": "Centre CFS", "short_name": "Centre CFS", "lang": "fr-BE", "start_url": BASE + "/", "scope": BASE + "/", "display": "standalone",
                   "background_color": "#FFFFFF", "theme_color": "#0D4A8C",
                   "icons": [{"src": BASE + "/icon-192.png", "sizes": "192x192", "type": "image/png"}, {"src": BASE + "/icon-512.png", "sizes": "512x512", "type": "image/png"}]}, fh)
    # GitHub Pages : servir les fichiers tels quels (pas de traitement Jekyll)
    open(os.path.join(OUT, ".nojekyll"), "w").close()
    # En-têtes de sécurité et de cache (Cloudflare Workers, ressources statiques)
    headers = f"""/*
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()
  Cross-Origin-Opener-Policy: same-origin
  Content-Security-Policy: {csp()}

/assets/*
  Cache-Control: public, max-age={60 if DEV else 31536000}{"" if DEV else ", immutable"}

/assets/js/site-data.*
  Cache-Control: public, max-age={60 if DEV else 31536000}{"" if DEV else ", immutable"}

/sitemap.xml
  Cache-Control: public, max-age=3600
"""
    with open(os.path.join(OUT, "_headers"), "w") as fh:
        fh.write(headers)
    # Anciennes adresses WordPress (ex-.htaccess) → nouvelles pages
    redirects = """/blog /actualites/ 301
/blog/ /actualites/ 301
/news /actualites/ 301
/news/ /actualites/ 301
/customer-dashboard /contact/ 301
/customer-dashboard/* /contact/ 301
/checkout /agenda/ 301
/checkout/* /agenda/ 301
/cart /agenda/ 301
/cart/* /agenda/ 301
/panier /agenda/ 301
/panier/* /agenda/ 301
/mon-compte /compte/ 301
/mon-compte/* /compte/ 301
/my-account /compte/ 301
/my-account/* /compte/ 301
/wp-content/uploads/* /formations/ 301
"""
    with open(os.path.join(OUT, "_redirects"), "w") as fh:
        fh.write(redirects)


def main():
    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    os.makedirs(OUT)
    src, new = sync_gas_i18n.updated_source()
    if src != new:
        with open(sync_gas_i18n.GS, "w", encoding="utf-8") as fh:
            fh.write(new)
    KB_V.update(build_kb.build({"T": T, "C": C, "R": R, "PRICE": PRICE, "BOOKABLE": BOOKABLE, "BASE": BASE, "UI": UI, "PUBLIC": PUBLIC, "P": P,
                                "LANGS": LANGS, "OUT": OUT, "UPDATED": C.CONTENT_UPDATED, "EPI": {lg: T[lg].EPI_PREREQ for lg in LANGS}}))
    write_site_data()
    for lang in LANGS:
        build_home(lang)
        build_catalogue(lang)
        for f in C.FORMATIONS:
            build_formation(f["slug"], lang)
        for d in C.DOMAINES:
            build_domain(d["slug"], lang)
        build_agenda(lang)
        build_entreprises(lang)
        build_salles(lang)
        build_centre(lang)
        build_langues(lang)
        build_contact(lang)
        build_inscription(lang)
        build_faq(lang)
        build_articles(lang)
        build_legal(lang)
        build_plan(lang)
        build_404(lang)
        build_search(lang)
        if PUBLIC["onlinePayment"]:
            build_paiement(lang)
        if PUBLIC["accounts"]:
            build_account_pages(lang)
    write_static()
    write_worker_data()
    per_lang = {lg: sum(1 for p in PAGES if p[0] == lg) for lg in LANGS}
    print(f"{len(GENERATED)} pages générées ({', '.join(f'{lg.upper()} : {n} indexables' for lg, n in per_lang.items())}) → dist/"
          f"  · sessions des données structurées : {len(SESSIONS)} ({SESSIONS_SOURCE})")


if __name__ == "__main__":
    main()
