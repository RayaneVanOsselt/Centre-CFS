// node:test (sous-ensemble) : test(nom, [options], fn), describe/it simples. Les tests sont exécutés par runner.js.
export const registry = [];
let currentFile = "";
export function setFile(f) {
  currentFile = f;
}
export function test(name, opts, fn) {
  if (typeof opts === "function") {
    fn = opts;
    opts = {};
  }
  registry.push({ file: currentFile, name, fn, skip: (opts && opts.skip) || false });
}
test.skip = (name, fn) => registry.push({ file: currentFile, name, fn, skip: true });
export const it = test;
export function describe(_name, fn) {
  fn();
}
export default test;
