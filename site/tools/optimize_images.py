#!/usr/bin/env python3
"""Dérivés optimisés des photos et registre de provenance.

    python3 -m pip install pillow          # une fois (Pillow 11.2 ou plus récent : AVIF inclus)
    python3 site/tools/optimize_images.py  # après avoir ajouté une image dans site/content/images.py

Pour chaque entrée de site/content/images.py (original dans assets-src/originaux/) :
  1. orientation EXIF appliquée, puis métadonnées supprimées (EXIF, GPS) : rien n'est recopié dans les dérivés ;
  2. recadrage 3:2 centré sur le point focal ;
  3. harmonisation légère, identique pour toutes les photos (contraste +3 %, saturation −4 %) ;
  4. dérivés AVIF (qualité 56) et WebP (qualité 76) en 480, 960 et 1600 px de large ;
  5. image de partage 1200 × 630 (JPEG, recadrée sur le point focal).
Écrit aussi site/content/images.generated.json (dimensions, pour les balises <picture>) et docs/image-sources.md.
Les dérivés existants ne sont recalculés que si l'original ou les réglages changent (empreinte).
"""
import hashlib
import json
import os
import sys

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from content.images import IMAGES  # noqa: E402

SRC = os.path.join(ROOT, "assets-src", "originaux")
OUT = os.path.join(HERE, "src", "assets", "img", "photos")
SHARE = os.path.join(HERE, "src", "assets", "img", "partage")
META = os.path.join(HERE, "content", "images.generated.json")
REGISTRY = os.path.join(ROOT, "docs", "image-sources.md")
WIDTHS = (480, 960, 1600)
RATIO = 3 / 2
SETTINGS = "v1:3x2:avif56:webp76:c103:s096"
MAX_BYTES = 200 * 1024


def crop_to(im, ratio, focal):
    """Plus grand rectangle de proportion `ratio` centré au plus près du point focal."""
    w, h = im.size
    if w / h > ratio:
        nw, nh = int(h * ratio), h
    else:
        nw, nh = w, int(w / ratio)
    cx, cy = focal[0] * w, focal[1] * h
    left = int(min(max(cx - nw / 2, 0), w - nw))
    top = int(min(max(cy - nh / 2, 0), h - nh))
    return im.crop((left, top, left + nw, top + nh))


def main():
    try:
        from PIL import Image, ImageEnhance, ImageOps
    except ImportError:
        sys.exit("Pillow est nécessaire : python3 -m pip install pillow")
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(SHARE, exist_ok=True)
    old = json.load(open(META, encoding="utf-8")) if os.path.exists(META) else {}
    meta, problems = {}, []
    for key, info in IMAGES.items():
        path = os.path.join(SRC, info["file"])
        if not os.path.exists(path):
            problems.append(f"{key} : original absent ({info['file']})")
            continue
        digest = hashlib.sha256(open(path, "rb").read() + repr((info["focal"], SETTINGS)).encode()).hexdigest()[:16]
        files = [f"{key}-{w}.{ext}" for w in WIDTHS for ext in ("avif", "webp")]
        if old.get(key, {}).get("hash") == digest and all(os.path.exists(os.path.join(OUT, f)) for f in files):
            meta[key] = old[key]
            continue
        im = ImageOps.exif_transpose(Image.open(path)).convert("RGB")
        im = ImageEnhance.Color(ImageEnhance.Contrast(im).enhance(1.03)).enhance(0.96)
        crop = crop_to(im, RATIO, info["focal"])
        sizes = {}
        for w in WIDTHS:
            w2 = min(w, crop.width)
            h2 = round(w2 / RATIO)
            r = crop.resize((w2, h2), Image.LANCZOS)
            r.save(os.path.join(OUT, f"{key}-{w}.avif"), "AVIF", quality=56)
            r.save(os.path.join(OUT, f"{key}-{w}.webp"), "WEBP", quality=76, method=6)
            sizes[w] = [w2, h2]
        share = crop_to(im, 1200 / 630, info["focal"]).resize((1200, 630), Image.LANCZOS)
        share.save(os.path.join(SHARE, f"{key}.jpg"), "JPEG", quality=78, optimize=True, progressive=True)
        meta[key] = {"hash": digest, "sizes": sizes}
        print(f"  {key} : dérivés recalculés")
    for key in meta:
        for f in os.listdir(OUT):
            if f.startswith(key + "-") and os.path.getsize(os.path.join(OUT, f)) > MAX_BYTES:
                problems.append(f"{f} dépasse 200 Ko")
    with open(META, "w", encoding="utf-8") as fh:
        json.dump(meta, fh, indent=1, sort_keys=True)
        fh.write("\n")
    write_registry()
    for p in problems:
        print("  PROBLÈME  " + p)
    print(f"{len(meta)} photo(s) prêtes, {len(problems)} problème(s).")
    sys.exit(1 if problems else 0)


def write_registry():
    rows = []
    for key, i in sorted(IMAGES.items(), key=lambda kv: kv[1]["file"]):
        rows.append(f"| `assets-src/originaux/{i['file']}` | `img/photos/{key}-{{480,960,1600}}.{{avif,webp}}`, `img/partage/{key}.jpg` | "
                    f"{i['author']} / {i['platform']} | {i['url']} | {i['license']} | {i['retrieved']} | "
                    f"{i['check']} {'Image générée par IA.' if i['ai'] else 'Photo réelle (non générée par IA).'} |")
    md = ["# Provenance des images", "",
          "Généré par `python3 site/tools/optimize_images.py` à partir de `site/content/images.py` (ne pas modifier à la main).",
          "Règles : section 9.6 de la mission. Aucune de ces photos ne représente le Centre CFS, ses salles, ses formateurs ou ses",
          "participants : ce sont des illustrations, décrites comme telles dans les textes alternatifs. Les photos du client",
          "(`client/photos/`, avec accord écrit) les remplaceront.", "",
          "| Fichier | Dérivés | Auteur / plateforme | URL source | Licence | Récupéré le | Remarque |",
          "|---|---|---|---|---|---|---|"] + rows + [""]
    with open(REGISTRY, "w", encoding="utf-8") as fh:
        fh.write("\n".join(md))


if __name__ == "__main__":
    main()
