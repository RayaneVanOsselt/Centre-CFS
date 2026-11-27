#!/usr/bin/env python3
"""Contrôles SEO du site généré (dist/), mission section 10.12. Code de sortie 1 en cas d'ERREUR.

    python3 site/build.py && python3 site/tools/check_seo.py

Erreurs : titre ou description absents, en double ou trop longs (60 / 155 caractères), H1 absent ou multiple,
`lang` absent, canonique absente ou hors domaine, hreflang non réciproques ou sans x-default, JSON-LD invalide,
CourseInstance sans lieu ni date, prix des données structurées absent de la page, page privée indexable,
sitemap différent des pages indexables, page orpheline, image sans attribut alt, redirection de l'ancien site
manquante, date de session écrite en dur dans le HTML.
Avertissements : hiérarchie de titres avec saut (h2 → h4), image de partage absente.
"""
import html
import json
import os
import re
import sys
from html.parser import HTMLParser
from urllib.parse import urlparse

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DIST = os.path.join(ROOT, "dist")
sys.path.insert(0, os.path.join(ROOT, "site"))
from content import routes as R  # noqa: E402

CANON = "https://centrecfs.be"
TITLE_MAX, DESC_MAX = 60, 155
PRIVATE = ("inscription", "compte", "connexion", "creer", "motdepasse", "confirmation", "paiement", "admin")
OLD_URLS = ["/blog", "/news", "/checkout", "/cart", "/panier", "/mon-compte", "/my-account", "/customer-dashboard"]


