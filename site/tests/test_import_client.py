"""Tests of site/tools/import_client.py (client CSV import, checks and generated files).

    python3 -m pytest site/tests -q

Each test points the importer at a temporary client/ folder: the real client/ folder is never read or written,
except by the last test, which only checks that a dry run leaves it untouched.
"""
import hashlib
import json
import os
import shutil
import sys
from datetime import date

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, "site", "tools"))
import import_client as ic  # noqa: E402

TODAY = date(2026, 11, 27)
FORMATIONS_HEADER = "slug;domaine;titre;prix_htva;duree;horaires;capacite_defaut;reservable_en_ligne;lieux;validite;source\n"
SESSIONS_HEADER = "id;formation;debut;fin;heure_debut;heure_fin;lieu;capacite;langue;statut;publiee;source\n"


@pytest.fixture
def client(tmp_path, monkeypatch):
    """Empty temporary client/ folder used by the importer."""
    folder = tmp_path / "client"
    folder.mkdir()
    monkeypatch.setattr(ic, "CLIENT", str(folder))
    return folder


def write(folder, name, text):
    (folder / name).write_text(text, encoding="utf-8")


def test_formations_prices_capacity_and_missing_rows(client):
    write(client, "formations.csv", FORMATIONS_HEADER
          + "vca-base;vca;VCA Base;250;1 jour (8 h);;12;oui;engis charleroi intra;10 ans;test\n"
          + "ba4;electricite;BA4;275,50 €;1 jour;;;non;engis intra;;test\n")
    rep = ic.Report()
    data = ic.import_formations(rep)
    assert rep.errors == []
    assert data["vca-base"] == {"prix": 250.0, "capacite": 12, "reservable": True}
    assert data["ba4"] == {"prix": 275.5, "capacite": None, "reservable": False}
    # Every known training exists, the missing ones are « sur devis » without capacity (nothing invented)
    assert set(data) == set(ic.KNOWN)
    assert data["amiante"] == {"prix": None, "capacite": None, "reservable": True}
    assert any("amiante absente du fichier" in w for w in rep.warnings)


@pytest.mark.parametrize("line, message", [
    ("inconnue;vca;X;10;;;;oui;engis;;t", "inconnue du site"),
    ("vca-base;incendie;VCA;10;;;;oui;engis charleroi intra;;t", "différent de celui du site"),
    ("vca-base;vca;VCA;dix euros;;;;oui;engis charleroi intra;;t", "prix HTVA illisible"),
    ("vca-base;vca;VCA;10;;;0;oui;engis charleroi intra;;t", "capacité par défaut illisible"),
    ("vca-base;vca;VCA;10;;;;peut-être;engis charleroi intra;;t", "oui ou non"),
    ("vca-base;vca;VCA;10;;;;oui;liege;;t", "lieux inconnus"),
])
def test_formations_errors_are_reported_not_guessed(client, line, message):
    write(client, "formations.csv", FORMATIONS_HEADER + line + "\n")
    rep = ic.Report()
    ic.import_formations(rep)
    assert any(message in e for e in rep.errors), rep.errors


def test_formations_duplicate_row(client):
    row = "vca-base;vca;VCA Base;250;1 jour (8 h);;;oui;engis charleroi intra;;t\n"
    write(client, "formations.csv", FORMATIONS_HEADER + row + row)
    rep = ic.Report()
    ic.import_formations(rep)
    assert any("en double" in e for e in rep.errors)


def test_missing_files_only_warn(client):
    rep = ic.Report()
    formations = ic.import_formations(rep)
    sessions = ic.import_sessions(rep, formations, TODAY)
    salles = ic.import_salles(rep)
    assert rep.errors == []
    assert sessions == [] and salles == []
    assert all(v["prix"] is None for v in formations.values())
    assert len(rep.warnings) == 3


def test_sessions_import_ids_capacity_and_past_sessions(client):
    write(client, "sessions.csv", SESSIONS_HEADER
          + ";vca-base;2026-12-10;;08:30;17:00;charleroi;10;fr;Ouverte;oui;t\n"
          + ";vca-ligne-hierarchique;14/12/2026;15/12/2026;8h30;17h;engis;;fr;Ouverte;oui;t\n"
          + ";ba4;2026-11-20;;08:30;16:30;engis;;fr;Ouverte;oui;t\n"
          + "ma-session;ba5;2026-12-07;;;;en entreprise;8;nl;Annulée;non;t\n")
    rep = ic.Report()
    formations = {"vca-ligne-hierarchique": {"capacite": 15}}
    sessions = ic.import_sessions(rep, formations, TODAY)
    assert rep.errors == []
    by_id = {s["id"]: s for s in sessions}
    assert set(by_id) == {"2026-12-10-vca-base-charleroi", "2026-12-14-vca-ligne-hierarchique-engis", "ma-session"}
    assert by_id["2026-12-10-vca-base-charleroi"]["capacity"] == 10
    cadre = by_id["2026-12-14-vca-ligne-hierarchique-engis"]
    assert (cadre["date"], cadre["endDate"], cadre["startTime"], cadre["endTime"]) == ("2026-12-14", "2026-12-15", "08:30", "17:00")
    assert cadre["capacity"] == 15  # default capacity of the training
    assert by_id["ma-session"]["location"] == "intra" and by_id["ma-session"]["status"] == "cancelled"
    assert any("session passée" in x for x in rep.infos)


