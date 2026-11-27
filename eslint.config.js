// ESLint (configuration « à plat », sans extension) : erreurs réelles seulement, pas de style.
const shared = {
  console: "readonly", fetch: "readonly", Request: "readonly", Response: "readonly", Headers: "readonly", URL: "readonly",
  URLSearchParams: "readonly", TextEncoder: "readonly", TextDecoder: "readonly", crypto: "readonly", atob: "readonly",
  btoa: "readonly", setTimeout: "readonly", clearTimeout: "readonly", AbortController: "readonly", FormData: "readonly",
  structuredClone: "readonly", globalThis: "readonly", queueMicrotask: "readonly",
};
const rules = {
  "no-undef": "error",
  "no-unused-vars": ["error", { args: "none", caughtErrors: "none", varsIgnorePattern: "^_" }],
  "no-unreachable": "error",
  "no-dupe-keys": "error",
  "no-duplicate-case": "error",
  "no-const-assign": "error",
  "no-redeclare": "error",
  "no-self-assign": "error",
  "no-unsafe-finally": "error",
  "use-isnan": "error",
  "valid-typeof": "error",
  "no-cond-assign": ["error", "except-parens"],
  eqeqeq: ["error", "smart"],
};
export default [
  { ignores: ["dist/**", "node_modules/**", "site/src/assets/vendor/**", "worker/src/generated/**"] },
  {
    files: ["worker/**/*.js"],
    languageOptions: { ecmaVersion: "latest", sourceType: "module", globals: { ...shared, caches: "readonly" } },
    rules,
  },
  {
    files: ["tests/browser/**/*.js"],
    languageOptions: { ecmaVersion: "latest", sourceType: "module", globals: { ...shared, window: "readonly", document: "readonly", location: "readonly", XMLHttpRequest: "readonly", process: "writable", Buffer: "writable" } },
    rules,
  },
  {
    files: ["tests/**/*.js", "scripts/**/*.js", "eslint.config.js"],
    ignores: ["tests/browser/**"],
    languageOptions: { ecmaVersion: "latest", sourceType: "module", globals: { ...shared, process: "readonly", Buffer: "readonly" } },
    rules,
  },
];
