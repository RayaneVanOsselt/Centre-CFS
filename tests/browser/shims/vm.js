// node:vm dans le navigateur : le « contexte » est une iframe vide dont l'objet global reçoit les propriétés du
// contexte. Les fonctions et variables globales du script deviennent des propriétés de l'iframe ; l'objet `ctx` du
// test reçoit des accesseurs qui lisent et écrivent ces globales (ctx.FORMATIONS = … modifie bien la variable du script).
const REALMS = new WeakMap();

function bridge(ctx, win, name) {
  const d = Object.getOwnPropertyDescriptor(ctx, name);
  if (d && (d.get || d.set)) return;
  if (d) win[name] = d.value;
  Object.defineProperty(ctx, name, { configurable: true, enumerable: true, get: () => win[name], set: (v) => { win[name] = v; } });
}

export function createContext(ctx) {
  const frame = document.createElement("iframe");
  frame.style.display = "none";
  document.body.appendChild(frame);
  const win = frame.contentWindow;
  for (const k of Object.keys(ctx)) bridge(ctx, win, k);
  REALMS.set(ctx, { win, known: new Set(Object.getOwnPropertyNames(win)) });
  return ctx;
}

export function runInContext(code, ctx) {
  const realm = REALMS.get(ctx);
  if (!realm) throw new Error("contexte inconnu : appeler createContext d'abord");
  for (const k of Object.keys(ctx)) bridge(ctx, realm.win, k);   // propriétés ajoutées au contexte depuis
  const result = realm.win.eval(code);
  for (const k of Object.getOwnPropertyNames(realm.win)) {
    if (!realm.known.has(k)) {
      realm.known.add(k);
      bridge(ctx, realm.win, k);
    }
  }
  return result;
}

export default { createContext, runInContext };
