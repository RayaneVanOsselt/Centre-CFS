/* =========================================================================
   Centre CFS — héros 3D « signalisation rétro-réfléchissante » (WebGL2, sans bibliothèque).

   La nuit tombe sur le panneau de chantier de l'accueil : les 8 panneaux de domaine deviennent des plaques en relief
   (face émaillée, tranche et dos en aluminium) et le pointeur sert de lampe frontale. Là où passe le faisceau, le film
   rétro-réfléchissant s'allume (la lumière revient vers l'œil quand elle part d'à côté de lui).

   Amélioration progressive : chargé par main.js seulement si le visiteur n'a pas demandé moins d'animations, n'économise
   pas ses données et dispose de WebGL2 et d'assez de mémoire. Les liens HTML du panneau restent le vrai menu (clavier,
   lecteur d'écran, clic) ; le canevas est décoratif (aria-hidden) et ne capte aucun clic. En cas d'erreur : rien ne
   change, le panneau HTML reste affiché.
   ========================================================================= */

const FOV = 30 * Math.PI / 180;
const THICK = 0.07;              // épaisseur de la plaque (fraction de sa taille)
const MAX_TILT = 8 * Math.PI / 180;

/* ---------- Petites matrices 4 × 4 (colonne majeure, comme WebGL) ---------- */
const m4 = {
  perspective(fov, aspect, near, far) {
    const f = 1 / Math.tan(fov / 2), nf = 1 / (near - far);
    return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
  },
  translation(x, y, z) { return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]); },
  mul(a, b) {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = s;
    }
    return o;
  },
  rotX(t) { const c = Math.cos(t), s = Math.sin(t); return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]); },
  rotY(t) { const c = Math.cos(t), s = Math.sin(t); return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]); },
  scale(k) { return new Float32Array([k, 0, 0, 0, 0, k, 0, 0, 0, 0, k, 0, 0, 0, 0, 1]); },
};

/* ---------- Contours des panneaux, dans la grille 48 × 48 de site/lib/icons.py ---------- */
function outline(shape) {
  const pts = [];
  if (shape === "triangle") {
    pts.push([24, 5.5], [44.2, 40.8], [3.8, 40.8]);
  } else if (shape === "carre") {
    const r = 5, a = 3, b = 45, seg = 6;
    const corners = [[b - r, a + r, -90], [b - r, b - r, 0], [a + r, b - r, 90], [a + r, a + r, 180]];
    for (const [cx, cy, start] of corners) {
      for (let i = 0; i <= seg; i++) {
        const t = (start + 90 * i / seg) * Math.PI / 180;
        pts.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]);
      }
    }
  } else {
    for (let i = 0; i < 48; i++) {
      const t = i / 48 * Math.PI * 2;
      pts.push([24 + 21.5 * Math.cos(t), 24 + 21.5 * Math.sin(t)]);
    }
  }
  return pts;
}

/** Plaque extrudée : face avant texturée (matériau 0), dos et tranche en aluminium (matériau 1). Taille unitaire. */
function plateGeometry(shape) {
  const P = outline(shape).map(([x, y]) => [x / 48 - 0.5, 0.5 - y / 48, x / 48, y / 48]);
  // Sens anti-horaire vu de face (repère y vers le haut)
  let area = 0;
  for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; area += a[0] * b[1] - b[0] * a[1]; }
  if (area < 0) P.reverse();
  const cx = P.reduce((s, p) => s + p[0], 0) / P.length, cy = P.reduce((s, p) => s + p[1], 0) / P.length;
  const v = [], z = THICK / 2;
  const push = (x, y, zz, nx, ny, nz, u, w, mat) => v.push(x, y, zz, nx, ny, nz, u, w, mat);
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length];
    // face avant
    push(cx, cy, z, 0, 0, 1, cx + 0.5, 0.5 - cy, 0); push(a[0], a[1], z, 0, 0, 1, a[2], a[3], 0); push(b[0], b[1], z, 0, 0, 1, b[2], b[3], 0);
    // dos
    push(cx, cy, -z, 0, 0, -1, 0, 0, 1); push(b[0], b[1], -z, 0, 0, -1, 0, 0, 1); push(a[0], a[1], -z, 0, 0, -1, 0, 0, 1);
    // tranche
    const ex = b[0] - a[0], ey = b[1] - a[1], len = Math.hypot(ex, ey) || 1, nx = ey / len, ny = -ex / len;
    push(a[0], a[1], z, nx, ny, 0, 0, 0, 1); push(a[0], a[1], -z, nx, ny, 0, 0, 0, 1); push(b[0], b[1], z, nx, ny, 0, 0, 0, 1);
    push(b[0], b[1], z, nx, ny, 0, 0, 0, 1); push(a[0], a[1], -z, nx, ny, 0, 0, 0, 1); push(b[0], b[1], -z, nx, ny, 0, 0, 0, 1);
  }
  return new Float32Array(v);
}

