/* =========================================================================
   Fausse Google Sheets + faux services Apps Script, pour exécuter apps-script/reservations.gs dans Node.
   Repris du projet Wisy Safety (tests/helpers/gas-fake.js) et complété pour le Centre CFS :
   signature HMAC (Utilities.computeHmacSha256Signature), DriveApp, SpreadsheetApp.create, clearContent.

   Comportements imités là où le script en dépend :
     - une nouvelle feuille a 1 000 lignes et 26 colonnes : écrire au-delà lève l'erreur de Google ;
     - une apostrophe initiale force le texte et n'apparaît pas dans la cellule ;
     - getDataRange() = zone jusqu'à la dernière ligne / colonne non vide ;
     - les méthodes de mise en forme (couleurs, largeurs, validations…) ne font rien et se chaînent.
   ========================================================================= */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Objet dont les méthodes inconnues (mise en forme…) ne font rien et se chaînent. */
export function chain(real) {
  const p = new Proxy(real || {}, {
    get: (t, k) => (k in t ? t[k] : typeof k === "symbol" || k === "then" ? undefined : () => p),
  });
  return p;
}

const store = (x) => (typeof x === "string" && x.charAt(0) === "'" ? x.slice(1) : x);
const signed = (buf) => Array.from(buf).map((b) => (b > 127 ? b - 256 : b));

export function fakeSheet(name, grid, env) {
  let cols = Math.max(26, ...(grid || [[]]).map((r) => r.length));
  let maxRows = (env && env.maxRows) || 1000;
  let maxCols = cols;
  const g = (grid || []).map((r) => {
    const x = r.slice();
    while (x.length < cols) x.push("");
    return x;
  });
  const blank = (v) => v === "" || v == null;
  const lastRow = () => {
    for (let r = g.length; r >= 1; r--) if (g[r - 1].some((v) => !blank(v))) return r;
    return 0;
  };
  const lastCol = () => {
    for (let c = cols; c >= 1; c--) if (g.some((row) => !blank(row[c - 1]))) return c;
    return 0;
  };
  let sheet;
  let sheetName = name;
  let active = { row: 2, rows: 1 };
  const ensure = (r, c) => {
    while (g.length < r) g.push(Array(cols).fill(""));
    if (c > cols) {
      cols = c;
      g.forEach((row) => {
        while (row.length < cols) row.push("");
      });
    }
  };
  const range = (r, c, nr = 1, nc = 1) => {
    if (typeof r === "string") return chain();
    if (r < 1 || c < 1 || nr < 1 || nc < 1 || r - 1 + nr > maxRows || c - 1 + nc > maxCols) {
      throw new Error(
        `Exception: Les coordonnées de la plage sont hors des dimensions de la feuille. (${sheetName} : lignes ${r}–${r - 1 + nr} / ${maxRows}, colonnes ${c}–${c - 1 + nc} / ${maxCols})`,
      );
    }
    ensure(r - 1 + nr, c - 1 + nc);
    const self = chain({
      getValues: () => g.slice(r - 1, r - 1 + nr).map((row) => row.slice(c - 1, c - 1 + nc)),
      getValue: () => g[r - 1][c - 1],
      setValues: (v) => {
        if (v.length !== nr) throw new Error(`setValues : ${v.length} lignes pour une zone de ${nr}`);
        v.forEach((row, i) => {
          if (row.length !== nc) throw new Error(`setValues : ${row.length} colonnes pour une zone de ${nc}`);
          row.forEach((x, j) => {
            g[r - 1 + i][c - 1 + j] = store(x);
          });
        });
        if (env.onWrite) env.onWrite(sheetName);
        return self;
      },
      setValue: (x) => {
        g[r - 1][c - 1] = store(x);
        if (env.onWrite) env.onWrite(sheetName);
        return self;
      },
      clearContent: () => {
        for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) g[r - 1 + i][c - 1 + j] = "";
        return self;
      },
      getRow: () => r,
      getColumn: () => c,
      getNumRows: () => nr,
      getNumColumns: () => nc,
      getSheet: () => sheet,
      activate: () => {
        active = { row: r, rows: nr };
        env.ss._active = sheet;
        return self;
      },
    });
    return self;
  };
  sheet = chain({
    grid: g,
    getName: () => sheetName,
    setName: (n) => {
      sheetName = n;
      return sheet;
    },
    getRange: range,
    getDataRange: () => range(1, 1, Math.max(lastRow(), 1), Math.max(lastCol(), 1)),
    getLastRow: lastRow,
    getLastColumn: lastCol,
    getMaxColumns: () => maxCols,
    getMaxRows: () => maxRows,
    insertRowsAfter: (after, n) => {
      maxRows += n;
      return sheet;
    },
    insertColumnsAfter: (after, n) => {
      maxCols += n;
      return sheet;
    },
    getProtections: () => [],
    getActiveRange: () => range(active.row, 1, active.rows, cols),
    getActiveRangeList: () => ({ getRanges: () => [range(active.row, 1, active.rows, cols)] }),
    select: (row, rows) => {
      active = { row, rows: rows || 1 };
      env.ss._active = sheet;
    },
    /** Lecture pratique pour les tests : objets { en-tête: valeur }. */
    records: () => {
      const v = g.slice(0, lastRow());
      const head = v[0] || [];
      return v
        .slice(1)
        .filter((row) => row.some((x) => !blank(x)))
        .map((row) => {
          const o = {};
          head.forEach((h, i) => {
            if (h !== "") o[h] = row[i];
          });
          return o;
        });
    },
  });
  return sheet;
}

