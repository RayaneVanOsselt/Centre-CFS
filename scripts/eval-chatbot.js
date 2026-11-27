// Évaluation de l'assistant sur tests/chatbot/questions.json et rapport docs/chatbot-tests.md (mission 8.10).
// Usage : python3 site/build.py && npm run eval:chatbot [-- --provider=local]
// Le cœur local est évalué ici. Les fournisseurs IA (workers-ai, claude) s'évaluent sur le Worker déployé en mode
// test, car ils demandent des clés : voir docs/README-ASSISTANT.md.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluate } from "../tests/chatbot/evaluate.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const provider = (process.argv.find((a) => a.startsWith("--provider=")) || "--provider=local").split("=")[1];
if (provider !== "local") {
  console.error(`Fournisseur « ${provider} » : à évaluer sur le Worker en mode test (clés nécessaires), voir docs/README-ASSISTANT.md.`);
  process.exit(2);
}
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
const kbs = { fr: read("dist/assets/data/kb.fr.json"), nl: read("dist/assets/data/kb.nl.json"), en: read("dist/assets/data/kb.en.json") };
const rep = evaluate(kbs, read("tests/chatbot/questions.json"));
const esc = (s) => String(s).replace(/\|/g, "\\|").replace(/\n+/g, " ");
const rows = rep.rows.map((r) => `| ${r.lang} | ${esc(r.q)} | ${r.intent} | ${r.got} | ${r.confidence} | ${r.truth ? (r.truthOk ? "✅" : "❌") : "—"} | ${r.intentOk && r.urlOk ? "✅" : "❌"} | ${esc(r.message.slice(0, 150))}${r.message.length > 150 ? "…" : ""} |`);
const md = `# Évaluation de l'assistant (cœur local)

Généré par \`npm run eval:chatbot\` le ${new Date().toISOString().slice(0, 10)}, base de connaissances du ${kbs.fr.updatedAt}.
Sessions de test : celles de \`tests/chatbot/questions.json\` (jamais des sessions réelles).

| Critère (mission 8.10) | Seuil | Résultat |
|---|---|---|
| Règles de véracité (aucun prix, aucune date, aucun agrément inventés) | 100 % | **${rep.truth.passed} / ${rep.truth.total}** |
| Toutes les vérifications de texte (attendus présents, interdits absents) | — | ${rep.allChecks} / ${rep.total} |
| Intention et adresse attendues | 90 % | **${rep.intentUrl} / ${rep.total}** (${Math.round((rep.intentUrl / rep.total) * 100)} %) |
| Réponse dans la langue du visiteur | — | ${rep.langOk} / ${rep.total} |

| Langue | Question | Intention attendue | Obtenue | Confiance | Véracité | Intention + adresse | Réponse (début) |
|---|---|---|---|---|---|---|---|
${rows.join("\n")}
`;
fs.writeFileSync(path.join(ROOT, "docs", "chatbot-tests.md"), md);
console.log(`Véracité ${rep.truth.passed}/${rep.truth.total} · intention+adresse ${rep.intentUrl}/${rep.total} · langue ${rep.langOk}/${rep.total} → docs/chatbot-tests.md`);
process.exit(rep.truth.passed === rep.truth.total && rep.intentUrl / rep.total >= 0.9 ? 0 : 1);
