// node:fs, node:path, node:url, node:os réduits à ce que les tests utilisent (fichiers lus sur le serveur local).

function normalize(p) {
  const abs = p.startsWith("/");
  const out = [];
  for (const part of p.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return (abs ? "/" : "") + out.join("/");
}
export const path = {
  sep: "/",
  join: (...parts) => normalize(parts.filter(Boolean).join("/")),
  dirname: (p) => normalize(p).replace(/\/[^/]*$/, "") || "/",
  basename: (p) => normalize(p).split("/").pop(),
};

export const fs = {
  readFileSync(p) {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", p, false);
    xhr.send();
    if (xhr.status !== 200) throw new Error(`ENOENT: ${p}`);
    return xhr.responseText;
  },
  existsSync(p) {
    const xhr = new XMLHttpRequest();
    xhr.open("HEAD", p, false);
    xhr.send();
    return xhr.status === 200;
  },
  readdirSync() {
    throw new Error("readdirSync indisponible dans le navigateur");
  },
};

export const url = { fileURLToPath: (u) => new URL(u).pathname };
export const os = { tmpdir: () => "/tmp" };
