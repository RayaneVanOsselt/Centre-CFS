#!/bin/sh
# Contrôle de syntaxe de tous les fichiers JavaScript sans Node (macOS : moteur JavaScriptCore du système).
# En CI, « node --check » fait le même travail. Comme Node, chaque fichier est lu selon le package.json le plus proche :
# « "type": "module" » (racine du dépôt) → module ES strict, sans repli ; sinon script classique (CommonJS), qui ne peut
# pas contenir import/export. Usage : sh scripts/check-js-syntax.sh
JSC=/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc
[ -x "$JSC" ] || { echo "JavaScriptCore introuvable (macOS uniquement)"; exit 2; }

# Type du fichier selon Node : extension, puis package.json le plus proche
kind() {
  case "$1" in *.mjs) echo module; return;; *.cjs) echo script; return;; esac
  d=$(dirname "$1")
  while :; do
    if [ -f "$d/package.json" ]; then
      if grep -q '"type"[[:space:]]*:[[:space:]]*"module"' "$d/package.json"; then echo module; else echo script; fi
      return
    fi
    [ "$d" = "." ] || [ "$d" = "/" ] && { echo script; return; }
    d=$(dirname "$d")
  done
}

status=0
for f in $(git ls-files '*.js' '*.mjs' '*.cjs'; git ls-files --others --exclude-standard '*.js' '*.mjs' '*.cjs'); do
  case "$f" in site/src/assets/vendor/*) continue;; esac
  if [ "$(kind "$f")" = module ]; then
    out=$("$JSC" -e "try { checkModuleSyntax(readFile('$f')); } catch (e) { print('$f (module ES) : ' + e); }" 2>&1)
  else
    out=$("$JSC" -e "try { checkSyntax('$f'); } catch (e) { print('$f (script CommonJS) : ' + e); }" 2>&1)
  fi
  if [ -n "$out" ]; then echo "$out"; status=1; fi
done
# Apps Script : script classique (pas un module)
out=$("$JSC" -e "try { checkSyntax('apps-script/reservations.gs'); } catch (e) { print('apps-script/reservations.gs: ' + e); }" 2>&1)
if [ -n "$out" ]; then echo "$out"; status=1; fi
[ $status -eq 0 ] && echo "Syntaxe JavaScript : OK"
exit $status