class Page(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.title, self.desc, self.robots, self.canonical, self.lang = None, None, "", None, None
        self.h = []
        self.alts = {}
        self.ld = []
        self.links = []
        self.imgs_no_alt = []
        self.og_image = None
        self._in_title = self._in_ld = self._in_script = False
        self._buf = []
        self.text = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "html":
            self.lang = a.get("lang")
        elif tag == "title" and self.title is None:  # le <title> du document, pas celui d'un SVG
            self._in_title, self._buf = True, []
        elif tag == "meta":
            if a.get("name") == "description":
                self.desc = a.get("content")
            elif a.get("name") == "robots":
                self.robots = a.get("content") or ""
            elif a.get("property") == "og:image":
                self.og_image = a.get("content")
        elif tag == "link":
            if a.get("rel") == "canonical":
                self.canonical = a.get("href")
            elif a.get("rel") == "alternate" and a.get("hreflang"):
                self.alts[a["hreflang"]] = a.get("href")
        elif tag in ("h1", "h2", "h3", "h4", "h5", "h6"):
            self.h.append(int(tag[1]))
        elif tag == "script":
            self._in_script = True
            if a.get("type") == "application/ld+json":
                self._in_ld, self._buf = True, []
        elif tag == "a" and a.get("href"):
            self.links.append(a["href"])
        elif tag == "img" and "alt" not in a:
            self.imgs_no_alt.append(a.get("src"))

    def handle_endtag(self, tag):
        if tag == "title" and self._in_title:
            self.title, self._in_title = "".join(self._buf).strip(), False
        elif tag == "script":
            if self._in_ld:
                self.ld.append("".join(self._buf))
            self._in_ld = self._in_script = False

    def handle_data(self, data):
        if self._in_title or self._in_ld:
            self._buf.append(data)
        elif not self._in_script:
            self.text.append(data)


def url_of(path):
    """dist/…/index.html → « /…/ »."""
    rel = os.path.relpath(path, DIST).replace(os.sep, "/")
    return "/" + (rel[: -len("index.html")] if rel.endswith("index.html") else rel)


def load():
    pages = {}
    for root, _, files in os.walk(DIST):
        for f in files:
            if f.endswith(".html"):
                full = os.path.join(root, f)
                p = Page()
                p.feed(open(full, encoding="utf-8").read())
                pages[url_of(full)] = p
    return pages


def session_dates():
    """Dates des sessions connues (fichier de secours) : elles ne doivent jamais être écrites dans le HTML visible."""
    data = os.path.join(ROOT, "site", "src", "assets", "js", "sessions-data.js")
    out = set()
    try:
        text = open(data, encoding="utf-8").read()
    except OSError:
        return out
    for y, m, j in set(re.findall(r'"date"\s*:\s*"(\d{4})-(\d{2})-(\d{2})"', text)):
        out.update({f"{j}/{m}/{y}", f"{int(j)}/{int(m)}/{y}", f"{j}.{m}.{y}"})
    return out


def main():
    if not os.path.isdir(DIST):
        sys.exit("dist/ absent : lancez d'abord python3 site/build.py")
    pages = load()
    errors, warnings = [], []
    err = errors.append
    preview = all("noindex" in p.robots for p in pages.values())
    indexable = {u: p for u, p in pages.items() if "noindex" not in p.robots}
    if preview:
        print("Aperçu (pages en noindex) : contrôles d'indexation limités. Construisez avec SITE_URL=https://centrecfs.be pour tout contrôler.")

    titles, descs = {}, {}
    dates = session_dates()
    private_paths = {R.page(k, lg) for k in PRIVATE for lg in ("fr", "nl", "en") if k in R.PAGES}
    for u, p in pages.items():
        where = u
        if not p.lang:
            err(f"{where} : attribut lang absent")
        if not p.title:
            err(f"{where} : <title> absent")
        if p.h.count(1) != 1:
            err(f"{where} : {p.h.count(1)} H1 (un seul attendu)")
        for prev, cur in zip(p.h, p.h[1:]):
            if cur > prev + 1:
                warnings.append(f"{where} : saut de titre h{prev} → h{cur}")
                break
        for src in p.imgs_no_alt:
            err(f"{where} : image sans attribut alt ({src})")
        for raw in p.ld:
            try:
                data = json.loads(raw)
            except ValueError as e:
                err(f"{where} : JSON-LD invalide ({e})")
                continue
            items = data if isinstance(data, list) else [data]
            for it in items:
                for ci in it.get("hasCourseInstance", []) if isinstance(it, dict) else []:
                    if not ci.get("startDate") or not ci.get("location"):
                        err(f"{where} : CourseInstance sans date ou sans lieu")
                for off in it.get("offers", []) if isinstance(it, dict) else []:
                    price = off.get("price")
                    if price is not None:
                        shown = f"{price:g}" if isinstance(price, (int, float)) else str(price)
                        if shown not in "".join(p.text):
                            err(f"{where} : prix {shown} des données structurées absent de la page")
        visible = re.sub(r"\s+", " ", " ".join(p.text))
        for d in dates:
            if re.search(r"(?<![\d/.])" + re.escape(d) + r"(?![\d/.])", visible):
                err(f"{where} : date de session « {d} » écrite dans le HTML (elle doit venir de sessions.js)")
        if u in private_paths and "noindex" not in p.robots:
            err(f"{where} : page privée indexable")
        if u.endswith("404.html") and "noindex" not in p.robots:
            err(f"{where} : page 404 indexable")

    for u, p in indexable.items():
        where = u
        t = html.unescape(p.title or "")
        d = html.unescape(p.desc or "")
        if len(t) > TITLE_MAX:
            err(f"{where} : titre de {len(t)} caractères (max {TITLE_MAX}) : {t}")
        if not d:
            err(f"{where} : meta description absente")
        elif len(d) > DESC_MAX:
            err(f"{where} : description de {len(d)} caractères (max {DESC_MAX})")
        titles.setdefault(t, []).append(u)
        descs.setdefault(d, []).append(u)
        if not p.canonical or urlparse(p.canonical).netloc != urlparse(CANON).netloc:
            err(f"{where} : canonique absente ou hors du domaine officiel ({p.canonical})")
        if not p.og_image:
            warnings.append(f"{where} : image de partage absente")
        if not p.alts:
            err(f"{where} : aucune balise hreflang")
        elif "x-default" not in p.alts:
            err(f"{where} : hreflang x-default absent")
        for lg, href in p.alts.items():
            target = pages.get(urlparse(href).path)
            if target is None:
                err(f"{where} : hreflang {lg} vers une page absente ({href})")
            elif lg != "x-default" and CANON + u not in target.alts.values():
                err(f"{where} : hreflang {lg} non réciproque ({href})")
    for t, us in titles.items():
        if len(us) > 1:
            err(f"Titre en double « {t} » : {', '.join(us)}")
    for d, us in descs.items():
        if len(us) > 1 and d:
            err(f"Description en double : {', '.join(us)}")

    if not preview:
        # Sitemap = pages indexables
        listed = set()
        for f in os.listdir(DIST):
            if re.match(r"sitemap-[a-z]{2}\.xml$", f):
                listed |= {urlparse(x).path for x in re.findall(r"<loc>(.*?)</loc>", open(os.path.join(DIST, f), encoding="utf-8").read())}
        index_urls = {u for u in indexable if not u.endswith(".html")}
        for u in sorted(index_urls - listed):
            err(f"{u} : page indexable absente du sitemap")
        for u in sorted(listed - index_urls):
            err(f"{u} : dans le sitemap mais absente ou non indexable")
        # Pages orphelines : aucune autre page ne pointe vers elles
        linked = set()
        for u, p in pages.items():
            for href in p.links:
                path = urlparse(href).path
                if path and path != u:
                    linked.add(path if path.endswith("/") or "." in path.rsplit("/", 1)[-1] else path + "/")
        for u in sorted(index_urls - linked):
            err(f"{u} : page orpheline (aucun lien interne)")

    redirects = open(os.path.join(DIST, "_redirects"), encoding="utf-8").read() if os.path.exists(os.path.join(DIST, "_redirects")) else ""
    for old in OLD_URLS:
        if not re.search(r"^" + re.escape(old) + r"\s+\S+\s+301$", redirects, re.M):
            err(f"_redirects : redirection 301 de l'ancienne adresse {old} absente")
    robots = open(os.path.join(DIST, "robots.txt"), encoding="utf-8").read()
    if not preview and "Sitemap:" not in robots:
        err("robots.txt : référence du sitemap absente")

    for w in warnings[:40]:
        print("Avertissement :", w)
    if len(warnings) > 40:
        print(f"… et {len(warnings) - 40} autres avertissements")
    for e in errors:
        print("ERREUR :", e)
    print(f"SEO : {len(pages)} pages, {len(indexable)} indexables, {len(errors)} erreur(s), {len(warnings)} avertissement(s)")
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
