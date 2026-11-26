#!/usr/bin/env python3
"""Contrôle des traductions : les 3 langues ont exactement les mêmes clés d'interface et les mêmes variables.

    python3 site/tools/check_i18n.py

- site/content/ui.{fr,nl,en}.json : mêmes clés, mêmes {variables} dans chaque texte ;
- site/content/{fr,nl,en}.py : mêmes clés de pages (PAGES), y compris les variantes « _static ».
Code de sortie 1 en cas d'écart.
"""
import importlib
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)
LANGS = ("fr", "nl", "en")
VAR = re.compile(r"\{(\w+)\}")


def keys_of(d, prefix=""):
    out = set()
    for k, v in d.items():
        out.add(prefix + k)
        if isinstance(v, dict):
            out |= keys_of(v, prefix + k + ".")
    return out


def main():
    errors = []
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
    for e in errors:
        print("  " + e)
    print(f"Traductions : {len(ui['fr'])} textes d'interface, {len(pages['fr'])} clés de pages, {len(errors)} écart(s).")
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