@pytest.mark.parametrize("line, message", [
    (";formation-x;2026-12-10;;;;engis;;fr;Ouverte;oui;t", "inconnue"),
    (";vca-base;2026-02-30;;;;engis;;fr;Ouverte;oui;t", "date de début illisible"),
    (";vca-base;2026-12-10;2026-12-09;;;engis;;fr;Ouverte;oui;t", "date de fin est avant"),
    (";vca-base;2026-12-10;;17:00;08:30;engis;;fr;Ouverte;oui;t", "heures"),
    (";vca-base;2026-12-10;;;;namur;;fr;Ouverte;oui;t", "lieu"),
    (";vca-base;2026-12-10;;;;engis;-3;fr;Ouverte;oui;t", "capacité"),
    (";vca-base;2026-12-10;;;;engis;;xx;Ouverte;oui;t", "langue"),
    (";vca-base;2026-12-10;;;;engis;;fr;Complète;oui;t", "statut"),
    ("Mauvais ID!;vca-base;2026-12-10;;;;engis;;fr;Ouverte;oui;t", "identifiant"),
])
def test_session_errors_skip_the_line(client, line, message):
    write(client, "sessions.csv", SESSIONS_HEADER + line + "\n")
    rep = ic.Report()
    sessions = ic.import_sessions(rep, {}, TODAY)
    assert sessions == []
    assert any(message in e for e in rep.errors), rep.errors


def test_session_without_capacity_is_a_warning(client):
    write(client, "sessions.csv", SESSIONS_HEADER + ";vca-base;2026-12-10;;08:30;17:00;charleroi;;fr;Ouverte;oui;t\n")
    rep = ic.Report()
    sessions = ic.import_sessions(rep, {}, TODAY)
    assert sessions[0]["capacity"] is None
    assert any("capacité manquante" in w for w in rep.warnings)


def test_salles_prices(client):
    write(client, "salles.csv", "salle;capacite;tarif_demi_journee_htva;tarif_journee_htva;tarif_semaine_htva;equipement\n"
          "Salle 1;10;90;150;;Écran 4K\nSalle 2;15;;;;Wi-Fi\n")
    rep = ic.Report()
    salles = ic.import_salles(rep)
    assert salles[0] == {"name": "Salle 1", "cap": 10, "prices": {"demi_journee": 90.0, "journee": 150.0, "semaine": None}}
    assert any("Salle 2" in w and "sur demande" in w for w in rep.warnings)


def test_fallback_file_never_contains_remaining_places(tmp_path):
    sessions = [
        {"id": "a-1", "training": "vca-base", "date": "2026-12-10", "endDate": None, "startTime": "08:30", "endTime": "17:00",
         "location": "charleroi", "language": "fr", "capacity": 10, "status": "open", "published": True},
        {"id": "b-1", "training": "ba4", "date": "2026-12-07", "endDate": None, "startTime": None, "endTime": None,
         "location": "engis", "language": "fr", "capacity": None, "status": "open", "published": False},
        {"id": "c-1", "training": "ba5", "date": "2026-12-07", "endDate": None, "startTime": None, "endTime": None,
         "location": "engis", "language": "fr", "capacity": 8, "status": "cancelled", "published": True},
    ]
    path = tmp_path / "sessions-data.js"
    n = ic.write_sessions_data(sessions, str(path))
    js = path.read_text(encoding="utf-8")
    assert n == 1  # unpublished and cancelled sessions are left out
    payload = json.loads(js[js.index("sessions: ") + len("sessions: "):js.index("};")].strip())
    assert [s["id"] for s in payload] == ["a-1"]
    assert "seatsLeft" not in js and "remaining" not in js and "published" not in payload[0]


def test_gas_seed_block_is_replaced_and_rest_untouched(tmp_path):
    gs = tmp_path / "reservations.gs"
    shutil.copy(os.path.join(ROOT, "apps-script", "reservations.gs"), gs)
    before = gs.read_text(encoding="utf-8")
    formations = {s: {"prix": None, "capacite": None, "reservable": True} for s in ic.KNOWN}
    formations["vca-base"] = {"prix": 250.0, "capacite": 10, "reservable": True}
    sessions = [{"training": "vca-base", "date": "2026-12-10", "endDate": None, "startTime": "08:30", "endTime": "17:00",
                 "location": "charleroi", "language": "fr", "capacity": 10, "published": True}]
    ic.write_gas_seed(formations, sessions, str(gs))
    after = gs.read_text(encoding="utf-8")
    a, b = before.index("/* @seed:start */"), before.index("/* @seed:end */")
    assert after[:a] == before[:a]
    assert after[after.index("/* @seed:end */"):] == before[b:]
    seed = after[a:after.index("/* @seed:end */")]
    assert '["vca-base", "VCA Base", "vca", 250.0' in seed
    assert '"capacity": 10' in seed and seed.count('"training"') == 1


def digest(folder):
    h = hashlib.sha256()
    for base, _, files in sorted(os.walk(folder)):
        for fn in sorted(files):
            p = os.path.join(base, fn)
            h.update(p.encode())
            h.update(open(p, "rb").read())
    return h.hexdigest()


def test_dry_run_on_real_client_folder_writes_nothing():
    """`--check` reads the real client/ folder, reports, and writes no file at all."""
    watched = [os.path.join(ROOT, "client"), os.path.join(ROOT, "docs"), os.path.join(ROOT, "site", "content"), os.path.join(ROOT, "apps-script")]
    before = [digest(p) for p in watched]
    rep = ic.run(check_only=True, today=TODAY, quiet=True)[0]
    assert [digest(p) for p in watched] == before
    assert rep.errors == [], rep.errors
