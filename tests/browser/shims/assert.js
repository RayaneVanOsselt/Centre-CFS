// node:assert/strict (sous-ensemble utilisé par les tests).
class AssertionError extends Error {
  constructor(message) {
    super(message);
    this.name = "AssertionError";
  }
}
const show = (v) => {
  try {
    return typeof v === "string" ? JSON.stringify(v) : JSON.stringify(v, (k, x) => (x instanceof RegExp ? String(x) : x));
  } catch {
    return String(v);
  }
};
const fail = (msg, def) => {
  throw new AssertionError(msg ? (msg instanceof Error ? msg.message : msg) + " — " + def : def);
};

function deep(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || !a || !b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (a instanceof Date || b instanceof Date) return a.getTime && b.getTime && a.getTime() === b.getTime();
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deep(a[k], b[k]));
}

function assert(v, msg) {
  if (!v) fail(msg, `valeur fausse : ${show(v)}`);
}
assert.ok = assert;
assert.equal = (a, b, msg) => { if (!Object.is(a, b)) fail(msg, `${show(a)} !== ${show(b)}`); };
assert.strictEqual = assert.equal;
assert.notEqual = (a, b, msg) => { if (Object.is(a, b)) fail(msg, `${show(a)} === ${show(b)}`); };
assert.notStrictEqual = assert.notEqual;
assert.deepEqual = (a, b, msg) => { if (!deep(a, b)) fail(msg, `${show(a)} ≠ ${show(b)}`); };
assert.deepStrictEqual = assert.deepEqual;
assert.notDeepEqual = (a, b, msg) => { if (deep(a, b)) fail(msg, `${show(a)} = ${show(b)}`); };
assert.match = (s, re, msg) => { if (!re.test(s)) fail(msg, `${show(s)} ne correspond pas à ${re}`); };
assert.doesNotMatch = (s, re, msg) => { if (re.test(s)) fail(msg, `${show(s)} correspond à ${re}`); };
assert.fail = (msg) => fail(msg, "échec");

function check(err, expected) {
  if (!expected) return true;
  if (typeof expected === "function" && expected.prototype instanceof Error) return err instanceof expected;
  if (typeof expected === "function") return expected(err) !== false;
  if (expected instanceof RegExp) return expected.test(String(err && err.message));
  if (typeof expected === "object") return Object.keys(expected).every((k) => (expected[k] instanceof RegExp ? expected[k].test(err[k]) : deep(err[k], expected[k])));
  return true;
}
assert.throws = (fn, expected, msg) => {
  try {
    fn();
  } catch (e) {
    if (!check(e, expected)) fail(msg, `erreur inattendue : ${e && e.message}`);
    return;
  }
  fail(msg, "aucune erreur levée");
};
assert.rejects = async (p, expected, msg) => {
  try {
    await (typeof p === "function" ? p() : p);
  } catch (e) {
    if (!check(e, expected)) fail(msg, `erreur inattendue : ${e && e.message}`);
    return;
  }
  fail(msg, "aucune erreur levée");
};
assert.doesNotThrow = (fn, msg) => {
  try {
    fn();
  } catch (e) {
    fail(msg, `erreur levée : ${e && e.message}`);
  }
};
assert.AssertionError = AssertionError;
export default assert;
export const { ok, equal, notEqual, deepEqual, match, doesNotMatch, throws, rejects } = assert;