/* Utilities.formatDate / parseDate (fuseau IANA, motifs simples + texte entre apostrophes). */
function partsIn(d, tz) {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const v = (t) => p.find((x) => x.type === t).value;
  return { yyyy: v("year"), MM: v("month"), dd: v("day"), HH: v("hour"), mm: v("minute"), ss: v("second") };
}
export function formatDate(d, tz, fmt) {
  const P = partsIn(d, tz);
  let out = "";
  for (let i = 0; i < fmt.length; ) {
    if (fmt[i] === "'") {
      const j = fmt.indexOf("'", i + 1);
      out += fmt.slice(i + 1, j);
      i = j + 1;
      continue;
    }
    const m = fmt.slice(i).match(/^(yyyy|MM|dd|HH|mm|ss)/);
    if (m) {
      out += P[m[1]];
      i += m[1].length;
    } else {
      out += fmt[i];
      i++;
    }
  }
  return out;
}
function offsetAt(t, tz) {
  const P = partsIn(new Date(t), tz);
  return Date.UTC(+P.yyyy, +P.MM - 1, +P.dd, +P.HH, +P.mm, +P.ss) - t;
}
export function parseDate(s, tz, fmt) {
  if (fmt !== "yyyy-MM-dd HH:mm") throw new Error("parseDate : motif non géré " + fmt);
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/);
  if (!m) return null;
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  let t = guess - offsetAt(guess, tz);
  t = guess - offsetAt(t, tz);
  return new Date(t);
}

/** Faux Google Drive (dossier de sauvegardes). */
function fakeDrive() {
  const files = [];
  const folders = [];
  const file = (name, data) => {
    const f = { id: "file-" + (files.length + 1), name, data, trashed: false };
    files.push(f);
    return {
      getId: () => f.id,
      getName: () => f.name,
      setTrashed: (v) => {
        f.trashed = v;
      },
      moveTo: (folder) => {
        f.folder = folder._id;
      },
    };
  };
  const folderApi = (fo) => ({
    _id: fo.id,
    getId: () => fo.id,
    createFile: (name, data) => {
      const h = file(name, data);
      files[files.length - 1].folder = fo.id;
      return h;
    },
    getFiles: () => {
      const list = files.filter((f) => f.folder === fo.id && !f.trashed);
      let i = 0;
      return {
        hasNext: () => i < list.length,
        next: () => {
          const f = list[i++];
          return { getName: () => f.name, setTrashed: (v) => (f.trashed = v) };
        },
      };
    },
  });
  return {
    files,
    folders,
    api: {
      createFolder: (name) => {
        const fo = { id: "folder-" + (folders.length + 1), name };
        folders.push(fo);
        return folderApi(fo);
      },
      getFolderById: (id) => {
        const fo = folders.find((x) => x.id === id);
        if (!fo) throw new Error("dossier introuvable");
        return folderApi(fo);
      },
      getFileById: (id) => ({
        moveTo: (folder) => {
          const created = files.find((x) => x.id === id) || { id, name: "sheet", trashed: false };
          if (!files.includes(created)) files.push(created);
          created.folder = folder._id;
        },
      }),
      register: (id, name) => files.push({ id, name, trashed: false }),
    },
  };
}

