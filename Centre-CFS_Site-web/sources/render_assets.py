"""Rendu des images : favicons PNG, logo PNG, images Open Graph (1200x630) par page."""
import asyncio, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from playwright.async_api import async_playwright
import content as C, logo as L
from icons import sign
ROOT = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.join(ROOT, "out", "site")
LOGO = os.path.join(ROOT, "out", "logo")
FONTS = "file://" + os.path.join(SITE, "assets", "fonts")
CSS = f"""@font-face{{font-family:B;src:url({FONTS}/barlow-500.woff2)}}@font-face{{font-family:B;font-weight:700;src:url({FONTS}/barlow-700.woff2)}}
@font-face{{font-family:BC;font-weight:800;src:url({FONTS}/barlow-condensed-800.woff2)}}
body{{margin:0}}.og{{width:1200px;height:630px;box-sizing:border-box;background:#0D4A8C;color:#fff;position:relative;padding:70px 80px;font-family:B;overflow:hidden}}
.og:after{{content:"";position:absolute;left:0;right:0;bottom:0;height:18px;background:repeating-linear-gradient(-45deg,#F7B500 0 22px,#0F1C2E 22px 44px)}}
.og .lg{{height:74px}}.og h1{{font-family:BC;font-weight:800;font-size:92px;line-height:.98;margin:46px 0 22px;max-width:740px}}
.og h1.w{{max-width:600px;font-size:84px}}.og p{{font-size:32px;margin:0;color:#DCE7F4;max-width:760px}}.og .pr{{display:inline-block;margin-top:28px;background:#F7B500;color:#0F1C2E;font-weight:700;font-size:30px;padding:10px 22px;border-radius:8px}}
.og .sg{{position:absolute;right:80px;top:150px;width:270px;height:270px;background:#fff;border-radius:28px;display:grid;place-items:center;box-shadow:0 30px 60px -30px rgba(0,0,0,.6)}}.og .sg svg{{width:200px;height:200px}}
.board8{{position:absolute;right:70px;top:120px;width:380px;background:#fff;border-radius:26px;padding:28px;display:grid;grid-template-columns:repeat(4,1fr);gap:22px}}.board8 svg{{width:70px;height:70px}}"""

def og_html(title, sub, dom=None, prix=None):
    import re
    logo = re.sub(r' width="[^"]+" height="[^"]+"', '', L.full_lockup("negatif")[0], count=1)
    right = ""
    if dom:
        d = next(x for x in C.DOMAINES if x["slug"] == dom)
        right = f'<div class="sg">{sign(d["shape"], d["color"], d["icon"])}</div>'
    else:
        right = '<div class="board8">' + "".join(sign(d["shape"], d["color"], d["icon"]) for d in C.DOMAINES) + "</div>"
    pr = f'<div class="pr">{prix}</div>' if prix else ""
    return f'<html><head><meta charset="utf-8"><style>{CSS}</style></head><body><div class="og"><div class="lg">{logo.replace("<svg ", "<svg height=74 ")}</div><h1{' class="w"' if not dom else ''}>{title}</h1><p>{sub}</p>{pr}{right}</div></body></html>'

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=os.environ.get("CHROME_PATH") or None, args=["--no-sandbox"])
        pg = await b.new_page(viewport={"width": 1200, "height": 630})
        jobs = [("og-default.png", og_html("Formez vos équipes à la sécurité au travail", "22 formations certifiantes à Engis, Charleroi ou en entreprise"))]
        for f in C.FORMATIONS:
            prix = f"{f['prix']} € HTVA" if f["prix"] else None
            jobs.append((f"og/{f['slug']}.png", og_html(f["title"], f["pitch"], f["domain"], prix)))
        for name, h in jobs:
            tmp = os.path.join(SITE, "_og.html"); open(tmp, "w").write(h)
            await pg.goto("file://" + tmp); await pg.wait_for_timeout(200)
            await pg.screenshot(path=os.path.join(SITE, "assets", "img", name), clip={"x": 0, "y": 0, "width": 1200, "height": 630})
        # icônes
        for size, name, src in [(32, "favicon-32.png", L.favicon()), (180, "apple-touch-icon.png", None), (192, "icon-192.png", None), (512, "icon-512.png", None)]:
            if src is None:
                pad = int(size * 0.12)
                src = f'<div style="width:{size}px;height:{size}px;background:#fff;display:grid;place-items:center"><div style="width:{size-2*pad}px;height:{size-2*pad}px">{L.symbol_svg("couleur", size-2*pad)}</div></div>'
            await pg.set_viewport_size({"width": size, "height": size})
            await pg.set_content(f'<html><body style="margin:0;background:transparent">{src.replace("<svg ", f"<svg width={size} height={size} ") if src.startswith("<svg") else src}</body></html>')
            await pg.screenshot(path=os.path.join(SITE, name), omit_background=True, clip={"x": 0, "y": 0, "width": size, "height": size})
        # logo PNG pour Schema.org et pack logo
        for fn, w, bg in [("cfs-logo-signature-couleur", 1600, None), ("cfs-logo-signature-negatif", 1600, "#0D4A8C"), ("cfs-symbole-couleur", 1024, None), ("cfs-logo-vertical-couleur", 1000, None), ("cfs-logo-horizontal-couleur", 1400, None)]:
            svg = open(os.path.join(LOGO, fn + ".svg")).read()
            import re
            vb = list(map(float, re.search(r'viewBox="([^"]+)"', svg).group(1).split()))
            h = int(w * vb[3] / vb[2])
            await pg.set_viewport_size({"width": w, "height": h})
            svg2 = re.sub(r'width="[^"]+" height="[^"]+"', f'width="{w}" height="{h}"', svg, count=1)
            await pg.set_content(f'<html><body style="margin:0;background:{bg or "transparent"}">{svg2}</body></html>')
            await pg.screenshot(path=os.path.join(LOGO, fn + ".png"), omit_background=bg is None, clip={"x": 0, "y": 0, "width": w, "height": h})
        os.remove(os.path.join(SITE, "_og.html"))
        import shutil
        shutil.copy(os.path.join(LOGO, "cfs-logo-signature-couleur.png"), os.path.join(SITE, "assets", "img", "logo-cfs.png"))
        await b.close()
asyncio.run(main())
