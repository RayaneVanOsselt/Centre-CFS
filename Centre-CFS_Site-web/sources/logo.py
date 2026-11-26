"""Génère les fichiers du nouveau logo Centre CFS (texte vectorisé, aucune police requise)."""
import os
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

FONTS = os.path.join(os.path.dirname(__file__), "node_modules/@fontsource")
OUT = os.path.join(os.path.dirname(__file__), "out/logo")
os.makedirs(OUT, exist_ok=True)

BLEU = "#0D4A8C"
JAUNE = "#F7B500"
ENCRE = "#0F1C2E"
BLANC = "#FFFFFF"

_cache = {}


def font(path):
    if path not in _cache:
        _cache[path] = TTFont(os.path.join(FONTS, path))
    return _cache[path]


def text_path(txt, fpath, size, x, y, tracking=0.0):
    """Retourne (d, largeur) du texte vectorisé. y = ligne de base."""
    f = font(fpath)
    gs = f.getGlyphSet()
    cmap = f.getBestCmap()
    upm = f["head"].unitsPerEm
    s = size / upm
    pen = SVGPathPen(gs)
    cur = 0.0
    for ch in txt:
        g = cmap.get(ord(ch))
        if g is None:
            continue
        tp = TransformPen(pen, (s, 0, 0, -s, x + cur, y))
        gs[g].draw(tp)
        cur += gs[g].width * s + tracking * size
    if txt:
        cur -= tracking * size
    return pen.getCommands(), cur


def cap_height(fpath, size):
    f = font(fpath)
    upm = f["head"].unitsPerEm
    os2 = f["OS/2"]
    ch = getattr(os2, "sCapHeight", 0) or 700
    return ch * size / upm


_sid = [0]


def symbol(ox=0, oy=0, scale=1.0, disc=BLEU, c=BLANC, check=JAUNE, check_out=None):
    """Disque (panneau d'obligation) + C (Centre) + coche (compétence validée) qui sort du cadre."""
    _sid[0] += 1
    i = f"cfs{_sid[0]}"
    check_out = check_out or check
    t = f'transform="translate({ox} {oy}) scale({scale})"'
    chk = "M24.5 31.5L30 37L57.5 6.75"
    return (
        f'<g {t}>'
        f'<defs><clipPath id="{i}a"><circle cx="32" cy="32" r="30"/></clipPath>'
        f'<clipPath id="{i}b"><path d="M-10-10H80V80H-10ZM2 32a30 30 0 1 0 60 0a30 30 0 1 0-60 0Z" clip-rule="evenodd"/></clipPath></defs>'
        f'<circle cx="32" cy="32" r="30" fill="{disc}"/>'
        f'<path d="M34.34 20.08A13.5 13.5 0 1 0 34.34 43.92" fill="none" stroke="{c}" stroke-width="7" stroke-linecap="round"/>'
        f'<path d="{chk}" clip-path="url(#{i}a)" fill="none" stroke="{check}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>'
        f'<path d="{chk}" clip-path="url(#{i}b)" fill="none" stroke="{check_out}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>'
        f'</g>'
    )


BC800 = "barlow-condensed/files/barlow-condensed-latin-800-normal.woff2"
B600 = "barlow/files/barlow-latin-600-normal.woff2"
B500 = "barlow/files/barlow-latin-500-normal.woff2"


def horizontal(theme="couleur"):
    text = ENCRE
    sub = "#3E4C5E"
    disc, c, chk = BLEU, BLANC, JAUNE
    out = None
    if theme == "negatif":
        text, sub = BLANC, "#C9D6E6"
        disc, c, chk, out = BLANC, BLEU, BLEU, JAUNE
    if theme == "mono-noir":
        text = sub = ENCRE
        disc, c, chk, out = ENCRE, BLANC, BLANC, ENCRE
    if theme == "mono-blanc":
        text = sub = BLANC
        disc, c, chk, out = BLANC, ENCRE, ENCRE, BLANC
    H = 64
    sym = symbol(0, 0, 1, disc, c, chk, out)
    x0 = 78
    d1, w1 = text_path("CFS", BC800, 46, x0, 40, tracking=0.01)
    d2, w2 = text_path("Centre de formations", B600, 13.2, x0, 54.5, 0.005)
    d3, w3 = text_path("", B500, 12, x0, 0)
    W = x0 + max(w1, w2) + 2
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W:.1f} {H}" width="{W*4:.0f}" height="{H*4}" role="img" aria-label="Centre CFS, centre de formations sécurité">'
        f'<title>Centre CFS</title>{sym}'
        f'<path d="{d1}" fill="{text}"/>'
        f'<path d="{d2}" fill="{sub}"/>'
        f'</svg>'
    )
    return svg, W, H


