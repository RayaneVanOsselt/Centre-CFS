#!/usr/bin/env python3
"""Base de connaissances de l'assistant, générée à partir de TOUT le contenu du site (mission, section 8.2).

Appelé par site/build.py (fonction build) : rien n'est recopié à la main. Produit :
  - dist/assets/data/kb.{fr,nl,en}.json  (chargé à la demande par le navigateur) ;
  - worker/src/generated/kb.json          (copie du Worker, adresses sans chemin de base).
Une entrée = { id, type, lang, title, url, bookUrl?, domain?, facts, content, keywords, updatedAt }.
« unconfirmed » liste ce que l'assistant ne doit JAMAIS affirmer.
"""
import hashlib
import json
import os
import re
import unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SYN = os.path.join(ROOT, "site", "content", "synonyms.json")
UNCONFIRMED = ["agrément", "reconnaissance officielle", "taux de réussite", "prise en charge financière garantie"]


def fold(s):
    """Minuscules, sans accents (même normalisation que retrieval.js)."""
    s = unicodedata.normalize("NFD", str(s or "").lower())
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


def text_of(v):
    """Texte plat d'une valeur de contenu (chaîne, liste, tuples programme/FAQ)."""
    if v is None:
        return ""
    if isinstance(v, str):
        return v
    if isinstance(v, (list, tuple)):
        return " ".join(text_of(x) for x in v)
    return str(v)


def build(ctx):
    """ctx : T, C, R, PRICE, BOOKABLE, BASE, UI, PUBLIC, P, LANGS, OUT, UPDATED, EPI. Renvoie {lang: empreinte}."""
    T, C, R = ctx["T"], ctx["C"], ctx["R"]
    syn = json.load(open(SYN, encoding="utf-8"))
    out_dir = os.path.join(ctx["OUT"], "assets", "data")
    os.makedirs(out_dir, exist_ok=True)
    versions, worker = {}, {}
    for base in (ctx["BASE"], ""):
        for lang in ctx["LANGS"]:
            kb = build_lang(ctx, lang, base, syn)
            if base == ctx["BASE"]:
                data = json.dumps(kb, ensure_ascii=False, separators=(",", ":"))
                with open(os.path.join(out_dir, f"kb.{lang}.json"), "w", encoding="utf-8") as fh:
                    fh.write(data)
                versions[lang] = hashlib.sha256(data.encode()).hexdigest()[:10]
            if base == "":
                worker[lang] = kb
    gen = os.path.join(ROOT, "worker", "src", "generated")
    if os.path.isdir(os.path.join(ROOT, "worker", "src")):
        os.makedirs(gen, exist_ok=True)
        with open(os.path.join(gen, "kb.json"), "w", encoding="utf-8") as fh:
            json.dump(worker, fh, ensure_ascii=False, separators=(",", ":"))
    return versions


