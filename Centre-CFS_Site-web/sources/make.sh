#!/bin/sh
# Reconstruit le site complet : pages HTML puis images (favicons, Open Graph)
set -e
cd "$(dirname "$0")"
python3 logo.py >/dev/null
python3 build.py
python3 render_assets.py
