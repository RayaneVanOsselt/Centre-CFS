#!/usr/bin/env python3
"""Générateur du site statique Centre CFS.

Usage : python3 build.py   →   écrit le site complet dans out/site/
Le contenu se modifie dans content.py (formations, sessions, FAQ, articles).
"""
import html
import json
import os
import shutil
from datetime import date

import content as C
from icons import icon, sign
import logo as L

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, "out", "site")
SRC = os.path.join(ROOT, "src")
FONTS = os.path.join(ROOT, "node_modules", "@fontsource")
BUILD_DATE = date(2026, 11, 26)

E = lambda s: html.escape(str(s), quote=True)  # noqa: E731
MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"]
MOIS_C = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."]
JOURS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]

DOM = {d["slug"]: d for d in C.DOMAINES}
FORM = {f["slug"]: f for f in C.FORMATIONS}
for d in C.DOMAINES:
    d["formations"] = [f for f in C.FORMATIONS if f["domain"] == d["slug"]]


def d_(s):
    y, m, dd = map(int, s.split("-"))
    return date(y, m, dd)


def fr_date(s, weekday=False, year=True):
    d = d_(s)
    out = f"{d.day} {MOIS[d.month - 1]}"
    if year:
        out += f" {d.year}"
    if weekday:
        out = f"{JOURS[d.weekday()]} {out}"
    return out


def euro(n):
    return f"{n:,}".replace(",", " ") + " €"


def dsign(dslug, cls="sign", label=None):
    d = DOM[dslug]
    return sign(d["shape"], d["color"], d["icon"], cls, label)


# ───────────────────────────── Sessions
SESSIONS = []
for f in C.FORMATIONS:
    for (start, end, lieu) in f["sessions"]:
        SESSIONS.append({"id": f"{f['slug']}-{start}-{lieu}", "f": f, "start": start, "end": end, "lieu": lieu})
SESSIONS.sort(key=lambda s: (s["start"], s["f"]["title"]))


def session_label(s, short=False):
    if s["end"]:
        a, b = d_(s["start"]), d_(s["end"])
        if a.month == b.month:
            txt = f"{a.day} et {b.day} {MOIS[a.month - 1]}" if (b - a).days == 1 else f"du {a.day} au {b.day} {MOIS[a.month - 1]}"
        else:
            txt = f"du {a.day} {MOIS[a.month - 1]} au {b.day} {MOIS[b.month - 1]}"
        return txt + ("" if short else f" {b.year}")
    return fr_date(s["start"], weekday=not short, year=not short)


# ───────────────────────────── Logo inline (en-tête / pied)
def logo_inline(theme="couleur"):
    svg, w, h = L.full_lockup(theme)
    svg = svg.replace(f'width="{w*4:.0f}" height="{h*4}" ', "")
    return svg


LOGO_HEADER = logo_inline("couleur")
LOGO_FOOTER = logo_inline("negatif")


# ───────────────────────────── Gabarit commun
def nav_html(active):
    cols = []
    for d in C.DOMAINES:
        items = "".join(f'<li><a href="/formations/{f["slug"]}/">{E(f["title"])}</a></li>' for f in d["formations"])
        cols.append(f'<div class="mega-col"><h3>{dsign(d["slug"])}<a href="/domaines/{d["slug"]}/">{E(d["name"])}</a></h3><ul>{items}</ul></div>')
    links = [("agenda", "/agenda/", "Agenda"), ("entreprises", "/entreprises/", "En entreprise"),
             ("salles", "/location-salles/", "Location de salles"), ("centre", "/le-centre/", "Le centre"), ("contact", "/contact/", "Contact")]
    li = "".join(f'<li><a href="{u}"{" aria-current=\"page\"" if active == k else ""}>{t}</a></li>' for k, u, t in links)
    cur = ' aria-current="page"' if active == "formations" else ""
    return f'''<nav class="nav" id="nav" aria-label="Navigation principale">
<ul>
<li class="has-mega"><button class="nav-btn" type="button" aria-expanded="false" aria-controls="mega">Formations {icon("chevron")}</button>
<div class="mega" id="mega"><div class="wrap"><div class="mega-grid">{"".join(cols)}</div>
<div class="mega-foot"><a class="btn btn--bleu btn--petit" href="/formations/"{cur}>Tout le catalogue</a><p>Toutes nos formations sont aussi organisables dans votre entreprise, en 11 langues.</p></div></div></div></li>
{li}
</ul>
<div class="nav-mobile-cta"><a class="btn" href="/contact/?type=intra">Demander un devis</a><a class="btn btn--contour" href="tel:{C.SITE["phone"].replace(" ", "")}">{icon("phone")} {C.SITE["phone_display"]}</a></div>
</nav>'''


def annonce_html():
    a = C.SITE["closure"]
    if not a["show"] or d_(a["until"]) <= BUILD_DATE:
        return ""
    return f'''<div class="annonce" data-until="{a["until"]}" role="region" aria-label="Annonce"><div class="wrap"><p><strong>Fêtes de fin d'année :</strong> {E(a["text"])}</p><button type="button" aria-label="Masquer l'annonce">{icon("close")}</button></div></div>'''


def footer_html():
    doms = "".join(f'<li><a href="/domaines/{d["slug"]}/">{E(d["name"])}</a></li>' for d in C.DOMAINES)
    return f'''<footer class="footer on-dark">
<div class="wrap">
<div class="footer-grid">
<div><a class="logo" href="/" aria-label="Centre CFS, accueil">{LOGO_FOOTER}</a>
<p>Centre de formations pour la sécurité des travailleurs. VCA, BA4/BA5, secourisme, incendie et équipements de travail, en Wallonie.</p>
<div class="social"><a href="{C.SITE["linkedin"]}" rel="noopener" target="_blank" aria-label="Centre CFS sur LinkedIn">{icon("linkedin")}</a></div></div>
<div><h2>Nous joindre</h2>
<address>{E(C.LIEUX["engis"]["street"])}<br>{C.LIEUX["engis"]["zip"]} {C.LIEUX["engis"]["city"]}</address>
<ul><li><a href="tel:{C.SITE["phone"].replace(" ", "")}">{C.SITE["phone_display"]}</a></li><li><a href="mailto:{C.SITE["email"]}">{C.SITE["email"]}</a></li>
<li>Antenne : CEME, {E(C.LIEUX["charleroi"]["street"])}, {C.LIEUX["charleroi"]["zip"]} Charleroi</li></ul></div>
<div><h2>Domaines</h2><ul>{doms}</ul></div>
<div><h2>Le centre</h2><ul>
<li><a href="/formations/">Catalogue des formations</a></li><li><a href="/agenda/">Agenda des sessions</a></li>
<li><a href="/entreprises/">Formations en entreprise</a></li><li><a href="/location-salles/">Location de salles</a></li>
<li><a href="/le-centre/">Qui sommes-nous</a></li><li><a href="/actualites/">Actualités et guides</a></li><li><a href="/faq/">Questions fréquentes</a></li><li><a href="/contact/">Contact</a></li></ul></div>
</div>
<div class="footer-bottom"><p>© <span data-year>{BUILD_DATE.year}</span> Centre CFS. Tous droits réservés.</p>
<ul><li><a href="/mentions-legales/">Mentions légales</a></li><li><a href="/confidentialite/">Confidentialité et cookies</a></li><li><a href="/plan-du-site/">Plan du site</a></li></ul></div>
</div></footer>'''


ORG_ID = C.SITE["url"] + "/#organisation"


def org_jsonld():
    eng = C.LIEUX["engis"]
    return {
        "@context": "https://schema.org",
        "@type": ["EducationalOrganization", "LocalBusiness"],
        "@id": ORG_ID,
        "name": C.SITE["name"],
        "alternateName": "Centre de formations pour la sécurité des travailleurs",
        "url": C.SITE["url"] + "/",
        "logo": C.SITE["url"] + "/assets/img/logo-cfs.png",
        "image": C.SITE["url"] + "/assets/img/og-default.png",
        "email": C.SITE["email"],
        "telephone": C.SITE["phone"],
        "address": {"@type": "PostalAddress", "streetAddress": eng["street"], "postalCode": eng["zip"], "addressLocality": eng["city"], "addressRegion": "Liège", "addressCountry": "BE"},
        "location": [
            {"@type": "Place", "name": C.LIEUX[k]["full"], "address": {"@type": "PostalAddress", "streetAddress": C.LIEUX[k]["street"], "postalCode": C.LIEUX[k]["zip"], "addressLocality": C.LIEUX[k]["city"], "addressCountry": "BE"}}
            for k in ("engis", "charleroi")
        ],
        "areaServed": [{"@type": "AdministrativeArea", "name": "Wallonie"}, {"@type": "Country", "name": "Belgique"}],
        "knowsLanguage": ["fr", "nl", "de", "en", "it", "es", "pt", "ro", "ru", "tr", "bg"],
        "sameAs": [C.SITE["linkedin"]],
        "memberOf": {"@type": "Organization", "name": "AKT – Chambres de commerce et d'industrie de Liège-Verviers-Namur"},
    }


def crumbs_html(items):
    lis = []
    for i, (name, url) in enumerate(items):
        last = i == len(items) - 1
        lis.append(f'<li><a href="{url}">{E(name)}</a></li>' if not last else f'<li aria-current="page">{E(name)}</li>')
    return f'<nav class="crumbs" aria-label="Fil d\'Ariane"><ol>{"".join(lis)}</ol></nav>'


