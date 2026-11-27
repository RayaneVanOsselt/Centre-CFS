// Rapporteur node:test pour GitHub Actions : chaque test en échec devient une annotation (::error), visible dans
// l'onglet Actions et par l'API publique, même sans être connecté. Utilisé par .github/workflows/ci.yml.
const esc = (s) => String(s).replace(/%/g, "%25").replace(/\r/g, "").replace(/\n/g, "%0A");
const rel = (f) => String(f || "").replace(/^file:\/\//, "").replace(process.cwd() + "/", "");

export default async function* githubAnnotations(source) {
  for await (const event of source) {
    if (event.type !== "test:fail") continue;
    const d = event.data || {};
    const err = d.details && d.details.error;
    const cause = err && (err.cause || err);
    const msg = (cause && (cause.message || String(cause))) || "échec";
    const where = d.file ? `file=${rel(d.file)}${d.line ? `,line=${d.line}` : ""},` : "";
    yield `::error ${where}title=${esc(d.name || "test")}::${esc(msg.slice(0, 3000))}\n`;
  }
}