const VERT = `#version 300 es
in vec3 aPos; in vec3 aNor; in vec2 aUv; in float aMat;
uniform mat4 uProj, uView, uModel;
out vec3 vWorld; out vec3 vNor; out vec2 vUv; out float vMat;
void main() {
  vec4 w = uModel * vec4(aPos, 1.0);
  vWorld = w.xyz; vNor = mat3(uModel) * aNor; vUv = aUv; vMat = aMat;
  gl_Position = uProj * uView * w;
}`;

const FRAG = `#version 300 es
precision highp float;
in vec3 vWorld; in vec3 vNor; in vec2 vUv; in float vMat;
uniform sampler2D uTex;
uniform vec3 uCam, uLight, uSpot;
uniform float uCosIn, uCosOut, uBoost, uAmbient;
out vec4 color;
void main() {
  vec3 N = normalize(vNor);
  if (!gl_FrontFacing) N = -N;
  vec3 L = normalize(uLight - vWorld), V = normalize(uCam - vWorld);
  float spot = smoothstep(uCosOut, uCosIn, dot(-L, uSpot));
  float diff = max(dot(N, L), 0.0);
  float spec = pow(max(dot(N, normalize(L + V)), 0.0), 60.0);
  vec3 base; float retro;
  if (vMat < 0.5) {
    base = texture(uTex, vUv).rgb;
    retro = pow(max(dot(L, V), 0.0), 16.0) * 0.8;          // film rétro-réfléchissant : renvoie la lumière vers l'œil
  } else {
    base = vec3(0.70, 0.73, 0.77);                          // aluminium
    retro = 0.0;
  }
  float light = min(uAmbient + (spot + uBoost) * (0.4 * diff + retro), 1.08);   // plafonné : couleurs de la charte, jamais délavées
  color = vec4(base * light + vec3(spec) * min(spot + uBoost, 1.0) * 0.22, 1.0);
}`;

function shader(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || "shader");
  return s;
}

/** Texture d'un panneau à partir du même SVG que le site (une seule source pour le dessin). */
function signTexture(gl, svgMarkup) {
  return new Promise((resolve, reject) => {
    const svg = svgMarkup.replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" ');
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = c.height = 256;
      c.getContext("2d").drawImage(img, 0, 0, 256, 256);
      URL.revokeObjectURL(url);
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      resolve(tex);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("texture")); };
    img.src = url;
  });
}

/**
 * Démarre la scène dans le panneau de chantier.
 * @param {HTMLElement} board  élément [data-board] (contient .board-grid > li > a[data-domain] > svg.sign)
 * @returns {Promise<() => void>} fonction d'arrêt
 */
