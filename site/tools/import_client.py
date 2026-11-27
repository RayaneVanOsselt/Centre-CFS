#!/usr/bin/env python3
"""Import et contrôle des fichiers fournis par le Centre CFS (dossier client/, en lecture seule).

    python3 site/tools/import_client.py            # contrôle + génération
    python3 site/tools/import_client.py --check    # contrôle seulement (code de sortie 1 si erreur)

Lit client/formations.csv, client/sessions.csv et client/salles.csv, puis :
  1. écrit le rapport docs/RAPPORT-IMPORT.md (erreurs bloquantes et données manquantes) ;
  2. écrit site/content/client_data.json (prix HTVA, capacité par défaut, réservable en ligne, salles) ;
  3. écrit le fichier de secours site/src/assets/js/sessions-data.js (sessions publiées, capacité seule,
     JAMAIS de places restantes) ;
  4. met à jour le bloc « @seed » d'apps-script/reservations.gs (formations et sessions installées dans la feuille).

Règle : rien n'est deviné. Une incohérence (formation inconnue, date impossible…) est une ERREUR signalée, et la
ligne fautive n'est pas importée. Une donnée vide (prix, capacité) est un AVERTISSEMENT : le site affiche
« Sur devis » / « Places : nous consulter » et la feuille ne publie pas une session sans capacité.
"""
import csv
import io
import json
import os
import re
import sys
from datetime import date

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "site"))
from content import common  # noqa: E402
from content import fr as FR  # noqa: E402

CLIENT = os.path.join(ROOT, "client")
KNOWN = {f["slug"]: f for f in common.FORMATIONS}
DOMAINS = {d["slug"] for d in common.DOMAINES}
LIEUX = {"engis", "charleroi", "intra"}
LIEU_ALIASES = {"engis": "engis", "charleroi": "charleroi", "intra": "intra", "en entreprise": "intra", "entreprise": "intra", "dans votre entreprise": "intra"}
LANGS = set(common.LANG_CODES)
YES = {"oui", "o", "x", "1", "true", "vrai", "yes"}
NO = {"non", "n", "0", "false", "faux", "no", ""}
SESSION_STATUSES = {"ouverte": "open", "fermée": "closed", "fermee": "closed", "annulée": "cancelled", "annulee": "cancelled", "": "open"}


class Report:
    def __init__(self):
        self.errors, self.warnings, self.infos = [], [], []

    def error(self, where, msg):
        self.errors.append(f"{where} : {msg}")

    def warn(self, where, msg):
        self.warnings.append(f"{where} : {msg}")

    def info(self, msg):
        self.infos.append(msg)


def read_csv(name):
    """Lit un CSV (séparateur « ; » ou « , », UTF-8 avec ou sans BOM). Renvoie (lignes, None) ou (None, raison)."""
    path = os.path.join(CLIENT, name)
    if not os.path.exists(path):
        return None, "fichier absent"
    raw = open(path, encoding="utf-8-sig").read()
    first = raw.splitlines()[0] if raw.strip() else ""
    delim = ";" if first.count(";") >= first.count(",") else ","
    rows = list(csv.DictReader(io.StringIO(raw), delimiter=delim))
    return [{(k or "").strip().lower(): (v or "").strip() for k, v in r.items()} for r in rows], None


def parse_date(s):
    s = (s or "").strip()
    m = re.fullmatch(r"(\d{4})-(\d{1,2})-(\d{1,2})", s) or None
    if m:
        y, mo, d = map(int, m.groups())
    else:
        m = re.fullmatch(r"(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})", s)
        if not m:
            return None
        d, mo, y = map(int, m.groups())
    try:
        return date(y, mo, d)
    except ValueError:
        return None


def parse_time(s):
    """« 08:30 », « 8h30 », « 8 h 30 » ou « 17h » → « HH:MM » ; None si illisible."""
    s = (s or "").strip().lower().replace(" ", "").replace("h", ":").rstrip(":")
    m = re.fullmatch(r"(\d{1,2})(?::(\d{2}))?", s)
    if not m:
        return None
    h, mi = int(m.group(1)), int(m.group(2) or 0)
    return f"{h:02d}:{mi:02d}" if h <= 23 and mi <= 59 else None


def parse_money(s):
    s = (s or "").replace("€", "").replace(" ", "").replace(",", ".").strip()
    if not s:
        return None
    try:
        v = round(float(s), 2)
    except ValueError:
        return False
    return v if v > 0 else False