def crumbs_jsonld(items):
    return {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": i + 1, "name": n, "item": C.SITE["url"] + u} for i, (n, u) in enumerate(items)]}


PAGES = []  # (path, priority) pour le sitemap


def page(path, title, desc, body, active=None, jsonld=None, body_class="", og_image="/assets/img/og-default.png", robots="index, follow", progress=False, sitemap=True, prio="0.6"):
    url = C.SITE["url"] + path
    lds = [org_jsonld()] if path == "/" else []
    lds += jsonld or []
    ld_html = "".join(f'<script type="application/ld+json">{json.dumps(x, ensure_ascii=False, separators=(",", ":"))}</script>' for x in lds)
    full_title = title if ("Centre CFS" in title or len(title) > 52) else f"{title} | Centre CFS"
    doc = f'''<!doctype html>
<html lang="fr-BE">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{E(full_title)}</title>
<meta name="description" content="{E(desc)}">
<meta name="robots" content="{robots}">
<link rel="canonical" href="{url}">
<link rel="alternate" hreflang="fr-BE" href="{url}">
<meta name="theme-color" content="#0D4A8C">
<meta property="og:type" content="website">
<meta property="og:locale" content="fr_BE">
<meta property="og:site_name" content="Centre CFS">
<meta property="og:title" content="{E(title)}">
<meta property="og:description" content="{E(desc)}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{C.SITE["url"]}{og_image}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<link rel="preload" href="/assets/fonts/barlow-condensed-800.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/assets/fonts/barlow-400.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/css/main.css?v=1">
<script src="/assets/js/main.js?v=1" defer></script>
{ld_html}
</head>
<body class="{body_class}">
<a class="skip-link" href="#contenu">Aller au contenu</a>
{'<div class="progress" aria-hidden="true"></div>' if progress else ''}
{annonce_html()}
<header class="header">
<div class="wrap">
<a class="logo" href="/" aria-label="Centre CFS, accueil">{LOGO_HEADER}</a>
{nav_html(active)}
<div class="header-actions">
<a class="tel-link" href="tel:{C.SITE["phone"].replace(" ", "")}" aria-label="Appeler le {C.SITE["phone_display"]}">{icon("phone")}<span>{C.SITE["phone_display"]}</span></a>
<a class="btn btn--petit" href="/contact/?type=intra">Demander un devis</a>
<button class="burger" type="button" aria-expanded="false" aria-controls="nav" aria-label="Ouvrir le menu"><span class="i-open">{icon("menu")}</span><span class="i-close" style="display:none">{icon("close")}</span></button>
</div>
</div>
</header>
<main id="contenu">
{body}
</main>
{footer_html()}
</body>
</html>'''
    # le seul attribut style restant (bouton burger) est retiré pour une CSP stricte
    doc = doc.replace('<span class="i-close" style="display:none">', '<span class="i-close" hidden>')
    out = os.path.join(OUT, path.strip("/"), "index.html") if path != "/" else os.path.join(OUT, "index.html")
    if path.endswith(".html"):
        out = os.path.join(OUT, path.strip("/"))
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as fh:
        fh.write(doc)
    if sitemap:
        PAGES.append((path, prio))


# ───────────────────────────── Composants
def ticket(s, compact=False, item=False):
    f = s["f"]
    a = d_(s["start"])
    lieu = C.LIEUX[s["lieu"]]
    prix = f'<span class="ticket-prix">{euro(f["prix"])} <small>HTVA</small></span>' if f["prix"] else '<span class="ticket-prix">Sur devis</span>'
    heures = f'<li>{icon("clock")}{E(f["horaires"])}</li>' if f["horaires"] else ""
    attrs = f'data-session-date="{s["start"]}"'
    if item:
        attrs += f' data-item data-domain="{f["domain"]}" data-lieux="{s["lieu"]}" data-search="{E(f["title"] + " " + f["full"] + " " + lieu["name"])}"'
    dur = "" if not s["end"] else f'<li>{icon("calendar")}{E(session_label(s, short=True))}</li>'
    return f'''<article class="ticket" {attrs}>
<div class="ticket-date" aria-hidden="true"><span class="j">{a.day}</span><span class="m">{MOIS_C[a.month - 1]}</span><span class="a">{JOURS[a.weekday()][:3]}.</span></div>
<div class="ticket-body">
<h3><a href="/formations/{f["slug"]}/">{E(f["title"])}</a></h3>
<p class="sr-only">Session du {E(session_label(s))}</p>
<ul class="ticket-meta"><li>{icon("pin")}{E(lieu["full"])}</li>{dur}{heures if not compact else ""}</ul>
<div class="ticket-foot">{prix}<span class="ticket-tags"></span><a class="btn btn--petit" href="/inscription/?session={s["id"]}">Réserver<span class="sr-only"> une place, {E(f["title"])}, {E(session_label(s))}</span></a></div>
</div></article>'''


def f_card(f):
    d = DOM[f["domain"]]
    nexts = ",".join(s["start"] for s in SESSIONS if s["f"] is f)
    search = " ".join([f["title"], f["full"], d["name"], f["pitch"], f.get("kw", "")])
    prix = euro(f["prix"]) + " HTVA" if f["prix"] else "Sur devis"
    return f'''<li><article class="f-card" data-item data-domain="{f["domain"]}" data-lieux="{" ".join(f["lieux"])}" data-search="{E(search)}">
<div class="f-card-top">{dsign(f["domain"])}<span>{E(d["name"])}</span></div>
<h3><a href="/formations/{f["slug"]}/">{E(f["title"])}</a></h3>
<p>{E(f["pitch"])}</p>
<dl><dt>Durée</dt><dd>{E(f["duree"] or "Nous consulter")}</dd><dt>Tarif</dt><dd>{prix}</dd><dt>Prochaine date</dt><dd data-next="{nexts}">Sur demande</dd></dl>
</article></li>'''


def faq_html(items):
    out = []
    for q, a in items:
        out.append(f'<details><summary>{E(q)}<span class="plus" aria-hidden="true">{icon("plus")}</span></summary><div class="faq-a"><p>{E(a)}</p></div></details>')
    return f'<div class="faq">{"".join(out)}</div>'


def faq_jsonld(items):
    return {"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [
        {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in items]}


def cta_band(title="Un besoin hors catalogue ?", text="Nous construisons des formations sur mesure pour vos risques, vos équipes et vos horaires."):
    return f'''<section class="cta-band" aria-labelledby="cta-t"><div class="wrap"><div><h2 id="cta-t">{E(title)}</h2><p>{E(text)}</p></div>
<div class="btn-row"><a class="btn" href="/contact/?type=intra">Demander un devis</a><a class="btn btn--contour" href="tel:{C.SITE["phone"].replace(" ", "")}">{icon("phone")} {C.SITE["phone_display"]}</a></div></div></section>'''


def photo(img, label, alt):
    """Affiche la photo si elle existe dans src/assets/img/, sinon un emplacement graphique propre (aucune requête 404)."""
    ph = f'<span class="photo-ph" aria-hidden="true">{icon("photo")}{E(label)}</span>'
    if os.path.exists(os.path.join(SRC, "assets", "img", img)):
        return f'<figure class="photo"><img src="/assets/img/{img}" alt="{E(alt)}" loading="lazy" decoding="async" width="1200" height="900">{ph}</figure>'
    return f'<figure class="photo" role="img" aria-label="{E(alt)} (photo à venir)">{ph}</figure>'


def lieux_html(clair=False):
    out = []
    for k in ("engis", "charleroi", "intra"):
        l = C.LIEUX[k]
        addr = f'<address>{E(l["street"])}<br>{l["zip"]} {E(l["city"])}</address>' if l["street"] else ""
        link = f'<a class="lien-fleche" href="{l["maps"]}" rel="noopener" target="_blank">Itinéraire {icon("arrow")}</a>' if l["maps"] else f'<a class="lien-fleche" href="/entreprises/">Formation sur site {icon("arrow")}</a>'
        out.append(f'<div class="lieu"><h3>{E(l["full"] if k != "intra" else l["name"])}</h3>{addr}<p>{E(l["desc"])}</p>{link}</div>')
    return f'<div class="lieux{" lieux--clair" if clair else ""}">{"".join(out)}</div>'


# ───────────────────────────── Pages
def build_home():
    board = "".join(
        f'<li><a href="/domaines/{d["slug"]}/">{dsign(d["slug"])}<span>{E(d["name"])}</span></a></li>'
        for i, d in enumerate(C.DOMAINES))
    hero_next = json.dumps([{"d": s["start"], "t": s["f"]["title"], "l": C.LIEUX[s["lieu"]]["name"]} for s in SESSIONS], ensure_ascii=False)
    domains = []
    for d in C.DOMAINES:
        n = len(d["formations"])
        items = "".join(f'<li><a href="/formations/{f["slug"]}/">{E(f["title"])}</a></li>' for f in d["formations"])
        domains.append(f'''<article class="domain"><div class="domain-top">{dsign(d["slug"])}<div><h3><a href="/domaines/{d["slug"]}/">{E(d["name"])}</a></h3><p class="count">{n} formation{"s" if n > 1 else ""}</p></div></div><ul>{items}</ul></article>''')
    tickets = "".join(ticket(s) for s in SESSIONS)
    langs = "".join(f"<li>{E(x)}</li>" for x in C.LANGUES)
    partners = "".join(f"<li>{E(p)}</li>" for p in C.PARTENAIRES)
    faq5 = C.FAQ_GENERALE[:5]
    body = f'''
<section class="hero on-dark" aria-labelledby="h1">
<div class="wrap">
<div>
<h1 id="h1">Formez vos équipes à la sécurité au travail</h1>
<p class="lead">VCA, BA4/BA5, secourisme, incendie, travail en hauteur : 22 formations certifiantes données par des conseillers en prévention en activité. À Engis, à Charleroi ou directement dans votre entreprise.</p>
<div class="btn-row"><a class="btn" href="/formations/">Voir les 22 formations</a><a class="btn btn--clair" href="/contact/?type=intra">Demander un devis</a></div>
<ul class="hero-facts">
<li>{icon("shield")}Formateurs conseillers en prévention</li>
<li>{icon("globe")}11 langues de formation</li>
<li>{icon("pin")}Engis, Charleroi ou sur site</li>
</ul>
</div>
<div class="board">
<p class="board-title">Choisissez votre domaine</p>
<ul class="board-grid">{board}</ul>
<div class="board-foot"><p data-hero-next='{E(hero_next)}'>Nouvelles dates publiées chaque mois.</p><a class="lien-fleche" href="/agenda/">Agenda {icon("arrow")}</a></div>
</div>
</div>
</section>

<section class="partners" aria-label="Partenaires et reconnaissances"><div class="wrap"><p>Partenaires et reconnaissances</p><ul>{partners}</ul></div></section>

<section class="section" aria-labelledby="t-dom">
<div class="wrap">
<div class="section-head"><h2 id="t-dom">8 domaines, 22 formations certifiantes</h2><p>Chaque domaine reprend la couleur et la forme des panneaux de sécurité que vos équipes croisent tous les jours.</p></div>
<div class="domains">{"".join(domains)}</div>
<p class="mt-6"><a class="btn btn--bleu" href="/formations/">Parcourir le catalogue complet</a></p>
</div>
</section>

<section class="section section--papier" aria-labelledby="t-ag">
<div class="wrap" data-sessions data-limit="6">
<div class="section-head"><h2 id="t-ag">Prochaines sessions</h2><p>Réservez votre place en ligne en quelques minutes. Les places sont limitées.</p></div>
<div class="tickets tickets--grid">{tickets}</div>
<div class="ticket-empty" data-empty hidden><p>Les prochaines dates arrivent. Contactez-nous pour connaître le calendrier ou organiser une session dans votre entreprise.</p><a class="btn btn--bleu" href="/contact/?type=inscription">Être prévenu des prochaines dates</a></div>
<p class="mt-6"><a class="lien-fleche" href="/agenda/">Voir tout l'agenda {icon("arrow")}</a></p>
</div>
</section>

<section class="section" aria-labelledby="t-pq">
<div class="wrap">
<div class="section-head"><h2 id="t-pq">Pourquoi les entreprises nous confient leurs équipes</h2></div>
<div class="atouts">
<div class="atout"><span class="atout-ico">{icon("shield")}</span><div><h3>Des formateurs qui pratiquent la prévention</h3><p>Tous nos formateurs sont conseillers en prévention en activité, de niveau 1 ou 2, et membres d'un SIPPT. Ils forment avec nous depuis 2014.</p></div></div>
<div class="atout"><span class="atout-ico">{icon("award")}</span><div><h3>Le partenaire VCA de Technifutur depuis 2012</h3><p>Nous sommes le sous-traitant exclusif de Technifutur pour le VCA depuis 2012, ainsi que pour le secourisme des techniciens éoliens.</p></div></div>
<div class="atout"><span class="atout-ico">{icon("flash")}</span><div><h3>Réactifs, même dans l'urgence</h3><p>Un audit qui approche, un chantier qui démarre lundi : nous répondons vite et adaptons les sessions à vos contraintes.</p></div></div>
<div class="atout"><span class="atout-ico">{icon("globe")}</span><div><h3>Formations en 11 langues</h3><p>Le français par défaut, les autres langues sur demande, au forfait.</p><ul class="langues">{langs}</ul></div></div>
</div>
</div>
</section>

<section class="section section--encre on-dark" aria-labelledby="t-lieux">
<div class="wrap">
<div class="section-head"><h2 id="t-lieux">Trois façons de se former</h2><p>En session ouverte dans nos locaux, ou en intra-entreprise, sur le poste de travail.</p></div>
{lieux_html()}
</div>
</section>

<section class="section" aria-labelledby="t-salles">
<div class="wrap split">
{photo("salle-03.jpg", "Photo : salle de 25 personnes", "Salle de formation de 25 places du Centre CFS à Engis")}
<div>
<h2 id="t-salles">Une salle de formation à louer à Engis</h2>
<p class="lead">Trois salles modulables de 10, 15 et 25 personnes. À la demi-journée, à la journée ou à la semaine.</p>
<ul class="features"><li>{icon("screen")}Écran 4K dans chaque salle</li><li>{icon("wifi")}Wi-Fi</li><li>{icon("users")}10 à 25 personnes</li></ul>
<p class="mt-6"><a class="btn btn--bleu" href="/location-salles/">Découvrir les salles</a></p>
</div>
</div>
</section>

<section class="section section--papier" aria-labelledby="t-faq">
<div class="wrap-narrow">
<h2 id="t-faq">Questions fréquentes</h2>
{faq_html(faq5)}
<p class="mt-6"><a class="lien-fleche" href="/faq/">Toutes les questions {icon("arrow")}</a></p>
</div>
</section>
{cta_band()}
'''
    page("/", "Centre CFS | Formations sécurité au travail à Liège et Charleroi", "Formations VCA, BA4/BA5, secourisme, incendie et équipements de travail à Engis (Liège), Charleroi ou en entreprise. 22 formations certifiantes, 11 langues.", body, active="home", jsonld=[faq_jsonld(faq5)], prio="1.0")


def build_catalogue():
    chips = '<li><button class="chip chip--simple" type="button" data-filter="domain" data-value="" aria-pressed="true">Tous les domaines</button></li>' + "".join(
        f'<li><button class="chip" type="button" data-filter="domain" data-value="{d["slug"]}" aria-pressed="false">{dsign(d["slug"])}{E(d["name"])}</button></li>' for d in C.DOMAINES)
    lieux = '<li><button class="chip chip--simple" type="button" data-filter="lieu" data-value="" aria-pressed="true">Tous les lieux</button></li>' + "".join(
        f'<li><button class="chip chip--simple" type="button" data-filter="lieu" data-value="{k}" aria-pressed="false">{E(C.LIEUX[k]["name"])}</button></li>' for k in ("engis", "charleroi", "intra"))
    groups = []
    for d in C.DOMAINES:
        cards = "".join(f_card(f) for f in d["formations"])
        groups.append(f'<section class="domain-block" data-group aria-labelledby="g-{d["slug"]}"><header>{dsign(d["slug"])}<h2 id="g-{d["slug"]}">{E(d["long"])}</h2></header><ul class="f-list">{cards}</ul></section>')
    crumbs = [("Accueil", "/"), ("Formations", "/formations/")]
    body = f'''
<div class="page-head"><div class="wrap">{crumbs_html(crumbs)}
<h1>Catalogue des formations sécurité</h1>
<p class="lead">22 formations certifiantes en 8 domaines. Filtrez par domaine ou par lieu, ou cherchez directement une formation.</p></div></div>
<section class="section" data-filter-root>
<div class="wrap">
<div class="filters" role="search">
<div class="filters-row">
<div class="field search"><label for="q">Rechercher une formation</label><div class="search">{icon("search")}<input id="q" type="search" placeholder="VCA, BA4, extincteur, nacelle…" data-filter-q autocomplete="off"></div></div>
<div class="field"><span class="label">Dates</span><button class="chip chip--simple" type="button" data-filter="dates" aria-pressed="false">Avec dates programmées</button></div>
</div>
<div class="field"><span class="label">Domaine</span><ul class="chips">{chips}</ul></div>
<div class="field"><span class="label">Lieu</span><ul class="chips">{lieux}</ul></div>
</div>
<p class="results-info" aria-live="polite" data-results></p>
{"".join(groups)}
<div class="no-results"><h2>Aucune formation ne correspond</h2><p class="muted">Essayez un autre mot-clé, ou décrivez-nous votre besoin : nous créons aussi des formations sur mesure.</p><a class="btn btn--bleu" href="/contact/?type=intra">Décrire mon besoin</a></div>
</div>
</section>
{cta_band()}'''
    ld = {"@context": "https://schema.org", "@type": "ItemList", "itemListElement": [
        {"@type": "ListItem", "position": i + 1, "url": f'{C.SITE["url"]}/formations/{f["slug"]}/', "name": f["full"]} for i, f in enumerate(C.FORMATIONS)]}
    page("/formations/", "Catalogue des formations sécurité au travail", "Les 22 formations du Centre CFS : VCA, conseiller en prévention, incendie, secourisme, BA4/BA5, produits dangereux, amiante, ergonomie, harnais, nacelle, chariot, échafaudage, pont roulant.", body, active="formations", jsonld=[ld, crumbs_jsonld(crumbs)], prio="0.9")


def course_jsonld(f):
    d = {
        "@context": "https://schema.org", "@type": "Course",
        "name": f["full"], "description": f["intro"],
        "url": f'{C.SITE["url"]}/formations/{f["slug"]}/',
        "provider": {"@type": "EducationalOrganization", "@id": ORG_ID, "name": C.SITE["name"], "sameAs": C.SITE["url"] + "/"},
        "inLanguage": "fr", "availableLanguage": ["fr", "nl", "de", "en", "it", "es", "pt", "ro", "ru", "tr", "bg"],
    }
    if f["certificat"]:
        d["educationalCredentialAwarded"] = f["certificat"]
    if f["prix"]:
        d["offers"] = [{"@type": "Offer", "category": "Paid", "price": f["prix"], "priceCurrency": "EUR",
                        "priceSpecification": {"@type": "UnitPriceSpecification", "price": f["prix"], "priceCurrency": "EUR", "valueAddedTaxIncluded": False}}]
    inst = []
    for s in SESSIONS:
        if s["f"] is not f:
            continue
        l = C.LIEUX[s["lieu"]]
        i = {"@type": "CourseInstance", "courseMode": "Onsite", "startDate": s["start"], "endDate": s["end"] or s["start"],
             "location": {"@type": "Place", "name": l["full"], "address": {"@type": "PostalAddress", "streetAddress": l["street"], "postalCode": l["zip"], "addressLocality": l["city"], "addressCountry": "BE"}}}
        if f["slug"] == "vca-base":
            i["courseWorkload"] = "PT8H"
        inst.append(i)
    if inst:
        d["hasCourseInstance"] = inst
    return d


def build_formation(f):
    d = DOM[f["domain"]]
    crumbs = [("Accueil", "/"), ("Formations", "/formations/"), (d["name"], f'/domaines/{d["slug"]}/'), (f["title"], f'/formations/{f["slug"]}/')]
    sess = [s for s in SESSIONS if s["f"] is f]
    lieux_txt = ", ".join(C.LIEUX[k]["name"] for k in f["lieux"])
    facts = [("clock", "Durée", f["duree"] or "Nous consulter")]
    if f["horaires"]:
        facts.append(("calendar", "Horaires", f["horaires"]))
    facts.append(("pin", "Lieux", lieux_txt))
    if f["validite"]:
        facts.append(("award", "Validité", f["validite"]))
    facts.append(("globe", "Langues", "Français ; 10 autres langues sur demande"))
    dl = "".join(f'<div>{icon(i)}<dt>{E(k)}</dt><dd>{E(v)}</dd></div>' for i, k, v in facts)
    prix = f'<div>{icon("euro")}<dt>Tarif par participant</dt><dd><span class="prix">{euro(f["prix"])}</span> <small>HTVA</small>{"<br><small>" + E(f["prix_note"]) + "</small>" if f["prix_note"] else ""}</dd></div>' if f["prix"] else f'<div>{icon("euro")}<dt>Tarif</dt><dd>Sur devis, selon le nombre de participants et le lieu</dd></div>'
    if sess:
        cta1 = f'<a class="btn" href="/inscription/?formation={f["slug"]}">Réserver une place</a>'
    else:
        cta1 = f'<a class="btn" href="/contact/?type=inscription&amp;formation={f["slug"]}">Être prévenu de la prochaine date</a>'
    cta2 = f'<a class="btn btn--contour" href="/contact/?type=intra&amp;formation={f["slug"]}">Organiser dans mon entreprise</a>'

    obj = "".join(f"<li>{icon('check-circle')}<span>{E(o)}</span></li>" for o in f["objectifs"])
    multi = len(f["programme"]) > 1
    seq = all(g[0].startswith("Jour") for g in f["programme"])
    prog = []
    for i, (gt, items) in enumerate(f["programme"]):
        num = f'<span class="num" aria-hidden="true">{i + 1}</span>' if seq else ""
        lis = "".join(f"<li>{E(x)}</li>" for x in items)
        prog.append(f'<div class="prog-group"><h3>{num}{E(gt)}</h3><ul>{lis}</ul></div>')
    infos = [f'<div class="info"><h3>Pour qui ?</h3><p>{E(f["public"])}</p></div>']
    if f["prerequis"]:
        infos.append(f'<div class="info"><h3>Prérequis</h3><p>{E(f["prerequis"])}</p></div>')
    if f["examen"]:
        infos.append(f'<div class="info"><h3>Évaluation</h3><p>{E(f["examen"])}</p></div>')
    if f["certificat"]:
        infos.append(f'<div class="info"><h3>Certification</h3><p>{E(f["certificat"])}</p></div>')
    legal = f'<div class="legal">{icon("scale")}<p><strong>Cadre légal :</strong> {E(f["legal"])}</p></div>' if f["legal"] else ""
    tickets = "".join(ticket(s, compact=True) for s in sess)
    empty = f'<div class="ticket-empty" data-empty{" hidden" if sess else ""}><p>Aucune session ouverte pour le moment. Laissez-nous vos coordonnées : nous vous prévenons dès qu\'une date est fixée, ou nous organisons la formation chez vous.</p><a class="btn btn--bleu btn--petit" href="/contact/?type=inscription&amp;formation={f["slug"]}">Être prévenu de la prochaine date</a></div>'
    related = [x for x in d["formations"] if x is not f]
    if len(related) < 2:
        related += [x for x in C.FORMATIONS if x["domain"] != f["domain"] and x["domain"] in ("vca", "secours", "incendie")][: 3 - len(related)]
    rel = "".join(f_card(x) for x in related[:3])
    faq = f'<section aria-labelledby="t-faq"><h2 id="t-faq">Questions fréquentes</h2>{faq_html(f["faq"])}</section>' if f["faq"] else ""
    body = f'''
<div class="f-hero"><div class="wrap">{crumbs_html(crumbs)}
<div class="f-hero-grid">
<div>
<a class="f-domain" href="/domaines/{d["slug"]}/">{dsign(d["slug"])}{E(d["long"])}</a>
<h1>{E(f["full"])}</h1>
<p class="lead">{E(f["intro"])}</p>
<div class="hero-sessions" data-sessions><h2>Prochaines sessions</h2><div class="tickets tickets--grid">{tickets}</div>{empty}</div>
</div>
<div class="facts"><dl>{prix}{dl}</dl><div class="btn-row">{cta1}{cta2}</div></div>
</div></div></div>

<div class="section"><div class="wrap f-body">
<div class="f-main">
<section aria-labelledby="t-obj"><h2 id="t-obj">Ce que vous saurez faire</h2><ul class="checks">{obj}</ul></section>
<section aria-labelledby="t-prog"><h2 id="t-prog">Programme</h2><div class="prog">{"".join(prog)}</div></section>
<section aria-labelledby="t-info"><h2 id="t-info">Public et modalités</h2><div class="info-grid">{"".join(infos)}</div>{('<div class="mt-6">' + legal + '</div>') if legal else ''}</section>
{faq}
</div>
<aside class="f-aside" aria-label="Contact">
<div class="aside-box contact-box on-dark"><h2>Une question ?</h2><p>Groupe, langue, date urgente : parlons-en.</p>
<ul class="contact-lines"><li>{icon("phone")}<a href="tel:{C.SITE["phone"].replace(" ", "")}">{C.SITE["phone_display"]}</a></li><li>{icon("mail")}<a href="mailto:{C.SITE["email"]}?subject={E("Formation " + f["title"])}">{C.SITE["email"]}</a></li></ul>
<a class="btn btn--petit btn--bloc" href="/contact/?type=intra&amp;formation={f["slug"]}">Demander un devis</a></div>
</aside>
</div></div>

<section class="section section--papier" aria-labelledby="t-rel"><div class="wrap"><h2 id="t-rel">Formations liées</h2><ul class="related">{rel}</ul></div></section>
{cta_band("Former un groupe dans votre entreprise ?", "Cette formation peut être organisée dans vos locaux, à vos dates et dans la langue de vos équipes.")}
<div class="mobile-bar">{cta1.replace('class="btn"', 'class="btn btn--petit"')}<a class="btn btn--bleu btn--petit" href="tel:{C.SITE["phone"].replace(" ", "")}">{icon("phone")} Appeler</a></div>
'''
    ld = [course_jsonld(f), crumbs_jsonld(crumbs)]
    if f["faq"]:
        ld.append(faq_jsonld(f["faq"]))
    prix_t = f" – {f['prix']} € HTVA" if f["prix"] else ""
    lieu_t = " à Engis et Charleroi" if "charleroi" in f["lieux"] else " à Engis (Liège) ou en entreprise"
    title = f'Formation {f["title"]}{lieu_t}'
    if len(title) > 58:
        title = f'{f["title"]} : formation{" Liège, Charleroi" if "charleroi" in f["lieux"] else " à Engis (Liège)"}'
    desc = f'{f["pitch"]} {("Durée : " + f["duree"] + ". ") if f["duree"] else ""}{("Tarif : " + str(f["prix"]) + " € HTVA. ") if f["prix"] else ""}Centre CFS, formations sécurité au travail.'
    page(f'/formations/{f["slug"]}/', title, desc[:300], body, active="formations", jsonld=ld, body_class="has-mobile-bar", og_image=f'/assets/img/og/{f["slug"]}.png', progress=True, prio="0.8")


def build_domains():
    for d in C.DOMAINES:
        crumbs = [("Accueil", "/"), ("Formations", "/formations/"), (d["name"], f'/domaines/{d["slug"]}/')]
        cards = "".join(f_card(f) for f in d["formations"])
        sess = [s for s in SESSIONS if s["f"]["domain"] == d["slug"]]
        tickets = "".join(ticket(s) for s in sess)
        faqs = [qa for f in d["formations"] for qa in f["faq"]][:6]
        sess_html = f'''<section class="section section--papier" aria-labelledby="t-s"><div class="wrap" data-sessions><h2 id="t-s">Prochaines sessions</h2><div class="tickets tickets--grid">{tickets}</div><div class="ticket-empty" data-empty hidden><p>Pas de session ouverte pour le moment dans ce domaine.</p><a class="btn btn--bleu" href="/contact/?type=inscription">Être prévenu des prochaines dates</a></div></div></section>''' if sess else ""
        faq = f'<section class="section" aria-labelledby="t-f"><div class="wrap-narrow"><h2 id="t-f">Questions fréquentes</h2>{faq_html(faqs)}</div></section>' if faqs else ""
        body = f'''
<div class="page-head"><div class="wrap">{crumbs_html(crumbs)}
<div class="domain-block"><header>{dsign(d["slug"], label=d["name"])}<h1>Formations {E(d["long"][0].lower() + d["long"][1:] if d["slug"] not in ("vca",) else d["long"])}</h1></header></div>
<p class="lead">{E(d["intro"])}</p></div></div>
<section class="section"><div class="wrap"><ul class="f-list">{cards}</ul></div></section>
{sess_html}{faq}
{cta_band()}'''
        ld = [crumbs_jsonld(crumbs)] + ([faq_jsonld(faqs)] if faqs else [])
        page(f'/domaines/{d["slug"]}/', f'Formations {d["name"]} en Wallonie', f'{d["intro"]} Centre CFS à Engis, Charleroi ou en entreprise.', body, active="formations", jsonld=ld, prio="0.8")


def build_agenda():
    crumbs = [("Accueil", "/"), ("Agenda", "/agenda/")]
    doms = sorted({s["f"]["domain"] for s in SESSIONS}, key=lambda x: [d["slug"] for d in C.DOMAINES].index(x))
    chips = '<li><button class="chip chip--simple" type="button" data-filter="domain" data-value="" aria-pressed="true">Toutes</button></li>' + "".join(
        f'<li><button class="chip" type="button" data-filter="domain" data-value="{k}" aria-pressed="false">{dsign(k)}{E(DOM[k]["name"])}</button></li>' for k in doms)
    lieux = '<li><button class="chip chip--simple" type="button" data-filter="lieu" data-value="" aria-pressed="true">Tous les lieux</button></li>' + "".join(
        f'<li><button class="chip chip--simple" type="button" data-filter="lieu" data-value="{k}" aria-pressed="false">{E(C.LIEUX[k]["name"])}</button></li>' for k in ("engis", "charleroi"))
    months = {}
    for s in SESSIONS:
        k = s["start"][:7]
        months.setdefault(k, []).append(s)
    groups = []
    for k, ss in months.items():
        y, m = map(int, k.split("-"))
        groups.append(f'<section data-group class="domain-block" aria-labelledby="m-{k}"><h2 id="m-{k}">{MOIS[m - 1].capitalize()} {y}</h2><div class="tickets tickets--grid">{"".join(ticket(s, item=True) for s in ss)}</div></section>')
    body = f'''
<div class="page-head"><div class="wrap">{crumbs_html(crumbs)}
<h1>Agenda des sessions</h1>
<p class="lead">Les prochaines sessions ouvertes à Engis et à Charleroi. Aucune date ne vous convient ? Nous organisons aussi la formation dans votre entreprise.</p></div></div>
<section class="section" data-filter-root><div class="wrap" data-sessions>
<div class="filters"><div class="field"><span class="label">Domaine</span><ul class="chips">{chips}</ul></div><div class="field"><span class="label">Lieu</span><ul class="chips">{lieux}</ul></div></div>
<p class="results-info" aria-live="polite" data-results></p>
{"".join(groups)}
<div class="no-results"><h2>Aucune session ne correspond</h2><p class="muted">Demandez à être prévenu des prochaines dates, ou organisons la formation chez vous.</p><div class="btn-row" data-center><a class="btn btn--bleu" href="/contact/?type=inscription">Être prévenu</a><a class="btn btn--contour" href="/entreprises/">Formation en entreprise</a></div></div>
</div></section>
{cta_band("Pas de date qui vous convient ?", "Nous organisons la plupart des formations dans votre entreprise, aux dates qui arrangent votre production.")}'''
    body = body.replace(' style="justify-content:center"', '')
    page("/agenda/", "Agenda des formations VCA, BA4, BA5 à Engis et Charleroi", "Toutes les prochaines sessions du Centre CFS : VCA Base, VCA Cadre, BA4, BA5 à Engis et à Charleroi. Réservez votre place en ligne.", body, active="agenda", jsonld=[crumbs_jsonld(crumbs)], prio="0.9")


def build_entreprises():
    crumbs = [("Accueil", "/"), ("En entreprise", "/entreprises/")]
    lists = "".join(f'<div class="mega-col"><h3>{dsign(d["slug"])}<a href="/domaines/{d["slug"]}/">{E(d["name"])}</a></h3><ul>{"".join(f"<li><a href=\"/formations/{f['slug']}/\">{E(f['title'])}</a></li>" for f in d["formations"])}</ul></div>' for d in C.DOMAINES)
    langs = "".join(f"<li>{E(x)}</li>" for x in C.LANGUES)
    body = f'''
<div class="page-head"><div class="wrap">{crumbs_html(crumbs)}
<h1>Formations sécurité dans votre entreprise</h1>
<p class="lead">Nos formateurs se déplacent et forment vos équipes sur leur poste de travail, avec vos équipements, aux dates qui arrangent votre production.</p>
<div class="btn-row mt-6"><a class="btn" href="/contact/?type=intra">Demander un devis</a><a class="btn btn--contour" href="tel:{C.SITE["phone"].replace(" ", "")}">{icon("phone")} {C.SITE["phone_display"]}</a></div></div></div>
<section class="section" aria-labelledby="t-av"><div class="wrap">
<div class="section-head"><h2 id="t-av">Ce que change une formation sur site</h2></div>
<div class="atouts">
<div class="atout"><span class="atout-ico">{icon("building")}</span><div><h3>Sur le poste de travail</h3><p>Exercices sur vos machines, vos échafaudages, vos ponts roulants : ce que vos équipes apprennent s'applique dès le lendemain.</p></div></div>
<div class="atout"><span class="atout-ico">{icon("calendar")}</span><div><h3>À vos dates</h3><p>Nous calons les sessions sur votre planning, y compris pour les demandes urgentes.</p></div></div>
<div class="atout"><span class="atout-ico">{icon("target")}</span><div><h3>Adaptée à vos risques</h3><p>Le programme s'appuie sur vos postes, vos produits et votre analyse de risques.</p></div></div>
<div class="atout"><span class="atout-ico">{icon("globe")}</span><div><h3>Dans la langue de vos équipes</h3><p>Onze langues disponibles, sur demande et au forfait.</p><ul class="langues">{langs}</ul></div></div>
</div></div></section>
<section class="section section--papier" aria-labelledby="t-st"><div class="wrap">
<div class="section-head"><h2 id="t-st">Comment ça se passe</h2></div>
<ol class="steps">
<li><h3>Vous décrivez le besoin</h3><p>Formation, nombre de participants, langue, contraintes de date et de lieu.</p></li>
<li><h3>Nous proposons un programme</h3><p>Un contenu adapté à vos risques et un devis clair.</p></li>
<li><h3>Le formateur vient chez vous</h3><p>Un conseiller en prévention en activité anime la session sur votre site.</p></li>
<li><h3>Évaluation et certification</h3><p>Examens, évaluations pratiques et certificats selon la formation suivie.</p></li>
</ol></div></section>
<section class="section" aria-labelledby="t-all"><div class="wrap">
<div class="section-head"><h2 id="t-all">Toutes nos formations sont disponibles en intra</h2></div>
<div class="mega-grid">{lists}</div></div></section>
{cta_band("Parlons de vos équipes", "Décrivez-nous votre besoin : nous revenons vers vous rapidement avec une proposition.")}'''
    page("/entreprises/", "Formations sécurité en entreprise (intra) en Wallonie", "Formations VCA, secourisme, incendie, BA4/BA5, harnais, nacelle, chariot organisées dans votre entreprise, à vos dates et en 11 langues. Demandez un devis.", body, active="entreprises", jsonld=[crumbs_jsonld(crumbs)], prio="0.8")


def build_salles():
    crumbs = [("Accueil", "/"), ("Location de salles", "/location-salles/")]
    cards = "".join(f'<article class="salle">{photo(s["img"], "Photo : " + s["name"].lower(), s["name"] + " du Centre CFS à Engis, " + str(s["cap"]) + " places")}<h3>{s["name"]} : {s["cap"]} personnes</h3><p>Écran 4K, Wi-Fi, mobilier modulable.</p></article>' for s in C.SALLES)
    body = f'''
<div class="page-head"><div class="wrap">{crumbs_html(crumbs)}
<h1>Location de salles de formation à Engis</h1>
<p class="lead">Trois salles modulables de 10, 15 et 25 personnes pour vos formations, réunions ou séminaires. À la demi-journée, à la journée ou à la semaine.</p></div></div>
<section class="section" aria-labelledby="t-s"><div class="wrap">
<h2 id="t-s" class="sr-only">Nos salles</h2>
<div class="salles">{cards}</div>
</div></section>
<section class="section section--papier" aria-labelledby="t-eq"><div class="wrap split">
<div><h2 id="t-eq">Équipement et formules</h2>
<ul class="features"><li>{icon("screen")}Écran 4K dans chaque salle</li><li>{icon("wifi")}Accès Wi-Fi</li><li>{icon("users")}10, 15 ou 25 places</li><li>{icon("clock")}Demi-journée, journée ou semaine</li></ul>
<p class="mt-6">Tarifs sur demande, selon la salle et la durée. Dites-nous la date, le nombre de personnes et la durée : nous vérifions la disponibilité.</p>
<a class="btn" href="/contact/?type=salle">Vérifier la disponibilité</a></div>
<div class="lieux lieux--clair" style="grid-template-columns:1fr"><div class="lieu"><h3>Centre CFS, Engis</h3><address>{E(C.LIEUX["engis"]["street"])}<br>{C.LIEUX["engis"]["zip"]} Engis</address><a class="lien-fleche" href="{C.LIEUX["engis"]["maps"]}" rel="noopener" target="_blank">Itinéraire {icon("arrow")}</a></div></div>
</div></section>
{cta_band("Réservez votre salle", "Une question sur la configuration ou l'équipement ? Appelez-nous.")}'''
    body = body.replace(' style="grid-template-columns:1fr"', "")
    page("/location-salles/", "Location de salle de formation à Engis (Liège)", "Louez une salle de formation à Engis : 3 salles de 10, 15 et 25 personnes, écran 4K et Wi-Fi, à la demi-journée, à la journée ou à la semaine.", body, active="salles", jsonld=[crumbs_jsonld(crumbs)], prio="0.7")


def build_centre():
    crumbs = [("Accueil", "/"), ("Le centre", "/le-centre/")]
    partners = "".join(f"<li>{E(p)}</li>" for p in C.PARTENAIRES)
    langs = "".join(f"<li>{E(x)}</li>" for x in C.LANGUES)
    body = f'''
<div class="page-head"><div class="wrap">{crumbs_html(crumbs)}
<h1>Former aujourd'hui pour prévenir demain</h1>
<p class="lead">Le Centre CFS forme les travailleurs et les cadres à la sécurité, pour que les entreprises intègrent la prévention dans leur stratégie et non dans un classeur.</p></div></div>
<section class="section"><div class="wrap split">
<div><h2>Des formateurs de terrain</h2>
<p>Nos formateurs sont tous conseillers en prévention en activité, de niveau 1 ou 2, et membres d'un service interne de prévention et de protection au travail (SIPPT). Ils vivent au quotidien les situations dont ils parlent en formation.</p>
<p>C'est ce qui nous permet de répondre vite, d'adapter un programme à un risque précis et de former dans 11 langues.</p>
<ul class="langues">{langs}</ul></div>
<div><h2>Quelques repères</h2>
<ol class="steps" style="grid-template-columns:1fr">
<li><h3>2012</h3><p>Le Centre CFS devient le sous-traitant exclusif de Technifutur pour le VCA, puis pour le secourisme des techniciens éoliens.</p></li>
<li><h3>2014</h3><p>Début de la collaboration avec notre équipe actuelle de formateurs.</p></li>
<li><h3>Aujourd'hui</h3><p>22 formations en 8 domaines, un centre à Engis, une antenne à Charleroi et l'adhésion à l'AKT, le réseau des chambres de commerce de Liège, Verviers et Namur.</p></li>
</ol></div>
</div></section>
<section class="section section--papier" aria-labelledby="t-p"><div class="wrap"><div class="section-head"><h2 id="t-p">Partenaires et reconnaissances</h2></div><div class="partners" style="padding:0;border:0"><ul>{partners}</ul></div></div></section>
<section class="section section--encre on-dark" aria-labelledby="t-l"><div class="wrap"><div class="section-head"><h2 id="t-l">Où nous trouver</h2></div>{lieux_html()}</div></section>
{cta_band()}'''
    body = body.replace(' style="grid-template-columns:1fr"', ' class="steps steps--v"').replace('<ol class="steps" class="steps steps--v">', '<ol class="steps steps--v">').replace(' style="padding:0;border:0"', "")
    page("/le-centre/", "Le Centre CFS : formateurs conseillers en prévention", "Le Centre CFS forme à la sécurité au travail depuis 2012 : formateurs conseillers en prévention en activité, partenaire VCA de Technifutur, 11 langues, Engis et Charleroi.", body, active="centre", jsonld=[crumbs_jsonld(crumbs)], prio="0.6")


def options_formations(selected=None, with_price=False):
    out = ['<option value="">Choisir une formation</option>']
    for d in C.DOMAINES:
        out.append(f'<optgroup label="{E(d["name"])}">')
        for f in d["formations"]:
            p = f' data-prix="{f["prix"]}"' if (with_price and f["prix"]) else ""
            out.append(f'<option value="{f["slug"]}"{p}>{E(f["title"])}</option>')
        out.append("</optgroup>")
    return "".join(out)


def contact_side():
    return f'''<aside class="stack" aria-label="Coordonnées">
<div class="aside-box contact-box on-dark"><h2>Nous joindre</h2>
<ul class="contact-lines"><li>{icon("phone")}<a href="tel:{C.SITE["phone"].replace(" ", "")}">{C.SITE["phone_display"]}</a></li><li>{icon("mail")}<a href="mailto:{C.SITE["email"]}">{C.SITE["email"]}</a></li><li>{icon("linkedin")}<a href="{C.SITE["linkedin"]}" rel="noopener" target="_blank">LinkedIn</a></li></ul>
<p>Nous répondons rapidement, y compris aux demandes urgentes.</p></div>
<div class="aside-box"><h2>Nos lieux</h2>
<p><strong>Engis</strong><br>{E(C.LIEUX["engis"]["street"])}, {C.LIEUX["engis"]["zip"]} Engis<br><a href="{C.LIEUX["engis"]["maps"]}" rel="noopener" target="_blank">Itinéraire</a></p>
<p><strong>Charleroi (CEME)</strong><br>{E(C.LIEUX["charleroi"]["street"])}, {C.LIEUX["charleroi"]["zip"]} Charleroi<br><a href="{C.LIEUX["charleroi"]["maps"]}" rel="noopener" target="_blank">Itinéraire</a></p></div>
</aside>'''


def consent_field():
    return '''<label class="check field" for="consent"><input type="checkbox" id="consent" name="consent" value="1" required><span>J'accepte que le Centre CFS utilise ces données pour traiter ma demande, comme décrit dans la <a href="/confidentialite/">politique de confidentialité</a>. <span class="req">*</span></span><span class="error">Merci de cocher cette case pour envoyer votre demande.</span></label>'''


def hp_fields(kind):
    return f'<input type="hidden" name="form" value="{kind}"><input type="hidden" name="_t" value=""><div class="hp" aria-hidden="true"><label for="website">Ne pas remplir</label><input type="text" id="website" name="website" tabindex="-1" autocomplete="off"></div>'


def build_contact():
    crumbs = [("Accueil", "/"), ("Contact", "/contact/")]
    body = f'''
<div class="page-head"><div class="wrap">{crumbs_html(crumbs)}<h1>Contact et demande de devis</h1><p class="lead">Une inscription, une formation dans votre entreprise, une salle à louer : écrivez-nous, nous répondons rapidement.</p></div></div>
<section class="section"><div class="wrap form-layout">
<div>
<div class="form-status" data-status tabindex="-1" role="status"></div>
<form class="form" action="/api/contact.php" method="post" data-form novalidate data-ok-title="Message envoyé" data-ok-text="Merci. Nous avons bien reçu votre demande et nous revenons vers vous rapidement.">
{hp_fields("contact")}
<fieldset><legend>Votre demande</legend>
<div class="row-2">
<div class="field"><label for="type">Ma demande concerne <span class="req">*</span></label><select id="type" name="type" required><option value="">Choisir</option><option value="inscription">Une inscription</option><option value="intra">Une formation dans mon entreprise (devis)</option><option value="salle">La location d'une salle</option><option value="autre">Autre chose</option></select><span class="error">Choisissez l'objet de votre demande.</span></div>
<div class="field"><label for="formation">Formation concernée</label><select id="formation" name="formation">{options_formations()}</select></div>
</div>
<div class="field"><label for="message">Message <span class="req">*</span></label><textarea id="message" name="message" required placeholder="Nombre de participants, langue, dates souhaitées, lieu…"></textarea><span class="error">Écrivez votre message.</span></div>
</fieldset>
<fieldset><legend>Vos coordonnées</legend>
<div class="row-2">
<div class="field"><label for="prenom">Prénom <span class="req">*</span></label><input id="prenom" name="prenom" type="text" autocomplete="given-name" required><span class="error">Indiquez votre prénom.</span></div>
<div class="field"><label for="nom">Nom <span class="req">*</span></label><input id="nom" name="nom" type="text" autocomplete="family-name" required><span class="error">Indiquez votre nom.</span></div>
</div>
<div class="row-2">
<div class="field"><label for="email">E-mail <span class="req">*</span></label><input id="email" name="email" type="email" autocomplete="email" required><span class="error">Indiquez une adresse e-mail valide, par exemple nom@entreprise.be.</span></div>
<div class="field"><label for="tel">Téléphone</label><input id="tel" name="tel" type="tel" autocomplete="tel"></div>
</div>
<div class="field"><label for="entreprise">Entreprise</label><input id="entreprise" name="entreprise" type="text" autocomplete="organization"></div>
</fieldset>
{consent_field()}
<div><button class="btn" type="submit">Envoyer ma demande</button></div>
</form>
</div>
{contact_side()}
</div></section>'''
    page("/contact/", "Contact et devis formation sécurité", "Contactez le Centre CFS à Engis : inscription, devis pour une formation en entreprise ou location de salle. 0475 34 02 89, info@centrecfs.be.", body, active="contact", jsonld=[crumbs_jsonld(crumbs)], prio="0.7")


def build_inscription():
    crumbs = [("Accueil", "/"), ("Agenda", "/agenda/"), ("Inscription", "/inscription/")]
    sopts = ['<option value="">Prochaine date disponible</option>']
    for s in SESSIONS:
        sopts.append(f'<option value="{s["id"]}" data-formation="{s["f"]["slug"]}" data-date="{s["start"]}">{E(s["f"]["title"])} : {E(session_label(s))}, {E(C.LIEUX[s["lieu"]]["name"])}</option>')
    langs = "".join(f'<option value="{E(x)}">{E(x.capitalize())}</option>' for x in C.LANGUES)
    body = f'''
<div class="page-head"><div class="wrap">{crumbs_html(crumbs)}<h1>Réserver une place</h1><p class="lead">Remplissez ce formulaire : nous confirmons votre inscription par e-mail.</p></div></div>
<section class="section"><div class="wrap form-layout">
<div>
<div class="form-status" data-status tabindex="-1" role="status"></div>
<form class="form" action="/api/contact.php" method="post" data-form novalidate data-ok-title="Demande d'inscription envoyée" data-ok-text="Merci. Nous vérifions les places disponibles et vous confirmons l'inscription par e-mail.">
{hp_fields("inscription")}
<fieldset><legend>Formation</legend>
<div class="field"><label for="formation">Formation <span class="req">*</span></label><select id="formation" name="formation" required>{options_formations(with_price=True)}</select><span class="error">Choisissez une formation.</span></div>
<div class="field"><label for="session">Session</label><select id="session" name="session">{"".join(sopts)}</select><span class="hint" data-session-hint aria-live="polite"></span></div>
<div class="field"><label for="langue">Langue de formation</label><select id="langue" name="langue">{langs}</select><span class="hint">Les langues autres que le français sont proposées sur demande, au forfait.</span></div>
</fieldset>
<fieldset><legend>Participants</legend>
<div data-participants class="stack"></div>
<div><button class="btn btn--contour btn--petit" type="button" data-add-participant>{icon("plus")} Ajouter un participant</button></div>
</fieldset>
<fieldset><legend>Entreprise et facturation</legend>
<div class="row-2">
<div class="field"><label for="entreprise">Entreprise <span class="req">*</span></label><input id="entreprise" name="entreprise" type="text" autocomplete="organization" required><span class="error">Indiquez le nom de l'entreprise.</span></div>
<div class="field"><label for="tva">Numéro de TVA</label><input id="tva" name="tva" type="text" placeholder="BE0123456789"></div>
</div>
<div class="field"><label for="adresse">Adresse de facturation <span class="req">*</span></label><input id="adresse" name="adresse" type="text" autocomplete="street-address" required><span class="error">Indiquez l'adresse de facturation.</span></div>
<div class="row-2">
<div class="field"><label for="contact">Personne de contact <span class="req">*</span></label><input id="contact" name="contact" type="text" autocomplete="name" required><span class="error">Indiquez une personne de contact.</span></div>
<div class="field"><label for="tel">Téléphone <span class="req">*</span></label><input id="tel" name="tel" type="tel" autocomplete="tel" required><span class="error">Indiquez un numéro de téléphone valide.</span></div>
</div>
<div class="field"><label for="email">E-mail <span class="req">*</span></label><input id="email" name="email" type="email" autocomplete="email" required><span class="error">Indiquez une adresse e-mail valide.</span></div>
<div class="field"><label for="message">Remarque</label><textarea id="message" name="message" placeholder="Bon de commande, contrainte particulière…"></textarea></div>
</fieldset>
{consent_field()}
<div><button class="btn" type="submit">Envoyer la demande d'inscription</button></div>
</form>
<template id="tpl-participant"><div class="participant"><h4>Participant</h4><button class="btn btn--contour btn--petit remove" type="button">Retirer</button>
<div class="row-2"><div class="field"><label data-for="p-prenom">Prénom <span class="req">*</span></label><input data-name="p-prenom" type="text" required><span class="error">Indiquez le prénom.</span></div>
<div class="field"><label data-for="p-nom">Nom <span class="req">*</span></label><input data-name="p-nom" type="text" required><span class="error">Indiquez le nom.</span></div></div>
<div class="field"><label data-for="p-email">E-mail du participant</label><input data-name="p-email" type="email"></div></div></template>
</div>
<aside class="stack" aria-label="Récapitulatif">
<div class="recap" data-recap><h2>Récapitulatif</h2>
<dl class="recap-dl"><div><dt>Formation</dt><dd data-r-formation>À choisir</dd></div><div><dt>Session</dt><dd data-r-session>Prochaine date disponible</dd></div><div><dt>Participants</dt><dd data-r-n>1</dd></div><div><dt>Total estimé</dt><dd data-r-total>Sur devis</dd></div></dl>
<p class="muted" style="font-size:.9rem">Tarifs hors TVA. L'inscription est définitive après notre confirmation par e-mail.</p></div>
{contact_side()}
</aside>
</div></section>'''
    body = body.replace(' style="font-size:.9rem"', ' class="small"').replace('<p class="muted" class="small">', '<p class="muted small">')
    page("/inscription/", "Inscription à une formation", "Réservez une place à une formation du Centre CFS : VCA Base, VCA Cadre, BA4, BA5 et toutes nos formations sécurité.", body, active="agenda", jsonld=[crumbs_jsonld(crumbs)], robots="noindex, follow", sitemap=False)


def build_faq():
    crumbs = [("Accueil", "/"), ("Questions fréquentes", "/faq/")]
    all_f = [(f, qa) for f in C.FORMATIONS for qa in f["faq"]]
    body = f'''
<div class="page-head"><div class="wrap">{crumbs_html(crumbs)}<h1>Questions fréquentes</h1><p class="lead">Lieux, langues, certificats, financement : les réponses aux questions qu'on nous pose le plus.</p></div></div>
<section class="section"><div class="wrap-narrow"><h2>Fonctionnement du centre</h2>{faq_html(C.FAQ_GENERALE)}</div></section>
<section class="section section--papier"><div class="wrap-narrow"><h2>Questions sur les formations</h2>{faq_html([qa for _, qa in all_f])}</div></section>
{cta_band("Vous ne trouvez pas votre réponse ?", "Appelez-nous ou écrivez-nous : nous répondons rapidement.")}'''
    page("/faq/", "Questions fréquentes sur nos formations sécurité", "Lieux, langues, validité du VCA, chèques-formation, prérequis : les réponses aux questions fréquentes sur les formations du Centre CFS.", body, jsonld=[faq_jsonld(C.FAQ_GENERALE), crumbs_jsonld(crumbs)], prio="0.6")


def build_articles():
    crumbs = [("Accueil", "/"), ("Actualités et guides", "/actualites/")]
    cards = []
    for a in C.ARTICLES:
        url = f'/{a["slug"]}/' if a.get("legacy_url") else f'/actualites/{a["slug"]}/'
        a["url"] = url
        t = f'<time datetime="{a["date"]}">{fr_date(a["date"])}</time>' if a["date"] else "<span class=\"tag\">Actualité</span>"
        cards.append(f'<li><article class="post">{t}<h2><a href="{url}">{E(a["title"])}</a></h2><p>{E(a["desc"])}</p></article></li>')
    body = f'''
<div class="page-head"><div class="wrap">{crumbs_html(crumbs)}<h1>Actualités et guides</h1><p class="lead">Nos guides pratiques sur la sécurité au travail et les nouvelles du centre.</p></div></div>
<section class="section"><div class="wrap"><ul class="post-list">{"".join(cards)}</ul></div></section>'''
    page("/actualites/", "Actualités et guides sécurité au travail", "Guides pratiques du Centre CFS : VCA Base ou Cadre, BA4 ou BA5, obligations des secouristes d'entreprise, et actualités du centre.", body, jsonld=[crumbs_jsonld(crumbs)], prio="0.6")
    for a in C.ARTICLES:
        cr = crumbs + [(a["title"], a["url"])]
        parts = []
        for kind, val in a["body"]:
            if kind == "p":
                parts.append(f"<p>{E(val)}</p>")
            elif kind == "h2":
                parts.append(f"<h2>{E(val)}</h2>")
            elif kind == "ul":
                parts.append("<ul>" + "".join(f"<li>{E(x)}</li>" for x in val) + "</ul>")
        rel = "".join(f_card(FORM[s]) for s in a["related"])
        rel_html = f'<section class="section section--papier"><div class="wrap"><h2>Les formations dont parle cet article</h2><ul class="related">{rel}</ul></div></section>' if rel else ""
        t = f'<p class="muted"><time datetime="{a["date"]}">Publié le {fr_date(a["date"])}</time> par l\'équipe du Centre CFS</p>' if a["date"] else ""
        body = f'''
<div class="page-head"><div class="wrap-narrow">{crumbs_html(cr)}<h1>{E(a["title"])}</h1>{t}</div></div>
<article class="section"><div class="wrap-narrow prose">{"".join(parts)}</div></article>
{rel_html}{cta_band()}'''
        ld = {"@context": "https://schema.org", "@type": "Article", "headline": a["title"], "description": a["desc"],
              "author": {"@type": "Organization", "@id": ORG_ID, "name": "Centre CFS"}, "publisher": {"@id": ORG_ID},
              "mainEntityOfPage": C.SITE["url"] + a["url"], "inLanguage": "fr-BE", "image": C.SITE["url"] + "/assets/img/og-default.png"}
        if a["date"]:
            ld["datePublished"] = a["date"]
        page(a["url"], a["title"], a["desc"], body, jsonld=[ld, crumbs_jsonld(cr)], progress=True, prio="0.5")


def build_legal():
    bce = C.SITE["bce"] or "[à compléter]"
    crumbs = [("Accueil", "/"), ("Mentions légales", "/mentions-legales/")]
    body = f'''
<div class="page-head"><div class="wrap-narrow">{crumbs_html(crumbs)}<h1>Mentions légales</h1></div></div>
<section class="section"><div class="wrap-narrow prose">
<h2>Éditeur du site</h2>
<p>{E(C.SITE["legal_name"])}<br>{E(C.LIEUX["engis"]["street"])}, {C.LIEUX["engis"]["zip"]} Engis, Belgique<br>Numéro d'entreprise (BCE) : {bce}<br>Téléphone : {C.SITE["phone_display"]}<br>E-mail : <a href="mailto:{C.SITE["email"]}">{C.SITE["email"]}</a></p>
<h2>Hébergement</h2>
<p>Hébergeur : [à compléter : nom, adresse, pays d'hébergement].</p>
<h2>Propriété intellectuelle</h2>
<p>Les textes, logos, pictogrammes et visuels de ce site appartiennent au Centre CFS, sauf mention contraire. Toute reproduction sans autorisation écrite est interdite. Les noms des partenaires cités appartiennent à leurs titulaires respectifs.</p>
<h2>Responsabilité</h2>
<p>Les informations publiées (programmes, tarifs, dates) sont données à titre indicatif et peuvent évoluer. Seule la confirmation écrite d'inscription du Centre CFS fait foi. Les tarifs sont indiqués hors TVA.</p>
<h2>Droit applicable</h2>
<p>Ce site est soumis au droit belge.</p>
</div></section>'''
    page("/mentions-legales/", "Mentions légales", "Mentions légales du site du Centre CFS : éditeur, hébergement, propriété intellectuelle.", body, jsonld=[crumbs_jsonld(crumbs)], prio="0.2")
    crumbs = [("Accueil", "/"), ("Confidentialité et cookies", "/confidentialite/")]
    body = f'''
<div class="page-head"><div class="wrap-narrow">{crumbs_html(crumbs)}<h1>Confidentialité et cookies</h1><p class="lead">Comment le Centre CFS traite vos données personnelles, conformément au RGPD.</p></div></div>
<section class="section"><div class="wrap-narrow prose">
<h2>Responsable du traitement</h2>
<p>{E(C.SITE["legal_name"])}, {E(C.LIEUX["engis"]["street"])}, {C.LIEUX["engis"]["zip"]} Engis. Contact : <a href="mailto:{C.SITE["email"]}">{C.SITE["email"]}</a>.</p>
<h2>Données collectées</h2>
<p>Uniquement les données que vous nous transmettez via les formulaires de contact et d'inscription : nom, prénom, e-mail, téléphone, entreprise, adresse de facturation, noms des participants et contenu de votre message.</p>
<h2>Finalités et base légale</h2>
<ul><li>Répondre à vos demandes et établir des devis (mesures précontractuelles).</li><li>Gérer les inscriptions, les examens, les certificats et la facturation (exécution du contrat et obligations légales).</li></ul>
<h2>Durée de conservation</h2>
<p>[À valider par le Centre CFS : par exemple 3 ans après le dernier contact pour les demandes sans suite, et la durée légale de conservation comptable pour les données de facturation.]</p>
<h2>Destinataires</h2>
<p>Vos données ne sont ni vendues ni cédées. Elles peuvent être transmises aux organismes de certification lorsque la formation le nécessite (par exemple l'examen VCA).</p>
<h2>Vos droits</h2>
<p>Vous pouvez demander l'accès, la rectification, l'effacement ou la limitation de vos données, et vous opposer à leur traitement, en écrivant à <a href="mailto:{C.SITE["email"]}">{C.SITE["email"]}</a>. Vous pouvez aussi introduire une plainte auprès de l'Autorité de protection des données (autoriteprotectiondonnees.be).</p>
<h2>Cookies</h2>
<p>Ce site n'utilise aucun cookie publicitaire ni de mesure d'audience. Il mémorise seulement, dans votre navigateur, le fait que vous avez fermé le bandeau d'annonce. Aucun bandeau de consentement n'est donc nécessaire. Les polices sont hébergées sur notre serveur : aucune donnée n'est envoyée à Google.</p>
</div></section>'''
    page("/confidentialite/", "Politique de confidentialité et cookies", "Politique de confidentialité du Centre CFS : données collectées, finalités, durée de conservation, droits RGPD et cookies.", body, jsonld=[crumbs_jsonld(crumbs)], prio="0.2")


def build_plan():
    crumbs = [("Accueil", "/"), ("Plan du site", "/plan-du-site/")]
    doms = "".join(f'<li><a href="/domaines/{d["slug"]}/">{E(d["long"])}</a><ul>{"".join(f"<li><a href=\"/formations/{f['slug']}/\">{E(f['full'])}</a></li>" for f in d["formations"])}</ul></li>' for d in C.DOMAINES)
    body = f'''<div class="page-head"><div class="wrap-narrow">{crumbs_html(crumbs)}<h1>Plan du site</h1></div></div>
<section class="section"><div class="wrap-narrow prose"><ul>
<li><a href="/">Accueil</a></li><li><a href="/formations/">Catalogue des formations</a><ul>{doms}</ul></li>
<li><a href="/agenda/">Agenda</a></li><li><a href="/entreprises/">Formations en entreprise</a></li><li><a href="/location-salles/">Location de salles</a></li>
<li><a href="/le-centre/">Le centre</a></li><li><a href="/actualites/">Actualités et guides</a><ul>{"".join(f'<li><a href="{a["url"]}">{E(a["title"])}</a></li>' for a in C.ARTICLES)}</ul></li>
<li><a href="/faq/">Questions fréquentes</a></li><li><a href="/contact/">Contact</a></li><li><a href="/mentions-legales/">Mentions légales</a></li><li><a href="/confidentialite/">Confidentialité</a></li></ul></div></section>'''
    page("/plan-du-site/", "Plan du site", "Toutes les pages du site du Centre CFS.", body, jsonld=[crumbs_jsonld(crumbs)], prio="0.2")


def build_404():
    body = f'''<section class="section err-404"><div class="wrap-narrow center">
<div style="display:flex;justify-content:center">{sign("triangle", "jaune", "flacon", "sign", "Panneau d'avertissement")}</div>
<h1>Cette page n'existe pas (ou plus)</h1>
<p class="lead" style="margin-inline:auto">Notre site a été entièrement refait : l'adresse a peut-être changé. Les liens ci-dessous vous remettent sur la bonne voie.</p>
<div class="btn-row" style="justify-content:center"><a class="btn" href="/formations/">Voir les formations</a><a class="btn btn--contour" href="/agenda/">Agenda</a><a class="btn btn--contour" href="/contact/">Contact</a></div>
</div></section>'''
    body = body.replace(' style="display:flex;justify-content:center"', ' class="center-flex"').replace(' style="margin-inline:auto"', "").replace(' style="justify-content:center"', ' data-center')
    page("/404.html", "Page introuvable", "Cette page n'existe pas.", body, robots="noindex", sitemap=False)


def write_static():
    # Assets
    # CSS et JS minifiés en production (les sources lisibles restent dans src/)
    try:
        import rcssmin, rjsmin
    except ImportError:
        rcssmin = rjsmin = None
    for sub in ("css", "js"):
        dst = os.path.join(OUT, "assets", sub)
        os.makedirs(dst, exist_ok=True)
        for fn in os.listdir(os.path.join(SRC, "assets", sub)):
            code = open(os.path.join(SRC, "assets", sub, fn), encoding="utf-8").read()
            if sub == "css" and rcssmin:
                code = rcssmin.cssmin(code)
            if sub == "js" and rjsmin:
                code = rjsmin.jsmin(code)
            with open(os.path.join(dst, fn), "w", encoding="utf-8") as fh:
                fh.write(code)
    fdst = os.path.join(OUT, "assets", "fonts")
    os.makedirs(fdst, exist_ok=True)
    for fam, w in [("barlow", 400), ("barlow", 500), ("barlow", 600), ("barlow", 700), ("barlow-condensed", 700), ("barlow-condensed", 800)]:
        shutil.copy(os.path.join(FONTS, fam, "files", f"{fam}-latin-{w}-normal.woff2"), os.path.join(fdst, f"{fam}-{w}.woff2"))
    os.makedirs(os.path.join(OUT, "assets", "img", "og"), exist_ok=True)
    os.makedirs(os.path.join(SRC, "assets", "img"), exist_ok=True)
    for fn in os.listdir(os.path.join(SRC, "assets", "img")):
        shutil.copy(os.path.join(SRC, "assets", "img", fn), os.path.join(OUT, "assets", "img", fn))
    with open(os.path.join(OUT, "favicon.svg"), "w") as fh:
        fh.write(L.favicon())
    for name in ("cfs-logo-signature-couleur.svg", "cfs-logo-signature-negatif.svg", "cfs-symbole-couleur.svg"):
        shutil.copy(os.path.join(ROOT, "out", "logo", name), os.path.join(OUT, "assets", "img", name))
    # Sitemap / robots / manifest
    urls = "".join(f"<url><loc>{C.SITE['url']}{p}</loc><lastmod>{BUILD_DATE.isoformat()}</lastmod><priority>{pr}</priority></url>" for p, pr in PAGES)
    with open(os.path.join(OUT, "sitemap.xml"), "w", encoding="utf-8") as fh:
        fh.write(f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{urls}</urlset>\n')
    with open(os.path.join(OUT, "robots.txt"), "w") as fh:
        fh.write(f"User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /inscription/\n\nSitemap: {C.SITE['url']}/sitemap.xml\n")
    with open(os.path.join(OUT, "site.webmanifest"), "w") as fh:
        json.dump({"name": "Centre CFS", "short_name": "Centre CFS", "lang": "fr-BE", "start_url": "/", "display": "standalone",
                   "background_color": "#FFFFFF", "theme_color": "#0D4A8C",
                   "icons": [{"src": "/icon-192.png", "sizes": "192x192", "type": "image/png"}, {"src": "/icon-512.png", "sizes": "512x512", "type": "image/png"}]}, fh)
    # Backend formulaire + config serveur
    shutil.copytree(os.path.join(SRC, "api"), os.path.join(OUT, "api"), dirs_exist_ok=True)
    # Référentiel lu par le formulaire PHP : valide les choix et affiche des noms lisibles dans l'e-mail
    def php_str(x):
        return "'" + str(x).replace("\\", "\\\\").replace("'", "\\'") + "'"
    forms_php = ",\n".join(f"    {php_str(f['slug'])} => {php_str(f['full'])}" for f in C.FORMATIONS)
    sess_php = ",\n".join(f"    {php_str(x['id'])} => {php_str(x['f']['title'] + ' : ' + session_label(x) + ', ' + C.LIEUX[x['lieu']]['full'])}" for x in SESSIONS)
    with open(os.path.join(OUT, "api", "catalogue.php"), "w", encoding="utf-8") as fh:
        fh.write("<?php\n// Généré par build.py : ne pas modifier à la main.\nif (basename($_SERVER['SCRIPT_FILENAME'] ?? '') === basename(__FILE__)) { http_response_code(403); exit; }\n"
                 f"return [\n  'formations' => [\n{forms_php}\n  ],\n  'sessions' => [\n{sess_php}\n  ],\n];\n")
    shutil.copy(os.path.join(SRC, "htaccess.txt"), os.path.join(OUT, ".htaccess"))


if __name__ == "__main__":
    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    os.makedirs(OUT)
    build_home()
    build_catalogue()
    for f in C.FORMATIONS:
        build_formation(f)
    build_domains()
    build_agenda()
    build_entreprises()
    build_salles()
    build_centre()
    build_contact()
    build_inscription()
    build_faq()
    build_articles()
    build_legal()
    build_plan()
    build_404()
    write_static()
    print(f"{len(PAGES)} pages indexables + inscription + 404 → {OUT}")
