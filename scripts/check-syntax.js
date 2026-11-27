// Contrôle de syntaxe de tous les fichiers JavaScript du dépôt (node --check), y compris le moteur Apps Script.
// Usage : npm run check:js   (sans Node sur macOS : sh scripts/check-js-syntax.sh)
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "*.js", "*.mjs"], { encoding: "utf8" })
  .split("\n").filter((f) => f && !f.startsWith("site/src/assets/vendor/") && fs.existsSync(f));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gs-"));
const gs = path.join(tmp, "reservations.cjs");
fs.copyFileSync("apps-script/reservations.gs", gs);
let failed = 0;
for (const f of [...files, gs]) {
  try {
    execFileSync(process.execPath, ["--check", f], { stdio: "pipe" });
  } catch (e) {
    failed++;
    console.error(String(e.stderr || e.message));
  }
}
console.log(failed ? `${failed} fichier(s) en erreur` : `Syntaxe JavaScript : OK (${files.length + 1} fichiers)`);
process.exit(failed ? 1 : 0);