def full_lockup(theme="couleur"):
    """Version avec signature 'Sécurité au travail'."""
    text, sub, acc = ENCRE, "#3E4C5E", BLEU
    disc, c, chk = BLEU, BLANC, JAUNE
    out = None
    if theme == "negatif":
        text, sub, acc = BLANC, "#C9D6E6", JAUNE
        disc, c, chk, out = BLANC, BLEU, BLEU, JAUNE
    sym = symbol(0, 4, 1.25, disc, c, chk, out)
    x0 = 96
    d1, w1 = text_path("Centre CFS", BC800, 50, x0, 45, 0.005)
    d2, w2 = text_path("Formations sécurité au travail", B600, 16, x0, 73, 0.01)
    W = x0 + max(w1, w2) + 2
    H = 88
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W:.1f} {H}" width="{W*4:.0f}" height="{H*4}" role="img" aria-label="Centre CFS, formations sécurité au travail">'
        f'<title>Centre CFS</title>{sym}'
        f'<path d="{d1}" fill="{text}"/>'
        f'<path d="{d2}" fill="{acc}"/>'
        f'</svg>'
    )
    return svg, W, H


def vertical(theme="couleur"):
    text, sub = ENCRE, BLEU
    disc, c, chk = BLEU, BLANC, JAUNE
    out = None
    if theme == "negatif":
        text, sub = BLANC, JAUNE
        disc, c, chk, out = BLANC, BLEU, BLEU, JAUNE
    d1, w1 = text_path("Centre CFS", BC800, 40, 0, 0, 0.005)
    d2, w2 = text_path("Formations sécurité au travail", B600, 12.5, 0, 0, 0.01)
    W = max(w1, w2, 96) + 4
    sx = (W - 96) / 2
    sym = symbol(sx, 0, 1.5, disc, c, chk, out)
    d1, _ = text_path("Centre CFS", BC800, 40, (W - w1) / 2, 138, 0.005)
    d2, _ = text_path("Formations sécurité au travail", B600, 12.5, (W - w2) / 2, 160, 0.01)
    H = 168
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W:.1f} {H}" width="{W*4:.0f}" height="{H*4}" role="img" aria-label="Centre CFS">'
        f'<title>Centre CFS</title>{sym}<path d="{d1}" fill="{text}"/><path d="{d2}" fill="{sub}"/></svg>'
    )
    return svg, W, H


def symbol_svg(theme="couleur", size=512):
    disc, c, chk, out = BLEU, BLANC, JAUNE, None
    if theme == "mono-noir":
        disc, c, chk, out = ENCRE, BLANC, BLANC, ENCRE
    if theme == "mono-blanc":
        disc, c, chk, out = BLANC, ENCRE, ENCRE, BLANC
    if theme == "negatif":
        disc, c, chk, out = BLANC, BLEU, BLEU, JAUNE
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="{size}" height="{size}" role="img" aria-label="Symbole Centre CFS">'
        f'<title>Centre CFS</title>{symbol(0, 0, 1, disc, c, chk, out)}</svg>'
    )


def favicon():
    # Version simplifiée lisible en 16 px : traits plus épais
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
        f'<circle cx="32" cy="32" r="31" fill="{BLEU}"/>'
        f'<path d="M33.6 19.4A14 14 0 1 0 33.6 44.6" fill="none" stroke="#fff" stroke-width="8.5" stroke-linecap="round"/>'
        f'<path d="M24 31.5L30 37.5L55 9" fill="none" stroke="{JAUNE}" stroke-width="8.5" stroke-linecap="round" stroke-linejoin="round"/>'
        '</svg>'
    )


if __name__ == "__main__":
    files = {}
    for th in ["couleur", "negatif", "mono-noir", "mono-blanc"]:
        files[f"cfs-logo-horizontal-{th}.svg"] = horizontal(th)[0]
        files[f"cfs-symbole-{th}.svg"] = symbol_svg(th)
    for th in ["couleur", "negatif"]:
        files[f"cfs-logo-signature-{th}.svg"] = full_lockup(th)[0]
        files[f"cfs-logo-vertical-{th}.svg"] = vertical(th)[0]
    files["favicon.svg"] = favicon()
    for n, s in files.items():
        with open(os.path.join(OUT, n), "w", encoding="utf-8") as fh:
            fh.write(s)
    print("\n".join(sorted(files)))