/**
 * Charge un script Apps Script dans un contexte isolé.
 * @param {string} file  chemin relatif au dépôt (ex. "apps-script/reservations.gs")
 * @param {object} opts  { now, onLock(api), lockFails, http(url, opts) → {code, body}, props, answers }
 */
export function loadGas(file, opts = {}) {
  const env = { onWrite: null, maxRows: opts.maxRows };
  const sheets = [];
  const cache = new Map();
  const props = new Map(Object.entries(opts.props || {}));
  const alerts = [];
  const toasts = [];
  const http = [];
  /* Gmail (MailApp) : envois enregistrés ; quota du jour réglable (opts.mailQuota, 100 par défaut). */
  const mails = [];
  let mailLeft = opts.mailQuota ?? 100;
  const triggers = [];
  const created = [];
  const drive = fakeDrive();
  let fileName = "Feuille de calcul sans titre";
  let flushes = 0;
  let locks = 0;
  const makeSs = (list, nameRef) =>
    chain({
      _active: null,
      getId: () => "ss-" + nameRef.name,
      getSheetByName: (n) => list.find((s) => s.getName() === n) || null,
      getSheets: () => list,
      insertSheet: (n) => {
        const s = fakeSheet(n, [[]], env);
        list.push(s);
        return s;
      },
      deleteSheet: (s) => {
        const i = list.indexOf(s);
        if (i >= 0) list.splice(i, 1);
      },
      getName: () => nameRef.name,
      rename: (n) => {
        nameRef.name = n;
      },
      toast: (m) => {
        toasts.push(m);
      },
    });
  const nameRef = {
    get name() {
      return fileName;
    },
    set name(v) {
      fileName = v;
    },
  };
  const ss = makeSs(sheets, nameRef);
  ss.getActiveSheet = () => ss._active || sheets[0];
  ss.setActiveSheet = (s) => {
    ss._active = s;
    return s;
  };
  env.ss = ss;
  const answers = opts.answers || [];
  const ui = chain({
    alert: (...a) => {
      alerts.push(a.filter((x) => typeof x === "string").join(" | "));
      return answers.length ? answers.shift() : "OK";
    },
    prompt: () => {
      const v = answers.length ? answers.shift() : "";
      return { getSelectedButton: () => "OK", getResponseText: () => v };
    },
    ButtonSet: { OK: "OK", YES_NO: "YES_NO", OK_CANCEL: "OK_CANCEL" },
    Button: { YES: "YES", NO: "NO", OK: "OK", CANCEL: "CANCEL" },
  });
  const nowFn = () => (typeof opts.now === "function" ? opts.now() : new Date(opts.now || "2026-11-26T08:00:00Z"));
  const ctx = {
    SpreadsheetApp: chain({
      getActiveSpreadsheet: () => ss,
      getUi: () => ui,
      flush: () => {
        flushes++;
      },
      create: (n) => {
        const list = [fakeSheet("Feuille 1", [[]], env)];
        const ref = { name: n };
        const c = makeSs(list, ref);
        created.push({ name: n, sheets: list });
        drive.api.register("ss-" + n, n);
        return c;
      },
      ProtectionType: { RANGE: "RANGE", SHEET: "SHEET" },
    }),
    CacheService: {
      getScriptCache: () => ({
        /* Les entrées expirent selon l'horloge simulée (comme le cache de Google). */
        get: (k) => {
          const e = cache.get(k);
          return e && e.exp > ctx.__now().getTime() ? e.v : null;
        },
        getAll: (keys) => {
          const o = {};
          keys.forEach((k) => {
            const e = cache.get(k);
            if (e && e.exp > ctx.__now().getTime()) o[k] = e.v;
          });
          return o;
        },
        put: (k, v, ttl) => {
          if (!(ttl >= 1 && ttl <= 21600)) throw new Error("durée de cache Google : de 1 s à 6 h (" + ttl + ")");
          cache.set(k, { v, exp: ctx.__now().getTime() + ttl * 1000 });
        },
        remove: (k) => {
          cache.delete(k);
        },
      }),
    },
    LockService: {
      getScriptLock: () => ({
        tryLock: () => {
          if (opts.lockFails) return false;
          locks++;
          if (opts.onLock) opts.onLock(api);
          return true;
        },
        releaseLock: () => {},
      }),
    },
    UrlFetchApp: {
      fetch: (url, o) => {
        http.push({ url, o });
        const r = opts.http ? opts.http(url, o) : { code: 200, body: "OK" };
        return {
          getResponseCode: () => r.code,
          getContentText: () => (typeof r.body === "string" ? r.body : JSON.stringify(r.body)),
        };
      },
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (props.has(k) ? props.get(k) : null),
        setProperties: (o) => {
          Object.keys(o).forEach((k) => props.set(k, o[k]));
        },
        setProperty: (k, v) => props.set(k, v),
      }),
    },
    ScriptApp: {
      getProjectTriggers: () => triggers.slice(),
      deleteTrigger: (t) => {
        triggers.splice(triggers.indexOf(t), 1);
      },
      newTrigger: (fn) => {
        const tr = { fn, getHandlerFunction: () => fn };
        return chain({
          create: () => {
            triggers.push(tr);
            return tr;
          },
        });
      },
    },
    DriveApp: drive.api,
    MailApp: {
      getRemainingDailyQuota: () => mailLeft,
      sendEmail: (o) => {
        const n = 1 + (o.bcc ? 1 : 0);
        if (mailLeft < n) throw new Error("Service invoked too many times for one day: email.");
        mailLeft -= n;
        mails.push(o);
      },
    },
    HtmlService: {
      createHtmlOutput: (html) => ({
        html,
        title: "",
        setTitle(t) {
          this.title = t;
          return this;
        },
        getContent() {
          return this.html;
        },
      }),
    },
    ContentService: {
      MimeType: { JSON: "json" },
      createTextOutput: (text) => ({
        text,
        setMimeType() {
          return this;
        },
      }),
    },
    Utilities: {
      formatDate,
      parseDate,
      sleep: () => {},
      getUuid: () => crypto.randomUUID(),
      computeDigest: (alg, v) => signed(crypto.createHash("sha256").update(String(v)).digest()),
      computeHmacSha256Signature: (value, key) => signed(crypto.createHmac("sha256", String(key)).update(String(value)).digest()),
      DigestAlgorithm: { SHA_256: "sha256" },
      Charset: { UTF_8: "utf8" },
    },
    console: { log: () => {} },
    Date,
    JSON,
    Math,
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, file), "utf8"), ctx, { filename: file });
  ctx.__now = nowFn;
  vm.runInContext("now_ = function () { return __now(); };", ctx);
  const secret = () => props.get("RESERVATIONS_HMAC_SECRET");
  /** Signe comme le Worker (worker/src/lib/hmac.js). */
  const sign = (content, ts, nonce) => {
    const t = ts ?? Math.floor(ctx.__now().getTime() / 1000);
    const n = nonce || crypto.randomBytes(18).toString("base64url");
    return { ts: t, nonce: n, sig: crypto.createHmac("sha256", secret()).update(t + "." + n + "." + content).digest("hex") };
  };
  const api = {
    ctx,
    ss,
    sheets,
    cache,
    props,
    alerts,
    toasts,
    http,
    mails,
    triggers,
    env,
    created,
    drive,
    sheet: (n) => ss.getSheetByName(n),
    /** GET signé (comme le Worker). */
    get: (action = "sessions", extra) => {
      const s = sign("GET:" + action);
      return JSON.parse(ctx.doGet({ parameter: Object.assign({ action, ts: String(s.ts), nonce: s.nonce, sig: s.sig }, extra || {}) }).text);
    },
    /** POST signé (comme le Worker). `raw` : enveloppe déjà construite (tests de sécurité). */
    post: (body, raw) => {
      if (raw !== undefined) return JSON.parse(ctx.doPost({ postData: { contents: typeof raw === "string" ? raw : JSON.stringify(raw) } }).text);
      const payload = JSON.stringify(body);
      const s = sign(payload);
      return JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify({ ts: s.ts, nonce: s.nonce, sig: s.sig, payload }) } }).text);
    },
    sign,
    stats: () => ({ flushes, locks }),
  };
  return api;
}