def build_lang(ctx, lang, base, syn):
    T, C, R, UI = ctx["T"], ctx["C"], ctx["R"], ctx["UI"]
    tx = T[lang]
    upd = ctx["UPDATED"]
    page = lambda k: base + R.page(k, lang)  # noqa: E731
    entries = []

    # Formations : tous les champs, FAQ propre à chaque fiche
    for f in C.FORMATIONS:
        s = f["slug"]
        fx = tx.FORMATIONS[s]
        titles = {lg: T[lg].FORMATIONS[s]["title"] for lg in ctx["LANGS"]}
        fulls = {lg: T[lg].FORMATIONS[s]["full"] for lg in ctx["LANGS"]}
        aliases = sorted({fold(x) for x in list(titles.values()) + list(fulls.values()) + syn["formations"].get(s, []) + [s.replace("-", " ")]})
        programme = " ".join(f"{h} : {text_of(items)}." for h, items in (fx.get("programme") or []))
        faq = [{"q": q, "a": a} for q, a in (fx.get("faq") or [])]
        facts = {
            "priceHtva": ctx["PRICE"].get(s), "priceNote": fx.get("prix_note"), "duration": fx.get("duree"), "hours": fx.get("horaires"),
            "exam": fx.get("examen"), "validity": fx.get("validite"), "certificate": fx.get("certificat"), "prerequisites": fx.get("prerequis"),
            "public": fx.get("public"), "legal": fx.get("legal"), "places": f["lieux"], "bookable": bool(ctx["BOOKABLE"].get(s, True)),
            "equipment": ctx["EPI"][lang] if f["domain"] == "equipements" else None,
        }
        entries.append({
            "id": f"formation:{s}", "type": "formation", "lang": lang, "slug": s, "title": fx["title"], "full": fx["full"],
            "url": base + R.formation(s, lang), "bookUrl": page("inscription") + "?formation=" + s,
            "quoteUrl": page("contact") + "?type=devis&formation=" + s, "domain": f["domain"], "domainName": tx.DOMAINES[f["domain"]]["name"],
            "facts": facts, "aliases": aliases,
            "content": " ".join(x for x in [fx.get("pitch"), fx.get("intro"), text_of(fx.get("objectifs")), programme, fx.get("public")] if x),
            "faq": faq, "keywords": [k.strip() for k in str(fx.get("kw") or "").split(",") if k.strip()], "updatedAt": upd,
        })
        for i, item in enumerate(faq):
            entries.append({"id": f"faq:{s}:{i}", "type": "faq", "lang": lang, "slug": s, "title": item["q"], "url": base + R.formation(s, lang),
                             "facts": {}, "content": item["a"], "keywords": [], "updatedAt": upd})

    # Domaines
    for d in C.DOMAINES:
        dx = tx.DOMAINES[d["slug"]]
        entries.append({"id": f"domain:{d['slug']}", "type": "domain", "lang": lang, "title": dx["long"], "url": base + R.domain(d["slug"], lang),
                        "domain": d["slug"], "facts": {}, "content": text_of(dx.get("intro")),
                        "keywords": [dx["name"]] + [tx.FORMATIONS[f["slug"]]["title"] for f in C.FORMATIONS if f["domain"] == d["slug"]], "updatedAt": upd})

    # FAQ générale
    for i, (q, a) in enumerate(tx.FAQ_GENERALE):
        entries.append({"id": f"faq:general:{i}", "type": "faq", "lang": lang, "title": q, "url": page("faq"), "facts": {}, "content": a,
                        "keywords": [], "updatedAt": upd})

    # Articles et guides, découpés par intertitre
    for a in C.ARTICLES:
        ax = tx.ARTICLES[a["key"]]
        url = base + R.article(a["key"], lang)
        section, buf, n = ax["title"], [], 0
        for kind, val in ax["body"] + [("h2", None)]:
            if kind == "h2":
                if buf:
                    entries.append({"id": f"article:{a['key']}:{n}", "type": "article", "lang": lang, "title": section, "url": url, "facts": {},
                                    "content": " ".join(buf), "keywords": [ax["title"]], "updatedAt": a.get("updated") or a["date"] or upd})
                    n += 1
                section, buf = (val or section), []
            else:
                buf.append(text_of(val))

    # Pages de service
    P = ctx["P"]
    pages = [("entreprises", ["title", "lead", "adv", "steps"]), ("salles", ["title", "lead", "features", "pricing"]),
             ("langues", ["title", "lead", "how"]), ("centre", ["title", "lead", "trainers", "milestones"]),
             ("contact", ["title", "lead", "reach_text"]), ("agenda", ["title", "lead"]), ("inscription", ["title", "lead"])]
    for key, fields in pages:
        p = P(lang, key)
        entries.append({"id": f"page:{key}", "type": "page", "lang": lang, "title": p["title"], "url": page(key), "facts": {},
                        "content": " ".join(text_of(p.get(k)) for k in fields), "keywords": [], "updatedAt": upd})

    phone, email = C.SITE["phone_display"], C.SITE["email"]
    langs_list = list(tx.LANGUES)
    return {
        "lang": lang, "updatedAt": upd, "base": base,
        "contact": {"phone": phone if lang != "en" else C.SITE["phone"], "email": email},
        "closure": {"from": C.SITE.get("closure_from"), "until": C.SITE.get("closure_until"),
                    "text": (tx.SITE.get("closure_label", "") + " " + tx.SITE.get("closure_text", "")).strip()},
        "languages": langs_list, "languageAliases": syn["languages"], "placeAliases": syn["places"],
        "rooms": [{"name": r["name"], "capacity": b["cap"]} for r, b in zip(tx.SALLES, C.SALLES)],
        "flags": {"onlinePayment": bool(ctx["PUBLIC"]["onlinePayment"]), "accounts": bool(ctx["PUBLIC"]["accounts"])},
        "routes": {k: page(k) for k in ("home", "formations", "agenda", "inscription", "entreprises", "salles", "contact", "faq", "langues", "cgv",
                                        "confidentialite", "compte", "connexion", "motdepasse", "centre")},
        "unconfirmed": UNCONFIRMED,
        # Textes des réponses dans la langue de la base (une question en néerlandais sur une page française est
        # ainsi répondue en néerlandais, avec la base néerlandaise)
        "strings": {k: v for k, v in UI[lang].items() if k.startswith(("chat.", "availability.")) or k == "common.htva"},
        "entries": entries,
    }