def parse_int(s):
    s = (s or "").strip()
    if not s:
        return None
    return int(s) if re.fullmatch(r"\d+", s) else False


def import_formations(rep):
    rows, why = read_csv("formations.csv")
    data = {}
    if rows is None:
        rep.warn("formations.csv", f"{why} : aucun prix ni capacité (le site affiche « Sur devis »)")
        return {s: {"prix": None, "capacite": None, "reservable": True} for s in KNOWN}
    seen = set()
    for i, r in enumerate(rows, start=2):
        where = f"formations.csv ligne {i}"
        slug = r.get("slug", "")
        if slug not in KNOWN:
            rep.error(where, f"formation « {slug} » inconnue du site (identifiants : site/content/common.py)")
            continue
        if slug in seen:
            rep.error(where, f"« {slug} » est en double")
            continue
        seen.add(slug)
        if r.get("domaine") and r["domaine"] not in DOMAINS:
            rep.error(where, f"domaine « {r['domaine']} » inconnu")
        elif r.get("domaine") and r["domaine"] != KNOWN[slug]["domain"]:
            rep.error(where, f"domaine « {r['domaine']} » différent de celui du site ({KNOWN[slug]['domain']})")
        prix = parse_money(r.get("prix_htva"))
        if prix is False:
            rep.error(where, f"prix HTVA illisible « {r.get('prix_htva')} » (exemple : 250)")
            prix = None
        elif prix is None:
            rep.warn(where, f"{slug} : prix HTVA vide → « Sur devis » (pas de paiement en ligne)")
        cap = parse_int(r.get("capacite_defaut"))
        if cap is False or (cap is not None and not 1 <= cap <= 500):
            rep.error(where, f"capacité par défaut illisible « {r.get('capacite_defaut')} » (entier de 1 à 500)")
            cap = None
        elif cap is None:
            rep.warn(where, f"{slug} : capacité par défaut vide")
        book = r.get("reservable_en_ligne", "oui").lower()
        if book not in YES | NO:
            rep.error(where, f"réservable en ligne « {book} » : oui ou non")
            book = "oui"
        lieux = [LIEU_ALIASES.get(x.strip().lower(), x.strip().lower()) for x in re.split(r"[ ,]+", r.get("lieux", "")) if x.strip()]
        if lieux and set(lieux) - LIEUX:
            rep.error(where, f"lieux inconnus : {', '.join(sorted(set(lieux) - LIEUX))}")
        elif lieux and set(lieux) != set(KNOWN[slug]["lieux"]):
            rep.warn(where, f"{slug} : lieux du fichier ({' '.join(lieux)}) différents du site ({' '.join(KNOWN[slug]['lieux'])}) — le site garde les siens")
        fr_duree = FR.FORMATIONS[slug]["duree"]
        if r.get("duree") and fr_duree and r["duree"] != fr_duree:
            rep.warn(where, f"{slug} : durée « {r['duree']} » ≠ texte du site « {fr_duree} » (à harmoniser)")
        data[slug] = {"prix": prix, "capacite": cap, "reservable": book in YES}
    for slug in KNOWN:
        if slug not in data:
            rep.warn("formations.csv", f"{slug} absente du fichier : sur devis, sans capacité")
            data[slug] = {"prix": None, "capacite": None, "reservable": True}
    return data


