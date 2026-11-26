#!/usr/bin/env python3
"""Recopie les textes des e-mails (clés « email.* » de site/content/ui.{fr,nl,en}.json) et le nom des formations
dans les 3 langues dans le bloc « @i18n » d'apps-script/reservations.gs.

Une seule source pour les textes : le site, le Worker et la feuille Google utilisent les mêmes fichiers.
    python3 site/tools/sync_gas_i18n.py           # met à jour le script
    python3 site/tools/sync_gas_i18n.py --check   # code 1 si le script n'est pas à jour (utilisé par les tests)
"""
import importlib
import json
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "site"))
GS = os.path.join(ROOT, "apps-script", "reservations.gs")
LANGS = ("fr", "nl", "en")


def block():
    i18n = {}
    for lang in LANGS:
        ui = json.load(open(os.path.join(ROOT, "site", "content", f"ui.{lang}.json"), encoding="utf-8"))
        i18n[lang] = {k: v for k, v in sorted(ui.items()) if k.startswith("email.")}
    names = {}
    mods = {lang: importlib.import_module(f"content.{lang}") for lang in LANGS}
    for slug in mods["fr"].FORMATIONS:
        names[slug] = {lang: mods[lang].FORMATIONS[slug]["title"] for lang in LANGS}
    lines = ["/* @i18n:start */", "/* Généré par site/tools/sync_gas_i18n.py — ne pas modifier à la main. */",
             "var I18N = " + json.dumps(i18n, ensure_ascii=False, indent=2) + ";",
             "var TRAINING_NAMES = " + json.dumps(names, ensure_ascii=False, indent=2) + ";",
             "/* @i18n:end */"]
    return "\n".join(lines)


def updated_source():
    src = open(GS, encoding="utf-8").read()
    a, b = src.index("/* @i18n:start */"), src.index("/* @i18n:end */") + len("/* @i18n:end */")
    return src, src[:a] + block() + src[b:]


if __name__ == "__main__":
    src, new = updated_source()
    if "--check" in sys.argv:
        sys.exit(0 if src == new else 1)
    if src != new:
        with open(GS, "w", encoding="utf-8") as fh:
            fh.write(new)
        print("apps-script/reservations.gs : textes des e-mails mis à jour.")
    else:
        print("apps-script/reservations.gs : textes déjà à jour.")
