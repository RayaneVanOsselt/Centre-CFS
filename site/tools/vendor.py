#!/usr/bin/env python3
"""Copie les bibliothèques autorisées dans site/src/assets/vendor/ (jamais de CDN).

    python3 site/tools/vendor.py     # après `npm install` ou une mise à jour de @supabase/supabase-js
"""
import json
import os
import shutil

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DST = os.path.join(ROOT, "site", "src", "assets", "vendor")
LIBS = [("@supabase/supabase-js", "dist/umd/supabase.js", "supabase.js")]

os.makedirs(DST, exist_ok=True)
for pkg, rel, name in LIBS:
    base = os.path.join(ROOT, "node_modules", *pkg.split("/"))
    version = json.load(open(os.path.join(base, "package.json")))["version"]
    src = open(os.path.join(base, rel), encoding="utf-8").read()
    with open(os.path.join(DST, name), "w", encoding="utf-8") as fh:
        fh.write(f"/*! {pkg} {version} — MIT — copié par site/tools/vendor.py */\n" + src)
    print(f"{pkg} {version} → site/src/assets/vendor/{name}")
