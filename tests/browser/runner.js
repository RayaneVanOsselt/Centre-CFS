// Lanceur des tests node:test dans le navigateur (voir index.html). Résultat aussi dans window.__results.
import { registry, setFile } from "node:test";
import { Buffer } from "./shims/buffer.js";
import { createHash } from "node:crypto";

globalThis.Buffer = Buffer;
globalThis.process = { env: {}, execPath: "", exit() {} };

/** Fichiers *.test.js trouvés dans les listes de dossiers du serveur local (python3 -m http.server). */
async function discover(dir = "/tests/") {
  const html = await (await fetch(dir)).text();
  const out = [];
  for (const [, href] of html.matchAll(/href="([^"]+)"/g)) {
    if (href.startsWith("?") || href.startsWith("/") || href.startsWith("..")) continue;
    if (href.endsWith("/") && href !== "browser/") out.push(...(await discover(dir + href)));
    else if (href.endsWith(".test.js")) out.push(dir + href);
  }
  return out;
}

const out = document.getElementById("out");
const sum = document.getElementById("sum");
const results = { passed: 0, failed: 0, skipped: 0, failures: [], done: false };
window.__results = results;

const selfCheck = createHash("sha256").update("abc").digest("hex");
if (selfCheck !== "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad") throw new Error("SHA-256 du banc d'essai incorrect");

const only = new URLSearchParams(location.search).get("file");
const files = (await discover()).filter((f) => !only || f.includes(only)).sort();
for (const f of files) {
  setFile(f);
  try {
    await import(f);
  } catch (e) {
    registry.push({ file: f, name: "(chargement du fichier)", fn: () => { throw e; }, skip: false });
  }
}

let section = null;
for (const t of registry) {
  if (!section || section.dataset.file !== t.file) {
    const h = document.createElement("h2");
    h.textContent = t.file;
    section = document.createElement("ul");
    section.dataset.file = t.file;
    out.append(h, section);
  }
  const li = document.createElement("li");
  if (t.skip) {
    results.skipped++;
    li.className = "skip";
    li.textContent = `○ ${t.name} (ignoré : ${t.skip === true ? "" : t.skip})`;
  } else {
    try {
      await t.fn();
      results.passed++;
      li.className = "ok";
      li.textContent = `✔ ${t.name}`;
    } catch (e) {
      results.failed++;
      results.failures.push({ file: t.file, name: t.name, error: String((e && e.stack) || e).slice(0, 1500) });
      li.className = "ko";
      li.textContent = `✘ ${t.name}`;
      const pre = document.createElement("pre");
      pre.textContent = String((e && e.stack) || e);
      li.append(pre);
    }
  }
  section.append(li);
  sum.textContent = `${results.passed} réussi(s), ${results.failed} échec(s), ${results.skipped} ignoré(s)…`;
}
results.done = true;
sum.textContent = `${results.passed} réussi(s), ${results.failed} échec(s), ${results.skipped} ignoré(s) sur ${registry.length} tests (${files.length} fichiers)`;
sum.className = "sum " + (results.failed ? "ko" : "ok");
