"""Icônes d'interface (traits 24 px) et pictogrammes de domaine façon ISO 7010."""

_UI = {
    "phone": '<path d="M5 4h3l2 5-2.5 1.5a11 11 0 0 0 6 6L15 14l5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
    "mail": '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    "pin": '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    "clock": '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    "calendar": '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    "euro": '<path d="M17 6.5A7 7 0 1 0 17 17.5M4 10.5h9M4 13.5h9"/>',
    "check": '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    "check-circle": '<circle cx="12" cy="12" r="9"/><path d="m8 12.3 2.8 2.8L16.5 9"/>',
    "arrow": '<path d="M5 12h14M13 6l6 6-6 6"/>',
    "chevron": '<path d="m6 9 6 6 6-6"/>',
    "menu": '<path d="M4 7h16M4 12h16M4 17h16"/>',
    "close": '<path d="M6 6l12 12M18 6 6 18"/>',
    "plus": '<path d="M12 5v14M5 12h14"/>',
    "globe": '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    "users": '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14a6.5 6.5 0 0 1 3.5 6"/>',
    "building": '<path d="M4 21V5l8-2v18M12 8h8v13M8 8v.01M8 12v.01M8 16v.01M16 12v.01M16 16v.01M2 21h20"/>',
    "shield": '<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.4 7.5 9.5 4.3-1.1 7.5-4.9 7.5-9.5V6z"/><path d="m8.8 12 2.3 2.3 4.2-4.3"/>',
    "award": '<circle cx="12" cy="9" r="6"/><path d="m8.5 14 -1.5 7 5-3 5 3-1.5-7"/>',
    "hourglass": '<path d="M6 3h12M6 21h12M7 3c0 5 10 5 10 9s-10 4-10 9M17 3c0 5-10 5-10 9s10 4 10 9"/>',
    "search": '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    "info": '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.01"/>',
    "scale": '<path d="M12 3v18M7 21h10M5 7h14M5 7l-3 7a3 3 0 0 0 6 0zM19 7l-3 7a3 3 0 0 0 6 0z"/>',
    "screen": '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M8 20h8M12 16v4"/>',
    "wifi": '<path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.8 16a4.8 4.8 0 0 1 6.4 0M12 19.5v.01"/>',
    "target": '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    "flash": '<path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12z"/>',
    "doc": '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
    "photo": '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 8"/>',
    "alert": '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17v.01"/>',
    "linkedin": '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 10v7M8 7v.01M12 17v-4a2 2 0 0 1 4 0v4M12 10v7"/>',
    "instagram": '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.5 6.5v.01"/>',
    "facebook": '<path d="M14 21v-8h3l.5-3.5H14V7.5c0-1 .4-1.8 1.8-1.8H18V2.6A22 22 0 0 0 15.4 2.5C12.8 2.5 11 4 11 7v2.5H8V13h3v8"/>',
    "tiktok": '<path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5M14 3c.5 2.6 2.4 4.4 5 4.6"/>',
    "print": '<path d="M7 9V3h10v6M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M7 14h10v7H7z"/>',
}


def icon(name, cls="", label=None):
    a11y = f'role="img" aria-label="{label}"' if label else 'aria-hidden="true" focusable="false"'
    c = f' class="{cls}"' if cls else ""
    return (f'<svg{c} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
            f'stroke-linecap="round" stroke-linejoin="round" {a11y}>{_UI[name]}</svg>')


