#!/usr/bin/env python3
"""Contrôle du site généré (dist/) : aucun lien interne cassé, aucun identifiant en double, aucune ressource absente.

    python3 site/tools/check_links.py          # après python3 site/build.py
    BASE_PATH=/Centre-CFS python3 site/tools/check_links.py

Vérifie chaque href, src, srcset, action et poster des pages HTML : la cible doit exister dans dist/ (une adresse
de dossier doit contenir index.html) et, avec un chemin de base, toute adresse interne doit commencer par lui.
Les images de partage (og:image, sur le domaine officiel) doivent aussi exister. Code de sortie 1 en cas d'erreur.
"""
import collections
import os
import re
import sys
from html.parser import HTMLParser
from urllib.parse import unquote, urlparse

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DIST = os.path.join(ROOT, "dist")
OFFICIAL_HOST = "centrecfs.be"
_b = (os.environ.get("BASE_PATH") or "").strip().strip("/")
BASE = "/" + _b if _b else ""


class Page(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.refs, self.ids = [], []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        for k in ("href", "src", "action", "poster"):
            if a.get(k):
                self.refs.append(a[k])
        if a.get("srcset"):
            self.refs += [p.strip().split(" ")[0] for p in a["srcset"].split(",") if p.strip()]
        if a.get("property") == "og:image" and a.get("content"):
            self.refs.append(a["content"])
        if a.get("id"):
            self.ids.append(a["id"])


def target(page, ref):
    """Fichier local visé par une adresse, None si elle est externe, ou un message d'erreur (str commençant par « ! »)."""
    u = urlparse(ref)
    if u.scheme in ("mailto", "tel", "data", "javascript"):
        return None
    if u.scheme in ("http", "https"):
        if u.netloc.endswith(OFFICIAL_HOST) and re.search(r"\.(png|jpe?g|webp|svg)$", u.path):
            return os.path.join(DIST, u.path.lstrip("/"))
        return None
    path = unquote(u.path)
    if not path:
        return None
    if path.startswith("/"):
        if BASE:
            if not path.startswith(BASE + "/") and path != BASE:
                return f"! adresse sans le chemin de base {BASE} : {path}"
            path = path[len(BASE):] or "/"
        t = os.path.join(DIST, path.lstrip("/"))
    else:
        t = os.path.normpath(os.path.join(os.path.dirname(page), path))
    if path.endswith("/") or os.path.isdir(t):
        t = os.path.join(t, "index.html")
    return t


def main():
    if not os.path.isdir(DIST):
        sys.exit("dist/ est absent : lancez d'abord python3 site/build.py")
    broken = collections.defaultdict(set)
    dup = []
    pages = 0
    for folder, _, files in os.walk(DIST):
        for fn in files:
            if not fn.endswith(".html"):
                continue
            page = os.path.join(folder, fn)
            pages += 1
            p = Page()
            p.feed(open(page, encoding="utf-8").read())
            rel = os.path.relpath(page, DIST)
            for i, n in collections.Counter(p.ids).items():
                if n > 1:
                    dup.append(f"{rel} : id « {i} » ×{n}")
            for ref in p.refs:
                t = target(page, ref)
                if t is None:
                    continue
                if t.startswith("!"):
                    broken[t[2:]].add(rel)
                elif not os.path.exists(t):
                    broken[os.path.relpath(t, DIST)].add(rel)
    for key, where in sorted(broken.items()):
        print(f"  LIEN CASSÉ  {key}  ({len(where)} page(s), par exemple {sorted(where)[0]})")
    for d in dup:
        print(f"  ID EN DOUBLE  {d}")
    print(f"{pages} pages contrôlées : {len(broken)} lien(s) cassé(s), {len(dup)} identifiant(s) en double.")
    sys.exit(1 if broken or dup or not pages else 0)


if __name__ == "__main__":
    main()