def import_sessions(rep, formations, today):
    rows, why = read_csv("sessions.csv")
    out = []
    if rows is None:
        rep.warn("sessions.csv", f"{why} : aucune session de secours")
        return out
    ids = set()
    for i, r in enumerate(rows, start=2):
        where = f"sessions.csv ligne {i}"
        slug = r.get("formation", "")
        if slug not in KNOWN:
            rep.error(where, f"formation « {slug} » inconnue : session ignorée (à vérifier avec le Centre CFS)")
            continue
        start = parse_date(r.get("debut"))
        if not start:
            rep.error(where, f"date de début illisible « {r.get('debut')} » (AAAA-MM-JJ ou JJ/MM/AAAA)")
            continue
        end = parse_date(r.get("fin")) if r.get("fin") else None
        if r.get("fin") and not end:
            rep.error(where, f"date de fin illisible « {r.get('fin')} »")
            continue
        if end and end < start:
            rep.error(where, "la date de fin est avant la date de début")
            continue
        if end == start:
            end = None
        t1 = parse_time(r.get("heure_debut")) if r.get("heure_debut") else None
        t2 = parse_time(r.get("heure_fin")) if r.get("heure_fin") else None
        if (r.get("heure_debut") and not t1) or (r.get("heure_fin") and not t2) or (t1 and t2 and t2 <= t1) or (t2 and not t1):
            rep.error(where, "heures de début / fin illisibles ou incohérentes (HH:MM)")
            continue
        lieu = LIEU_ALIASES.get(r.get("lieu", "").lower())
        if not lieu:
            rep.error(where, f"lieu « {r.get('lieu')} » inconnu (engis, charleroi ou intra)")
            continue
        cap = parse_int(r.get("capacite"))
        if cap is False or (cap is not None and not 1 <= cap <= 500):
            rep.error(where, f"capacité « {r.get('capacite')} » illisible (entier de 1 à 500)")
            continue
        if cap is None:
            cap = formations.get(slug, {}).get("capacite")
        if cap is None:
            rep.warn(where, f"{slug} du {start.isoformat()} ({lieu}) : capacité manquante → la feuille ne la publie pas tant que « Places (total) » est vide ; le site de secours affiche « Places : nous consulter »")
        lang = (r.get("langue") or "fr").lower()
        if lang not in LANGS:
            rep.error(where, f"langue « {lang} » inconnue ({', '.join(sorted(LANGS))})")
            continue
        status = SESSION_STATUSES.get((r.get("statut") or "").strip().lower())
        if status is None:
            rep.error(where, f"statut « {r.get('statut')} » : Ouverte, Fermée ou Annulée")
            continue
        pub = (r.get("publiee") or "oui").lower()
        if pub not in YES | NO:
            rep.error(where, f"publiée « {pub} » : oui ou non")
            continue
        sid = r.get("id") or f"{start.isoformat()}-{slug}-{lieu}"
        if not re.fullmatch(r"[a-z0-9][a-z0-9-]{2,79}", sid):
            rep.error(where, f"identifiant « {sid} » invalide")
            continue
        if sid in ids:
            rep.error(where, f"identifiant « {sid} » en double")
            continue
        ids.add(sid)
        last = end or start
        if last < today:
            rep.info(f"{where} : session passée ({start.isoformat()}), ignorée")
            continue
        out.append({"id": sid, "training": slug, "date": start.isoformat(), "endDate": end.isoformat() if end else None,
                    "startTime": t1, "endTime": t2, "location": lieu, "language": lang, "capacity": cap,
                    "status": status, "published": pub in YES})
    return out


def import_salles(rep):
    rows, why = read_csv("salles.csv")
    if rows is None:
        rep.warn("salles.csv", f"{why} : tarifs « sur demande »")
        return []
    out = []
    for i, r in enumerate(rows, start=2):
        cap = parse_int(r.get("capacite"))
        prices = {}
        for k in ("tarif_demi_journee_htva", "tarif_journee_htva", "tarif_semaine_htva"):
            v = parse_money(r.get(k))
            if v is False:
                rep.error(f"salles.csv ligne {i}", f"{k} illisible « {r.get(k)} »")
                v = None
            prices[k.split("_", 1)[1].replace("_htva", "")] = v
        if not any(prices.values()):
            rep.warn(f"salles.csv ligne {i}", f"{r.get('salle')} : tarifs vides → « sur demande »")
        out.append({"name": r.get("salle", ""), "cap": cap or None, "prices": prices})
    return out


def write_sessions_data(sessions, path):
    pub = [{k: v for k, v in s.items() if k != "published"} for s in sessions if s["published"] and s["status"] != "cancelled"]
    body = json.dumps(pub, ensure_ascii=False, indent=2)
    js = f"""/* =========================================================================
   Centre CFS — sessions de SECOURS (généré par site/tools/import_client.py depuis client/sessions.csv)
   Ne pas modifier à la main : modifier client/sessions.csv puis relancer `npm run import:client`.

   Utilisé seulement si la feuille de réservation ne répond pas (ou n'est pas encore branchée).
   Capacité seule, JAMAIS de places restantes : seules les places calculées par la feuille sont « en direct ».
   ========================================================================= */
(function (root) {{
  "use strict";
  var data = {{ generatedAt: "{date.today().isoformat()}", sessions: {body} }};
  if (typeof module === "object" && module.exports) module.exports = data;
  root.CFS_SESSIONS_FALLBACK = data;
}})(typeof self !== "undefined" ? self : this);
"""
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(js)
    return len(pub)