# Pictogrammes de domaine, dessinés dans une grille de 24 unités.
# Classes : .f = remplissage pictogramme, .s = trait pictogramme, .cut = découpe couleur du panneau
_PICTO = {
    "casque": '<path class="f" d="M3.6 15.6C3.6 9.6 7.3 5.4 12.4 5.4s8.6 4.2 8.6 10.2z"/><path class="f" d="M1.8 15.2h20.9a1.4 1.4 0 0 1 0 2.8H3.2a1.4 1.4 0 0 1-1.4-1.4z"/><path class="cutline" d="M12.4 6v9.2M8.6 7.6l1.6 7.4M16.2 7.6l-1.6 7.4"/>',
    "dossier": '<rect class="f" x="5" y="4.2" width="14" height="17" rx="2"/><rect class="f" x="8.5" y="2.6" width="7" height="3.6" rx="1.2"/><path class="cutline" d="m8.6 13.4 2.4 2.4 4.6-5"/>',
    "flamme": '<path class="f" d="M12.2 1.8c1.7 3.9 6.3 6.6 6.3 12.6a6.5 6.5 0 0 1-13 0c0-2.8 1.3-4.8 2.8-6.2.1 1.9.9 3.1 2.2 3.7C10 8 10.6 4.8 12.2 1.8z"/><path class="cf" d="M12 13.2c1 1.6 2.8 2.6 2.8 4.6a2.8 2.8 0 0 1-5.6 0c0-1.8 1.7-2.9 2.8-4.6z"/>',
    "croix": '<path class="f" d="M9.4 3.5h5.2v5.9h5.9v5.2h-5.9v5.9H9.4v-5.9H3.5V9.4h5.9z"/>',
    "eclair": '<path class="f" d="M13.6 1.8 5 13.6h6.1l-1.3 8.6 9.2-12.4h-6.2z"/>',
    "flacon": '<path class="s" d="M9 3h6M10.2 3.4v5.4L5 17.8A2.2 2.2 0 0 0 6.9 21h10.2a2.2 2.2 0 0 0 1.9-3.2l-5.2-9V3.4"/><path class="f" d="M7.4 15h9.2l2.1 3.6a1.2 1.2 0 0 1-1 1.8H6.3a1.2 1.2 0 0 1-1-1.8z"/>',
    "posture": '<circle class="f" cx="6.6" cy="4.4" r="2.3"/><path class="s" d="M7 8.4l1.2 6.4h5.4v5.6M7.8 10.6l4.6 1.6"/><path class="s" d="M3.6 8.8l1.4 7.6 1 4"/><rect class="f" x="15" y="4.4" width="7" height="5.2" rx=".8"/><path class="s" d="M18.5 9.6v2.6M12.4 12.2h9.4"/>',
    "crochet": '<rect class="f" x="15.2" y="2.4" width="2.2" height="17.2" rx=".6"/><rect class="f" x="17" y="16.6" width="5.6" height="2" rx=".6"/><path class="f" d="M1.8 17.4v-6.6L5.6 6h5.8l1.8 4.8h2v6.6z"/><path class="cf" d="M7 7.8h3.6l1.1 3H5.2z"/><circle class="f" cx="5.6" cy="18.4" r="2.6"/><circle class="f" cx="12" cy="18.4" r="2.6"/><circle class="cf" cx="5.6" cy="18.4" r=".9"/><circle class="cf" cx="12" cy="18.4" r=".9"/>',
}


HEX = {"bleu": "#0D4A8C", "rouge": "#C8241C", "vert": "#0B7F4E", "jaune": "#F7B500", "encre": "#0F1C2E"}


def sign(shape, color, picto, cls="sign", label=None):
    """Panneau : cercle bleu (obligation), carré rouge/vert (incendie/secours), triangle jaune (avertissement).
    Couleurs en attributs de présentation : compatibles CSP stricte et utilisables hors du site (PDF, e-mails)."""
    a11y = f'role="img" aria-label="{label}"' if label else 'aria-hidden="true" focusable="false"'
    if shape == "triangle":
        base = (f'<path class="bg-jaune" fill="{HEX["jaune"]}" stroke="{HEX["encre"]}" stroke-width="3" stroke-linejoin="round" '
                f'd="M24 5.5 44.2 40.8a1.6 1.6 0 0 1-1.4 2.4H5.2a1.6 1.6 0 0 1-1.4-2.4L24 5.5z"/>')
        g = 'transform="translate(13.2 17.4) scale(.9)"'
        fg, cut = HEX["encre"], HEX["jaune"]
    elif shape == "carre":
        base = f'<rect class="bg-{color}" fill="{HEX[color]}" x="3" y="3" width="42" height="42" rx="5"/>'
        g = 'transform="translate(9 9) scale(1.25)"'
        fg, cut = "#fff", HEX[color]
    else:
        base = f'<circle class="bg-{color}" fill="{HEX[color]}" cx="24" cy="24" r="21.5"/>'
        g = 'transform="translate(9.6 9.6) scale(1.2)"'
        fg, cut = "#fff", HEX[color]
    p = (_PICTO[picto]
         .replace('class="cutline"', f'fill="none" stroke="{cut}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"')
         .replace('class="cf"', f'fill="{cut}"')
         .replace('class="f"', f'fill="{fg}"')
         .replace('class="s"', f'fill="none" stroke="{fg}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"'))
    return f'<svg class="{cls}" viewBox="0 0 48 48" {a11y}>{base}<g {g}>{p}</g></svg>'
