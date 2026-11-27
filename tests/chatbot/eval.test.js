/* Assistant : batterie de questions (mission 8.10). Prérequis : python3 site/build.py (bases dist/assets/data/kb.*.json).
   Seuils : 100 % sur les règles de véracité, 90 % au moins sur l'intention et l'adresse attendues. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluate } from "./evaluate.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
const kbs = { fr: read("dist/assets/data/kb.fr.json"), nl: read("dist/assets/data/kb.nl.json"), en: read("dist/assets/data/kb.en.json") };
const suite = read("tests/chatbot/questions.json");
const report = evaluate(kbs, suite);

test("au moins 60 questions, 20 par langue", () => {
  assert.ok(report.total >= 60);
  for (const l of ["fr", "nl", "en"]) assert.ok(suite.questions.filter((q) => q.lang === l).length >= 20, l);
});

test("véracité : 100 % (aucun prix, aucune date, aucun agrément inventés ; textes interdits absents)", () => {
  const bad = report.rows.filter((r) => !r.truthOk).map((r) => `${r.lang} « ${r.q} » : ${r.problems.join(" ; ")}`);
  assert.deepEqual(bad, []);
});

test("intention et adresse attendues : 90 % au moins", () => {
  const ratio = report.intentUrl / report.total;
  const misses = report.rows.filter((r) => !(r.intentOk && r.urlOk)).map((r) => `${r.lang} « ${r.q} » : ${r.got} / ${r.urls.join(" ")}`);
  assert.ok(ratio >= 0.9, `${Math.round(ratio * 100)} % — ${misses.join(" | ")}`);
});

test("réponse dans la langue du visiteur", () => {
  assert.equal(report.langOk, report.total);
});

test("bases de connaissances : copie du Worker identique au site (aucune copie à la main)", () => {
  const worker = path.join(ROOT, "worker", "src", "generated", "kb.json");
  if (!fs.existsSync(worker)) return;
  const w = JSON.parse(fs.readFileSync(worker, "utf8"));
  for (const l of ["fr", "nl", "en"]) {
    const strip = (kb) => JSON.stringify(kb.entries.map((e) => [e.id, e.title, e.facts]));
    assert.equal(strip(w[l]), strip({ entries: kbs[l].entries }), l);
  }
});