def js_literal(v):
    return json.dumps(v, ensure_ascii=False)


def write_gas_seed(formations, sessions, gs_path):
    lines = ["/* @seed:start */", "/* Généré par site/tools/import_client.py — ne pas modifier à la main. */",
             "/* [identifiant, nom, domaine, prix HTVA (null = sur devis), durée, capacité par défaut, réservable en ligne] */",
             "var FORMATIONS = ["]
    for f in common.FORMATIONS:
        slug = f["slug"]
        d = formations[slug]
        row = [slug, FR.FORMATIONS[slug]["title"], f["domain"], d["prix"], FR.FORMATIONS[slug]["duree"] or "", d["capacite"], d["reservable"]]
        lines.append("  " + js_literal(row) + ",")
    lines[-1] = lines[-1].rstrip(",")
    lines.append("];")
    lines.append("/* Sessions de client/sessions.csv, ajoutées par « Installer » seulement si l'onglet Sessions est vide. */")
    lines.append("var SEED_SESSIONS = [")
    for s in sessions:
        seed = {"training": s["training"], "date": s["date"], "endDate": s["endDate"], "start": s["startTime"], "end": s["endTime"],
                "location": s["location"], "language": s["language"], "capacity": s["capacity"], "published": s["published"]}
        lines.append("  " + js_literal(seed) + ",")
    if lines[-1].endswith(","):
        lines[-1] = lines[-1].rstrip(",")
    lines.append("];")
    lines.append("/* @seed:end */")
    src = open(gs_path, encoding="utf-8").read()
    a, b = src.index("/* @seed:start */"), src.index("/* @seed:end */") + len("/* @seed:end */")
    new = src[:a] + "\n".join(lines) + src[b:]
    if new != src:
        with open(gs_path, "w", encoding="utf-8") as fh:
            fh.write(new)


def write_report(rep, formations, sessions, salles, path, today):
    priced = sum(1 for d in formations.values() if d["prix"])
    with_cap = sum(1 for s in sessions if s["capacity"])
    md = [f"# Rapport d'import des fichiers client ({today.isoformat()})", "",
          "Généré par `python3 site/tools/import_client.py`. Les fichiers de `client/` ne sont jamais modifiés.", "",
          "| Fichier | Résultat |", "|---|---|",
          f"| `formations.csv` | {len(formations)} formations, {priced} avec un prix HTVA |",
          f"| `sessions.csv` | {len(sessions)} session(s) à venir, {with_cap} avec une capacité |",
          f"| `salles.csv` | {len(salles)} salle(s) |", ""]
    md += ["## Erreurs (lignes non importées)", ""] + ([f"- {e}" for e in rep.errors] or ["Aucune."]) + [""]
    md += ["## Données manquantes (avertissements)", ""] + ([f"- {w}" for w in rep.warnings] or ["Aucune."]) + [""]
    if rep.infos:
        md += ["## Informations", ""] + [f"- {x}" for x in rep.infos] + [""]
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(md))


def run(check_only=False, today=None, quiet=False):
    today = today or date.today()
    rep = Report()
    formations = import_formations(rep)
    sessions = import_sessions(rep, formations, today)
    salles = import_salles(rep)
    if not check_only:
        with open(os.path.join(ROOT, "site", "content", "client_data.json"), "w", encoding="utf-8") as fh:
            json.dump({"formations": formations, "salles": salles}, fh, ensure_ascii=False, indent=2, sort_keys=True)
            fh.write("\n")
        n = write_sessions_data(sessions, os.path.join(ROOT, "site", "src", "assets", "js", "sessions-data.js"))
        rep.info(f"{n} session(s) publiée(s) dans le fichier de secours sessions-data.js")
        write_gas_seed(formations, sessions, os.path.join(ROOT, "apps-script", "reservations.gs"))
        write_report(rep, formations, sessions, salles, os.path.join(ROOT, "docs", "RAPPORT-IMPORT.md"), today)
    if not quiet:
        print(f"Import client : {len(rep.errors)} erreur(s), {len(rep.warnings)} avertissement(s).")
        for e in rep.errors:
            print("  ERREUR  " + e)
        for w in rep.warnings:
            print("  manque  " + w)
    return rep, formations, sessions, salles


if __name__ == "__main__":
    r = run(check_only="--check" in sys.argv)[0]
    sys.exit(1 if r.errors else 0)
