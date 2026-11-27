#!/usr/bin/env python3
"""Contrôle des traductions et du multilingue.

    python3 site/tools/check_i18n.py          # sources + pages construites (dist/) si elles existent

Sources :
- site/content/ui.{fr,nl,en}.json : mêmes clés, mêmes {variables} dans chaque texte ;
- site/content/{fr,nl,en}.py : mêmes clés de pages (PAGES), y compris les variantes « _static ».
Pages construites (dist/, après python3 site/build.py) :
- aucun texte français dans les pages NL et EN (hors éléments marqués lang="fr…", noms propres et adresses) ;
- balises hreflang réciproques : chaque page annonce ses équivalents, et chaque équivalent la cite en retour.
Code de sortie 1 en cas d'écart.
"""
import importlib
import json
import os
import re
import sys
from html.parser import HTMLParser
from urllib.parse import urlparse

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.dirname(HERE)
DIST = os.path.join(ROOT, "dist")
sys.path.insert(0, HERE)
LANGS = ("fr", "nl", "en")
VAR = re.compile(r"\{(\w+)\}")

# Mots-outils propres au français (absents de l'anglais et du néerlandais courants)
FRENCH = {"les", "des", "une", "pour", "avec", "dans", "nous", "vous", "votre", "vos", "sont", "être", "aux", "sur", "est",
          "qui", "que", "pas", "par", "cette", "leurs", "leur", "aussi", "plus", "entre", "chaque", "notre", "nos", "sans", "chez"}
# Textes français légitimes dans une page NL ou EN (noms propres, adresses, raison sociale)
ALLOWED = ("Rue de la Paix", "Rue des Français", "Centre de formations pour la sécurité des travailleurs", "Le Forem",
           "Congé-éducation payé", "SPF Emploi", "Chambres de commerce", "Sécurité de base VCA", "Sécurité pour ligne hiérarchique",
           "L'AKTus", "AKT – CCI")


def keys_of(d, prefix=""):
    out = set()
    for k, v in d.items():
        out.add(prefix + k)
        if isinstance(v, dict):
            out |= keys_of(v, prefix + k + ".")
    return out


def check_sources(errors):
    ui = {lg: json.load(open(os.path.join(HERE, "content", f"ui.{lg}.json"), encoding="utf-8")) for lg in LANGS}
    for lg in LANGS[1:]:
        for k in sorted(set(ui["fr"]) - set(ui[lg])):
            errors.append(f"ui.{lg}.json : clé absente « {k} »")
        for k in sorted(set(ui[lg]) - set(ui["fr"])):
            errors.append(f"ui.{lg}.json : clé en trop « {k} »")
        for k in set(ui["fr"]) & set(ui[lg]):
            if k.startswith("_meta"):
                continue
            a, b = set(VAR.findall(str(ui["fr"][k]))), set(VAR.findall(str(ui[lg][k])))
            if a != b:
                errors.append(f"ui.{lg}.json : « {k} » utilise {sorted(b)} au lieu de {sorted(a)}")
    pages = {lg: keys_of(importlib.import_module(f"content.{lg}").PAGES) for lg in LANGS}
    for lg in LANGS[1:]:
        for k in sorted(pages["fr"] ^ pages[lg]):
            errors.append(f"{lg}.py : clé de page {'absente' if k in pages['fr'] else 'en trop'} « {k} »")
    return len(ui["fr"]), len(pages["fr"])


class Page(HTMLParser):
    """Texte visible (hors script, style, éléments lang="fr…") et liens hreflang d'une page."""
    SKIP = {"script", "style", "svg", "noscript", "template"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack, self.texts, self.alternates, self.lang = [], [], {}, None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "html":
            self.lang = a.get("data-lang")
        if tag == "link" and a.get("rel") == "alternate" and a.get("hreflang"):
            self.alternates[a["hreflang"]] = a.get("href", "")
        if tag in ("meta", "link", "br", "img", "input", "hr", "source"):
            return
        skip = tag in self.SKIP or (a.get("lang", "").startswith("fr") and self.lang != "fr")
        self.stack.append(skip or (self.stack[-1] if self.stack else False))

    def handle_endtag(self, tag):
        if tag in ("meta", "link", "br", "img", "input", "hr", "source"):
            return
        if self.stack:
            self.stack.pop()

    def handle_data(self, data):
        if not (self.stack and self.stack[-1]) and data.strip():
            self.texts.append(data.strip())


def page_path(url, base):
    """Adresse canonique ou relative → fichier de dist/."""
    p = urlparse(url).path
    if base and p.startswith(base + "/"):
        p = p[len(base):]
    f = os.path.join(DIST, p.lstrip("/"))
    return os.path.join(f, "index.html") if p.endswith("/") else f


def check_built(errors, warnings):
    if not os.path.isdir(DIST):
        return 0
    base = "/" + (os.environ.get("BASE_PATH") or "").strip("/") if (os.environ.get("BASE_PATH") or "").strip("/") else ""
    parsed = {}
    for folder, _, files in os.walk(DIST):
        for fn in files:
            if fn.endswith(".html"):
                path = os.path.join(folder, fn)
                p = Page()
                p.feed(open(path, encoding="utf-8").read())
                parsed[os.path.normpath(path)] = p
    french_pages = 0
    for path, p in parsed.items():
        rel = os.path.relpath(path, DIST)
        if p.lang in ("nl", "en"):
            hits = []
            for text in p.texts:
                if any(x in text for x in ALLOWED):
                    continue
                words = re.findall(r"[a-zàâçéèêëîïôûùüÿœ']+", text.lower())
                fr_words = [w for w in words if w in FRENCH]
                if len(fr_words) >= 3 and len(fr_words) >= 0.2 * len(words):
                    hits.append(text[:90])
            if hits:
                french_pages += 1
                errors.append(f"{rel} : texte français dans une page {p.lang.upper()} : « {hits[0]} »" + (f" (+{len(hits) - 1})" if len(hits) > 1 else ""))
        # hreflang réciproques (pages indexables : celles qui annoncent des équivalents)
        if not p.alternates:
            continue
        for lang, url in p.alternates.items():
            target = os.path.normpath(page_path(url, base))
            if target not in parsed:
                errors.append(f"{rel} : équivalent {lang} introuvable ({url})")
                continue
            back = {os.path.normpath(page_path(u, base)) for u in parsed[target].alternates.values()}
            if path not in back:
                errors.append(f"{rel} : l'équivalent {lang} ({os.path.relpath(target, DIST)}) ne cite pas cette page en retour")
        if "x-default" not in p.alternates:
            warnings.append(f"{rel} : pas de hreflang x-default")
    return len(parsed)


def main():
    errors, warnings = [], []
    n_ui, n_pages = check_sources(errors)
    built = check_built(errors, warnings)
    for e in errors:
        print("  " + e)
    for w in warnings[:10]:
        print("  (avertissement) " + w)
    print(f"Traductions : {n_ui} textes d'interface, {n_pages} clés de pages, {built} pages construites contrôlées, {len(errors)} écart(s).")
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
