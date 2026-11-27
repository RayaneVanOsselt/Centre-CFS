"""Règles d'architecture contrôlées sur le code du navigateur (mission, sections 3 et 19).

- Le navigateur n'appelle jamais EmailJS ni Apps Script (ils sont derrière le Worker).
- Aucune clé secrète ni nom de secret côté navigateur.
- « Merci… Référence » n'est affiché qu'avec ok: true (le code d'envoi le vérifie explicitement).
"""
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
JS = os.path.join(ROOT, "site", "src", "assets", "js")
SECRETS = ["RESERVATIONS_HMAC_SECRET", "RESERVATIONS_API_URL", "SUPABASE_SECRET_KEY", "MOLLIE_API_KEY", "EMAILJS_PRIVATE_KEY",
           "SUPABASE_EMAIL_HOOK_SECRET", "ANTHROPIC_API_KEY", "IP_HASH_SALT", "TURNSTILE_SECRET_KEY"]


def browser_sources():
    for root, _, files in os.walk(JS):
        if os.sep + "vendor" in root:
            continue
        for f in files:
            if f.endswith(".js"):
                path = os.path.join(root, f)
                yield os.path.relpath(path, ROOT), open(path, encoding="utf-8").read()


def test_no_emailjs_or_apps_script_in_browser_code():
    for name, src in browser_sources():
        assert "api.emailjs.com" not in src, name
        assert "@emailjs" not in src, name
        assert "script.google.com" not in src, name


def test_no_secret_names_in_browser_code():
    for name, src in browser_sources():
        for s in SECRETS:
            assert s not in src, f"{s} dans {name}"


def test_success_message_requires_ok_true():
    forms = open(os.path.join(JS, "forms.js"), encoding="utf-8").read()
    reg = open(os.path.join(JS, "registration.js"), encoding="utf-8").read()
    assert re.search(r"data\.ok !== true\) throw", forms), "forms.js doit refuser toute réponse sans ok: true"
    assert re.search(r"if \(data\.ok !== true\)", reg), "registration.js doit refuser toute réponse sans ok: true"