export default async function start(board) {
  const grid = board.querySelector(".board-grid");
  const catalog = (self.CFS_CATALOG && self.CFS_CATALOG.domains) || [];
  const links = Array.from(grid.querySelectorAll("a[data-domain]"));
  const domains = links.map((a) => catalog.find((d) => d.id === a.dataset.domain)).filter(Boolean);
  if (!links.length || domains.length !== links.length) return () => {};

  const canvas = document.createElement("canvas");
  canvas.className = "board-3d";
  canvas.setAttribute("aria-hidden", "true");
  const gl = canvas.getContext("webgl2", { antialias: true, alpha: true, premultipliedAlpha: true, powerPreference: "low-power" });
  if (!gl) return () => {};

  const prog = gl.createProgram();
  gl.attachShader(prog, shader(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, shader(gl, gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error("programme WebGL");
  const U = {};
  for (const n of ["uProj", "uView", "uModel", "uTex", "uCam", "uLight", "uSpot", "uCosIn", "uCosOut", "uBoost", "uAmbient"]) U[n] = gl.getUniformLocation(prog, n);

  // Une géométrie par forme de panneau
  const meshes = {};
  for (const d of catalog) {
    const shape = /<circle class="bg-/.test(d.sign) ? "cercle" : /<rect class="bg-/.test(d.sign) ? "carre" : "triangle";
    d._shape = shape;
    if (meshes[shape]) continue;
    const data = plateGeometry(shape);
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    const stride = 9 * 4;
    [["aPos", 3, 0], ["aNor", 3, 12], ["aUv", 2, 24], ["aMat", 1, 32]].forEach(([name, size, off]) => {
      const loc = gl.getAttribLocation(prog, name);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, off);
    });
    meshes[shape] = { vao, count: data.length / 9 };
  }
  const textures = await Promise.all(domains.map((d) => signTexture(gl, d.sign)));

  const signs = links.map((a, i) => ({ link: a, el: a.querySelector("svg.sign"), domain: domains[i], tex: textures[i], rx: 0, ry: 0, s: 1, lit: 0 }));
  const state = { w: 1, h: 1, dpr: 1, px: null, py: null, hover: -1, running: false, raf: 0, last: 0, sweepUntil: 0, visible: true, night: true };

  function layout() {
    const r = board.getBoundingClientRect();
    state.w = Math.max(1, r.width); state.h = Math.max(1, r.height);
    state.dpr = Math.min(window.devicePixelRatio || 1, (navigator.hardwareConcurrency || 4) >= 8 ? 2 : 1.5);
    canvas.width = Math.round(state.w * state.dpr); canvas.height = Math.round(state.h * state.dpr);
    for (const s of signs) {
      const e = s.el.getBoundingClientRect();
      s.cx = e.left - r.left + e.width / 2; s.cy = e.top - r.top + e.height / 2; s.size = e.width;
    }
    kick();
  }

  function frame(now) {
    state.raf = 0;
    const dt = Math.min(0.05, (now - (state.last || now)) / 1000);
    state.last = now;
    const W = state.w, H = state.h, dist = (H / 2) / Math.tan(FOV / 2);
    // Faisceau : pointeur, ou balayage lent au chargement (écrans tactiles, avant tout mouvement)
    let bx = state.px, by = state.py;
    if (now < state.sweepUntil) {
      const t = 1 - (state.sweepUntil - now) / 1600;
      bx = W * (0.1 + 0.8 * t); by = H * 0.38;
    } else if (bx == null) {
      bx = W * 0.5; by = -H;                                   // au repos : faisceau hors du panneau
    }
    const target = [bx - W / 2, H / 2 - by, 0];
    const light = [0, 40, dist];
    const dir = [target[0] - light[0], target[1] - light[1], target[2] - light[2]];
    const dl = Math.hypot(...dir) || 1;
    let moving = now < state.sweepUntil;
    const k = Math.min(1, dt * 9);
    signs.forEach((s, i) => {
      const hovered = i === state.hover;
      const tx = Math.max(-1, Math.min(1, (target[1] - (H / 2 - s.cy)) / 260)) * -MAX_TILT;
      const ty = Math.max(-1, Math.min(1, (target[0] - (s.cx - W / 2)) / 260)) * MAX_TILT;
      const goal = { rx: hovered ? tx * 0.4 : tx, ry: hovered ? ty * 0.4 : ty, s: hovered ? 1.08 : 1, lit: hovered ? 0.35 : 0 };
      for (const key of ["rx", "ry", "s", "lit"]) {
        const d = goal[key] - s[key];
        if (Math.abs(d) > 1e-4) { s[key] += d * k; moving = true; } else s[key] = goal[key];
      }
    });

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.useProgram(prog);
    gl.uniformMatrix4fv(U.uProj, false, m4.perspective(FOV, W / H, 1, dist * 4));
    gl.uniformMatrix4fv(U.uView, false, m4.translation(0, 0, -dist));
    gl.uniform3f(U.uCam, 0, 0, dist);
    gl.uniform3f(U.uLight, light[0], light[1], light[2]);
    gl.uniform3f(U.uSpot, dir[0] / dl, dir[1] / dl, dir[2] / dl);
    gl.uniform1f(U.uCosIn, Math.cos(Math.atan(70 / dist)));
    gl.uniform1f(U.uCosOut, Math.cos(Math.atan(150 / dist)));
    gl.uniform1f(U.uAmbient, 0.2);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(U.uTex, 0);
    for (const s of signs) {
      const mesh = meshes[s.domain._shape];
      const model = m4.mul(m4.translation(s.cx - W / 2, H / 2 - s.cy, 0), m4.mul(m4.rotY(s.ry), m4.mul(m4.rotX(s.rx), m4.scale(s.size * s.s))));
      gl.uniformMatrix4fv(U.uModel, false, model);
      gl.uniform1f(U.uBoost, s.lit);
      gl.bindTexture(gl.TEXTURE_2D, s.tex);
      gl.bindVertexArray(mesh.vao);
      gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
    }
    if (!board.classList.contains("is-night") && state.night) board.classList.add("is-night");
    if (moving && state.visible) kick();
  }

  function kick() {
    if (!state.raf && state.visible && state.night) state.raf = requestAnimationFrame(frame);
  }

  // Pointeur : souris (survol) ou doigt (glissé). Le canevas ne capte rien : les liens restent cliquables.
  const onMove = (e) => {
    const r = board.getBoundingClientRect();
    state.px = e.clientX - r.left; state.py = e.clientY - r.top;
    state.hover = signs.findIndex((s) => Math.hypot(state.px - s.cx, state.py - s.cy) < s.size * 0.55);
    kick();
  };
  const onLeave = () => { state.px = state.py = null; state.hover = -1; kick(); };
  board.addEventListener("pointermove", onMove, { passive: true });
  board.addEventListener("pointerdown", onMove, { passive: true });
  board.addEventListener("pointerleave", onLeave);
  // Clavier : le focus sur un lien allume son panneau
  signs.forEach((s, i) => {
    s.link.addEventListener("focus", () => { state.hover = i; state.px = s.cx; state.py = s.cy; kick(); });
    s.link.addEventListener("blur", onLeave);
  });

  // « Le jour se lève » : la nuit ne dure que tant que le héros est bien visible ; pause hors écran et onglet masqué
  const io = new IntersectionObserver(([en]) => {
    state.night = en.intersectionRatio > 0.45;
    state.visible = en.isIntersecting;
    board.classList.toggle("is-night", state.night);
    canvas.classList.toggle("is-off", !state.night);
    kick();
  }, { threshold: [0, 0.45, 1] });
  io.observe(board);
  const onVis = () => { state.visible = !document.hidden; kick(); };
  document.addEventListener("visibilitychange", onVis);
  const ro = new ResizeObserver(layout);
  ro.observe(board);

  const stop = () => {
    io.disconnect(); ro.disconnect();
    document.removeEventListener("visibilitychange", onVis);
    board.removeEventListener("pointermove", onMove);
    board.removeEventListener("pointerdown", onMove);
    board.removeEventListener("pointerleave", onLeave);
    if (state.raf) cancelAnimationFrame(state.raf);
    board.classList.remove("is-night");
    canvas.remove();
    const lose = gl.getExtension("WEBGL_lose_context");
    if (lose) lose.loseContext();
  };
  canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); stop(); });
  window.addEventListener("pagehide", stop, { once: true });

  board.appendChild(canvas);
  layout();
  state.sweepUntil = performance.now() + 1600;           // un seul balayage lent au chargement, puis plus rien
  kick();
  return stop;
}
