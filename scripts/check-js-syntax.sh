#!/bin/sh
# Contrôle de syntaxe de tous les fichiers JavaScript sans Node (macOS : moteur JavaScriptCore du système).
# En CI, « node --check » fait le même travail. Usage : sh scripts/check-js-syntax.sh
JSC=/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc
[ -x "$JSC" ] || { echo "JavaScriptCore introuvable (macOS uniquement)"; exit 2; }
status=0
for f in $(git ls-files '*.js' '*.mjs'; git ls-files --others --exclude-standard '*.js' '*.mjs'); do
  case "$f" in site/src/assets/vendor/*) continue;; esac
  out=$("$JSC" -e "try { checkModuleSyntax(readFile('$f')); } catch (e) { try { checkSyntax('$f'); } catch (e2) { print('$f: ' + e); } }" 2>&1)
  if [ -n "$out" ]; then echo "$out"; status=1; fi
done
# Apps Script : script classique (pas un module)
out=$("$JSC" -e "try { checkSyntax('apps-script/reservations.gs'); } catch (e) { print('apps-script/reservations.gs: ' + e); }" 2>&1)
if [ -n "$out" ]; then echo "$out"; status=1; fi
[ $status -eq 0 ] && echo "Syntaxe JavaScript : OK"
exit $status
