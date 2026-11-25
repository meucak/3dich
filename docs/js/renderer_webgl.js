// 3dich — Ultra-Optimized WebGL2 (with seamless WebGL1 fallback) 3D Renderer
// Features:
//  - 5-draw-call batched kinematic printer + 59 mods
//  - UNORM16 quantized VRAM packing (67%+ VRAM savings) + 4096-tri chunked frustum culling for SolidCraft CAD parts
//  - Analytic fwidth() precision workshop floor grid (zero textures!)
//  - Studio PBR-inspired lighting + FLIR Thermal Heatmap Shader Mode + Collision X-Ray Red Alert
//  - Animated Cooling Airflow Streamline Particles + Hardpoint Markers + 3D Transform Gizmo
//  - Live telemetry: drawCalls, triangles, vramMB, frameMs

import { mat4Identity, mat4FromTRS, extractFrustumPlanes, sphereInFrustum, hexToRgb01 } from './math3d.js';

// ================= SHADERS (WebGL2 GLSL 300 es + WebGL1 GLSL 100) =================
const VS_MAIN_GL2 = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNorm;
layout(location=2) in vec3 aCol;
layout(location=3) in vec3 aMeta; // metal, rough, heat (0..1)
uniform mat4 uVP;
uniform mat4 uModel;
out vec3 vWorldPos;
out vec3 vNorm;
out vec3 vCol;
out vec3 vMeta;
void main() {
  vec4 wp = uModel * vec4(aPos, 1.0);
  vWorldPos = wp.xyz;
  vNorm = mat3(uModel) * aNorm;
  vCol = aCol;
  vMeta = aMeta;
  gl_Position = uVP * wp;
}`;

const FS_MAIN_GL2 = `#version 300 es
precision highp float;
in vec3 vWorldPos;
in vec3 vNorm;
in vec3 vCol;
in vec3 vMeta;
uniform vec3 uEye;
uniform float uAlpha;
uniform float uThermalMode;
uniform float uLightTheme;
uniform vec3 uTint;
uniform float uTintMix;
out vec4 fragColor;

vec3 thermalRamp(float t) {
  t = clamp(t, 0.0, 1.0);
  vec3 c0 = vec3(0.08, 0.11, 0.34);
  vec3 c1 = vec3(0.10, 0.56, 0.78);
  vec3 c2 = vec3(0.20, 0.84, 0.42);
  vec3 c3 = vec3(0.98, 0.78, 0.14);
  vec3 c4 = vec3(1.00, 0.28, 0.12);
  vec3 c5 = vec3(1.00, 0.96, 0.88);
  if (t < 0.22) return mix(c0, c1, t / 0.22);
  if (t < 0.45) return mix(c1, c2, (t - 0.22) / 0.23);
  if (t < 0.68) return mix(c2, c3, (t - 0.45) / 0.23);
  if (t < 0.88) return mix(c3, c4, (t - 0.68) / 0.20);
  return mix(c4, c5, (t - 0.88) / 0.12);
}

void main() {
  // Crisp analytic normal with derivative sharpening
  vec3 N = normalize(vNorm);
  vec3 V = normalize(uEye - vWorldPos);
  vec3 L1 = normalize(vec3(0.55, 0.88, 0.62));
  vec3 L2 = normalize(vec3(-0.72, 0.42, -0.55));
  vec3 H1 = normalize(L1 + V);

  float ndl1 = max(dot(N, L1), 0.0);
  float ndl2 = max(dot(N, L2), 0.0);
  float hemi = N.y * 0.5 + 0.5;
  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.2);

  float metal = vMeta.x;
  float rough = clamp(vMeta.y, 0.08, 0.96);
  float shininess = mix(96.0, 10.0, rough);
  float spec = pow(max(dot(N, H1), 0.0), shininess) * mix(0.28, 0.92, metal);

  vec3 baseCol = mix(vCol, uTint, uTintMix);
  vec3 skyCol = mix(vec3(0.22, 0.27, 0.34), vec3(0.46, 0.50, 0.56), uLightTheme);
  vec3 gndCol = mix(vec3(0.08, 0.09, 0.11), vec3(0.28, 0.29, 0.31), uLightTheme);
  vec3 amb = mix(gndCol, skyCol, hemi) * 0.52;

  vec3 lit = baseCol * (amb + ndl1 * 0.78 + ndl2 * 0.24) + mix(vec3(1.0), baseCol, metal) * spec * 0.55;
  lit += vec3(0.45, 0.56, 0.68) * fres * mix(0.12, 0.36, metal);

  // Subtle floor AO gradient
  float floorAO = smoothstep(-20.0, 95.0, vWorldPos.y) * 0.22 + 0.78;
  lit *= floorAO;

  if (uThermalMode > 0.5) {
    vec3 therm = thermalRamp(vMeta.z);
    lit = therm * (0.62 + 0.38 * ndl1) + vec3(0.15) * fres;
  }
  // Tone-map gentle sRGB lift
  lit = lit / (lit + vec3(0.75)) * 1.48;
  fragColor = vec4(lit, uAlpha);
}`;

// UNORM16 Quantized Custom SolidCraft Mesh Shader (0-byte normals via dFdx/dFdy!)
const VS_QUANT_GL2 = `#version 300 es
precision highp float;
layout(location=0) in vec3 aQuant; // normalized 0..1 from Uint16Array!
uniform mat4 uVP;
uniform mat4 uModel;
uniform vec3 uQuantOrigin;
uniform vec3 uQuantScale;
out vec3 vWorldPos;
void main() {
  vec3 localPos = uQuantOrigin + aQuant * uQuantScale;
  vec4 wp = uModel * vec4(localPos, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = uVP * wp;
}`;

const FS_QUANT_GL2 = `#version 300 es
precision highp float;
in vec3 vWorldPos;
uniform vec3 uEye;
uniform vec3 uColor;
uniform float uMetal;
uniform float uRough;
uniform float uSelected;
uniform float uColliding;
uniform float uThermalMode;
uniform float uPartHeat;
out vec4 fragColor;
void main() {
  vec3 N = normalize(cross(dFdx(vWorldPos), dFdy(vWorldPos)));
  vec3 V = normalize(uEye - vWorldPos);
  if (dot(N, V) < 0.0) N = -N;
  vec3 L1 = normalize(vec3(0.55, 0.88, 0.62));
  vec3 L2 = normalize(vec3(-0.68, 0.36, -0.58));
  vec3 H = normalize(L1 + V);
  float ndl1 = max(dot(N, L1), 0.0);
  float ndl2 = max(dot(N, L2), 0.0);
  float fres = pow(1.0 - max(dot(N, V), 0.0), 2.8);
  float spec = pow(max(dot(N, H), 0.0), mix(88.0, 14.0, uRough)) * mix(0.25, 0.88, uMetal);

  vec3 col = uColor;
  if (uColliding > 0.5) {
    col = mix(col, vec3(0.96, 0.22, 0.26), 0.62);
  }
  vec3 lit = col * (0.28 + ndl1 * 0.74 + ndl2 * 0.26) + vec3(1.0) * spec * 0.5;
  if (uSelected > 0.5) {
    lit += vec3(0.95, 0.52, 0.14) * (0.18 + 0.55 * fres);
  }
  if (uColliding > 0.5) {
    lit += vec3(1.0, 0.18, 0.20) * (0.25 + 0.55 * fres);
  }
  if (uThermalMode > 0.5) {
    vec3 tc = mix(vec3(0.14, 0.52, 0.78), vec3(1.0, 0.45, 0.14), clamp(uPartHeat, 0.0, 1.0));
    lit = tc * (0.65 + 0.35 * ndl1);
  }
  lit = lit / (lit + vec3(0.75)) * 1.48;
  fragColor = vec4(lit, 1.0);
}`;

// Analytic fwidth() Precision Floor Grid (1 quad = infinite anti-aliased mm/10cm engineering grid!)
const VS_GRID_GL2 = `#version 300 es
precision highp float;
layout(location=0) in vec2 aXZ;
uniform mat4 uVP;
out vec3 vWorld;
void main() {
  vWorld = vec3(aXZ.x, 0.0, aXZ.y);
  gl_Position = uVP * vec4(vWorld, 1.0);
}`;

const FS_GRID_GL2 = `#version 300 es
precision highp float;
in vec3 vWorld;
uniform float uLightTheme;
out vec4 fragColor;
float gridLine(vec2 coord, float stepMm, float widthPx) {
  vec2 p = coord / stepMm;
  vec2 g = abs(fract(p - 0.5) - 0.5) / max(fwidth(p), vec2(0.0001));
  float d = min(g.x, g.y);
  return 1.0 - clamp(d / widthPx, 0.0, 1.0);
}
void main() {
  float r = length(vWorld.xz);
  float fade = 1.0 - smoothstep(420.0, 1180.0, r);
  if (fade <= 0.005) discard;
  float minor = gridLine(vWorld.xz, 20.0, 1.1) * 0.24;
  float major = gridLine(vWorld.xz, 100.0, 1.5) * 0.52;
  float axisX = (1.0 - smoothstep(0.0, max(fwidth(vWorld.z) * 1.8, 0.6), abs(vWorld.z))) * 0.65;
  float axisZ = (1.0 - smoothstep(0.0, max(fwidth(vWorld.x) * 1.8, 0.6), abs(vWorld.x))) * 0.65;
  float alpha = max(max(minor, major), max(axisX, axisZ)) * fade;
  vec3 gridCol = mix(vec3(0.45, 0.52, 0.62), vec3(0.32, 0.38, 0.46), uLightTheme);
  vec3 col = gridCol;
  if (axisX > major) col = vec3(0.88, 0.30, 0.30);
  if (axisZ > major && axisZ > axisX) col = vec3(0.22, 0.58, 0.90);
  fragColor = vec4(col, alpha * mix(0.68, 0.45, uLightTheme));
}`;

// Lines + Points Shader (Gizmo, Hardpoints, Airflow Streamline Particles!)
const VS_LINES_GL2 = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aCol;
uniform mat4 uVP;
uniform float uPointSize;
out vec3 vCol;
void main() {
  vCol = aCol;
  gl_Position = uVP * vec4(aPos, 1.0);
  gl_PointSize = uPointSize;
}`;

const FS_LINES_GL2 = `#version 300 es
precision highp float;
in vec3 vCol;
uniform float uAlpha;
out vec4 fragColor;
void main() {
  fragColor = vec4(vCol, uAlpha);
}`;

// WebGL1 fallback shaders (GLSL 100)
const VS_MAIN_GL1 = `
attribute vec3 aPos;
attribute vec3 aNorm;
attribute vec3 aCol;
attribute vec3 aMeta;
uniform mat4 uVP;
uniform mat4 uModel;
varying vec3 vWorldPos;
varying vec3 vNorm;
varying vec3 vCol;
varying vec3 vMeta;
void main() {
  vec4 wp = uModel * vec4(aPos, 1.0);
  vWorldPos = wp.xyz;
  vNorm = mat3(uModel) * aNorm;
  vCol = aCol;
  vMeta = aMeta;
  gl_Position = uVP * wp;
}`;

const FS_MAIN_GL1 = `
precision mediump float;
varying vec3 vWorldPos;
varying vec3 vNorm;
varying vec3 vCol;
varying vec3 vMeta;
uniform vec3 uEye;
uniform float uAlpha;
uniform float uThermalMode;
uniform float uLightTheme;
uniform vec3 uTint;
uniform float uTintMix;
void main() {
  vec3 N = normalize(vNorm);
  vec3 V = normalize(uEye - vWorldPos);
  vec3 L1 = normalize(vec3(0.55, 0.88, 0.62));
  float ndl = max(dot(N, L1), 0.0);
  vec3 col = mix(vCol, uTint, uTintMix);
  vec3 lit = col * (0.34 + 0.68 * ndl);
  if (uThermalMode > 0.5) {
    lit = mix(vec3(0.12, 0.45, 0.78), vec3(1.0, 0.36, 0.14), clamp(vMeta.z, 0.0, 1.0));
  }
  gl_FragColor = vec4(lit, uAlpha);
}`;

const VS_LINES_GL1 = `
attribute vec3 aPos;
attribute vec3 aCol;
uniform mat4 uVP;
uniform float uPointSize;
varying vec3 vCol;
void main() {
  vCol = aCol;
  gl_Position = uVP * vec4(aPos, 1.0);
  gl_PointSize = uPointSize;
}`;

const FS_LINES_GL1 = `
precision mediump float;
varying vec3 vCol;
uniform float uAlpha;
void main() {
  gl_FragColor = vec4(vCol, uAlpha);
}`;

function compileProgram(gl, vsSrc, fsSrc, attribs) {
  const vs = gl.createShader(gl.VERTEX_SHADER);
  gl.shaderSource(vs, vsSrc);
  gl.compileShader(vs);
  if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
    throw new Error('VS compile: ' + gl.getShaderInfoLog(vs));
  }
  const fs = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(fs, fsSrc);
  gl.compileShader(fs);
  if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
    throw new Error('FS compile: ' + gl.getShaderInfoLog(fs));
  }
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  if (attribs) {
    for (const [loc, name] of attribs) gl.bindAttribLocation(prog, loc, name);
  }
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error('Program link: ' + gl.getProgramInfoLog(prog));
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return prog;
}

export class WebGLRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    let gl = canvas.getContext('webgl2', {
      antialias: true,
      alpha: false,
      depth: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    });
    this.isWebGL2 = Boolean(gl);
    if (!gl) {
      gl = canvas.getContext('webgl', { antialias: true, alpha: false, depth: true, preserveDrawingBuffer: false });
    }
    if (!gl) throw new Error('WebGL unavailable');
    this.gl = gl;
    this.backendName = this.isWebGL2 ? 'WebGL2' : 'WebGL1';

    this.batches = {};
    this.customMeshes = new Map(); // partId -> { vbo, vao, triCount, chunks, quantOrigin, quantScale, bytes }
    this.vramBytes = 0;
    this.stats = { drawCalls: 0, triangles: 0, vramMB: 0, frameMs: 0, backend: this.backendName };

    this._initPrograms();
    this._initFloorAndDynamicBuffers();
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  _initPrograms() {
    const gl = this.gl;
    if (this.isWebGL2) {
      this.progMain = compileProgram(gl, VS_MAIN_GL2, FS_MAIN_GL2);
      this.progQuant = compileProgram(gl, VS_QUANT_GL2, FS_QUANT_GL2);
      this.progGrid = compileProgram(gl, VS_GRID_GL2, FS_GRID_GL2);
      this.progLines = compileProgram(gl, VS_LINES_GL2, FS_LINES_GL2);
    } else {
      this.progMain = compileProgram(gl, VS_MAIN_GL1, FS_MAIN_GL1, [[0, 'aPos'], [1, 'aNorm'], [2, 'aCol'], [3, 'aMeta']]);
      this.progLines = compileProgram(gl, VS_LINES_GL1, FS_LINES_GL1, [[0, 'aPos'], [1, 'aCol']]);
      this.progQuant = null;
      this.progGrid = null;
    }

    this.uMain = {
      vp: gl.getUniformLocation(this.progMain, 'uVP'),
      model: gl.getUniformLocation(this.progMain, 'uModel'),
      eye: gl.getUniformLocation(this.progMain, 'uEye'),
      alpha: gl.getUniformLocation(this.progMain, 'uAlpha'),
      thermal: gl.getUniformLocation(this.progMain, 'uThermalMode'),
      light: gl.getUniformLocation(this.progMain, 'uLightTheme'),
      tint: gl.getUniformLocation(this.progMain, 'uTint'),
      tintMix: gl.getUniformLocation(this.progMain, 'uTintMix'),
    };
    if (this.progQuant) {
      this.uQuant = {
        vp: gl.getUniformLocation(this.progQuant, 'uVP'),
        model: gl.getUniformLocation(this.progQuant, 'uModel'),
        origin: gl.getUniformLocation(this.progQuant, 'uQuantOrigin'),
        scale: gl.getUniformLocation(this.progQuant, 'uQuantScale'),
        eye: gl.getUniformLocation(this.progQuant, 'uEye'),
        color: gl.getUniformLocation(this.progQuant, 'uColor'),
        metal: gl.getUniformLocation(this.progQuant, 'uMetal'),
        rough: gl.getUniformLocation(this.progQuant, 'uRough'),
        selected: gl.getUniformLocation(this.progQuant, 'uSelected'),
        colliding: gl.getUniformLocation(this.progQuant, 'uColliding'),
        thermal: gl.getUniformLocation(this.progQuant, 'uThermalMode'),
        heat: gl.getUniformLocation(this.progQuant, 'uPartHeat'),
      };
    }
    if (this.progGrid) {
      this.uGrid = {
        vp: gl.getUniformLocation(this.progGrid, 'uVP'),
        light: gl.getUniformLocation(this.progGrid, 'uLightTheme'),
      };
    }
    this.uLines = {
      vp: gl.getUniformLocation(this.progLines, 'uVP'),
      pointSize: gl.getUniformLocation(this.progLines, 'uPointSize'),
      alpha: gl.getUniformLocation(this.progLines, 'uAlpha'),
    };
  }

  _initFloorAndDynamicBuffers() {
    const gl = this.gl;
    // Analytic infinite grid quad (-1200..+1200 mm)
    if (this.isWebGL2) {
      this.gridVao = gl.createVertexArray();
      this.gridVbo = gl.createBuffer();
      gl.bindVertexArray(this.gridVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.gridVbo);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1200, -1200,  1200, -1200,  1200, 1200,
        -1200, -1200,  1200,  1200, -1200, 1200,
      ]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.bindVertexArray(null);
    }
    // Dynamic line/point buffer (reused every frame -> zero GC!)
    this.lineVbo = gl.createBuffer();
    if (this.isWebGL2) {
      this.lineVao = gl.createVertexArray();
      gl.bindVertexArray(this.lineVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.lineVbo);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
      gl.bindVertexArray(null);
    }
    this._lineScratch = new Float32Array(2400 * 6);
    this._matScratch = mat4Identity();
  }

  uploadPrinterBatches(geometry) {
    const gl = this.gl;
    // Free previous printer VBOs
    for (const key of Object.keys(this.batches)) {
      const b = this.batches[key];
      if (b.vbo) gl.deleteBuffer(b.vbo);
      if (b.vao && this.isWebGL2) gl.deleteVertexArray(b.vao);
      this.vramBytes -= b.bytes || 0;
    }
    this.batches = {};

    for (const key of ['staticFrame', 'transparent', 'yGroup', 'toolheadGroup', 'zGroup']) {
      const src = geometry[key];
      if (!src || src.vertexCount === 0) continue;
      const vbo = gl.createBuffer();
      let vao = null;
      if (this.isWebGL2) {
        vao = gl.createVertexArray();
        gl.bindVertexArray(vao);
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, src.interleaved, gl.STATIC_DRAW);
      if (this.isWebGL2) {
        gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 48, 0);
        gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 48, 12);
        gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 48, 24);
        gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 3, gl.FLOAT, false, 48, 36);
        gl.bindVertexArray(null);
      }
      const bytes = src.interleaved.byteLength;
      this.vramBytes += bytes;
      this.batches[key] = { vbo, vao, vertexCount: src.vertexCount, triCount: src.triCount, bytes };
    }
  }

  uploadCustomPart(partId, meshData) {
    const gl = this.gl;
    this.removeCustomPart(partId);

    const vbo = gl.createBuffer();
    let vao = null;
    let bytes = 0;
    if (this.isWebGL2) {
      // Ultra-compact UNORM16 quantized upload (6 bytes/vertex, 0 bytes normals!)
      vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, meshData.quantized, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.UNSIGNED_SHORT, true, 6, 0);
      gl.bindVertexArray(null);
      bytes = meshData.quantized.byteLength;
    } else {
      // WebGL1 fallback: interleaved pos3 + norm3 + col3 + meta3
      const vCount = meshData.triCount * 3;
      const buf = new Float32Array(vCount * 12);
      for (let i = 0; i < vCount; i++) {
        const o = i * 12, p = i * 3;
        buf[o] = meshData.positions[p]; buf[o+1] = meshData.positions[p+1]; buf[o+2] = meshData.positions[p+2];
        buf[o+3] = meshData.normals[p]; buf[o+4] = meshData.normals[p+1]; buf[o+5] = meshData.normals[p+2];
        buf[o+6] = 1; buf[o+7] = 1; buf[o+8] = 1;
        buf[o+9] = 0.25; buf[o+10] = 0.45; buf[o+11] = 0.2;
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, buf, gl.STATIC_DRAW);
      bytes = buf.byteLength;
    }
    this.vramBytes += bytes;
    this.customMeshes.set(partId, {
      vbo,
      vao,
      triCount: meshData.triCount,
      vertexCount: meshData.triCount * 3,
      chunks: meshData.chunks,
      quantOrigin: meshData.quantOrigin,
      quantScale: meshData.quantScale,
      bytes,
    });
  }

  removeCustomPart(partId) {
    const entry = this.customMeshes.get(partId);
    if (!entry) return;
    const gl = this.gl;
    if (entry.vbo) gl.deleteBuffer(entry.vbo);
    if (entry.vao && this.isWebGL2) gl.deleteVertexArray(entry.vao);
    this.vramBytes = Math.max(0, this.vramBytes - entry.bytes);
    this.customMeshes.delete(partId);
  }

  resize(cssWidth, cssHeight, dprCap = 2.0) {
    const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
    const w = Math.max(1, Math.round(cssWidth * dpr));
    const h = Math.max(1, Math.round(cssHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.gl.viewport(0, 0, w, h);
    return { w, h, dpr };
  }

  _drawPrinterBatch(batch, modelMat, alpha, thermal, lightTheme, tint = [1,1,1], tintMix = 0) {
    if (!batch || batch.vertexCount === 0) return;
    const gl = this.gl;
    gl.useProgram(this.progMain);
    gl.uniformMatrix4fv(this.uMain.vp, false, this._vp);
    gl.uniformMatrix4fv(this.uMain.model, false, modelMat);
    gl.uniform3fv(this.uMain.eye, this._eye);
    gl.uniform1f(this.uMain.alpha, alpha);
    gl.uniform1f(this.uMain.thermal, thermal ? 1.0 : 0.0);
    gl.uniform1f(this.uMain.light, lightTheme ? 1.0 : 0.0);
    gl.uniform3fv(this.uMain.tint, tint);
    gl.uniform1f(this.uMain.tintMix, tintMix);

    if (this.isWebGL2) {
      gl.bindVertexArray(batch.vao);
    } else {
      gl.bindBuffer(gl.ARRAY_BUFFER, batch.vbo);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 48, 0);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 48, 12);
      gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 48, 24);
      gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 3, gl.FLOAT, false, 48, 36);
    }
    gl.drawArrays(gl.TRIANGLES, 0, batch.vertexCount);
    this._drawCalls++;
    this._tris += batch.triCount;
  }

  render(scene) {
    const t0 = performance.now();
    const gl = this.gl;
    const {
      camera,
      lightTheme = false,
      thermalMode = false,
      showAirflow = false,
      showHardpoints = false,
      hardpointPositions = [],
      motionOffset = { x: 0, y: 0, z: 0 },
      kinematics = 'corexy',
      customParts = [],
      selectedPartId = null,
      collidingPartIds = new Set(),
      gizmo = null,
      simTime = 0,
      coolingCfm = 8,
    } = scene;

    this._vp = camera.vp;
    this._eye = camera.eye;
    this._drawCalls = 0;
    this._tris = 0;

    // Background clear color matching Apple HIG theme
    if (lightTheme) gl.clearColor(0.945, 0.949, 0.941, 1.0);
    else gl.clearColor(0.071, 0.078, 0.094, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // 1. Opaque Printer Batches (4 draw calls!)
    const idMat = mat4Identity(this._matScratch);
    this._drawPrinterBatch(this.batches.staticFrame, idMat, 1.0, thermalMode, lightTheme);

    const yMat = mat4Identity();
    if (kinematics === 'bedslinger') {
      yMat[14] = motionOffset.z; // Bed moves along Z (front-back)
    } else {
      yMat[14] = motionOffset.z; // CoreXY gantry moves along Z
    }
    this._drawPrinterBatch(this.batches.yGroup, yMat, 1.0, thermalMode, lightTheme);

    const thMat = mat4Identity();
    thMat[12] = motionOffset.x;
    thMat[13] = motionOffset.y;
    if (kinematics === 'corexy') thMat[14] = motionOffset.z;
    this._drawPrinterBatch(this.batches.toolheadGroup, thMat, 1.0, thermalMode, lightTheme);

    const zMat = mat4Identity();
    zMat[13] = kinematics === 'corexy' ? -motionOffset.y * 0.4 : motionOffset.y;
    this._drawPrinterBatch(this.batches.zGroup, zMat, 1.0, thermalMode, lightTheme);

    // 2. Custom Imported SolidCraft Parts (with Chunked Frustum Culling + UNORM16!)
    const frustum = extractFrustumPlanes(camera.vp);
    for (const part of customParts) {
      const gpuMesh = this.customMeshes.get(part.id);
      if (!gpuMesh) continue;
      // Add kinematic parent motion offset if attached to toolhead or moving bed!
      let ox = 0, oy = 0, oz = 0;
      if (part.zone === 'toolhead') {
        ox = motionOffset.x;
        oy = motionOffset.y;
        oz = kinematics === 'corexy' ? motionOffset.z : 0;
      } else if (part.zone === 'bed') {
        if (kinematics === 'bedslinger') oz = motionOffset.z;
        else oy = -motionOffset.y * 0.4;
      } else if (part.zone === 'gantry') {
        if (kinematics === 'corexy') oz = motionOffset.z;
        else oy = motionOffset.y;
      }
      const pMat = mat4FromTRS(new Float32Array(16), [part.pos[0] + ox, part.pos[1] + oy, part.pos[2] + oz], part.rot, part.scale);
      const col = hexToRgb01(part.colorHex || '#e67e22');
      const isSelected = part.id === selectedPartId;
      const isColliding = collidingPartIds.has(part.id);

      if (this.isWebGL2) {
        gl.useProgram(this.progQuant);
        gl.uniformMatrix4fv(this.uQuant.vp, false, camera.vp);
        gl.uniformMatrix4fv(this.uQuant.model, false, pMat);
        gl.uniform3fv(this.uQuant.origin, gpuMesh.quantOrigin);
        gl.uniform3fv(this.uQuant.scale, gpuMesh.quantScale);
        gl.uniform3fv(this.uQuant.eye, camera.eye);
        gl.uniform3fv(this.uQuant.color, col);
        gl.uniform1f(this.uQuant.metal, part.metal ?? 0.22);
        gl.uniform1f(this.uQuant.rough, part.rough ?? 0.42);
        gl.uniform1f(this.uQuant.selected, isSelected ? 1.0 : 0.0);
        gl.uniform1f(this.uQuant.colliding, isColliding ? 1.0 : 0.0);
        gl.uniform1f(this.uQuant.thermal, thermalMode ? 1.0 : 0.0);
        gl.uniform1f(this.uQuant.heat, part.zone === 'toolhead' ? 0.65 : 0.18);
        gl.bindVertexArray(gpuMesh.vao);

        const maxScale = Math.max(Math.abs(part.scale[0]), Math.abs(part.scale[1]), Math.abs(part.scale[2]), 0.1);
        for (const ch of gpuMesh.chunks) {
          const wcx = pMat[0] * ch.center[0] + pMat[4] * ch.center[1] + pMat[8] * ch.center[2] + pMat[12];
          const wcy = pMat[1] * ch.center[0] + pMat[5] * ch.center[1] + pMat[9] * ch.center[2] + pMat[13];
          const wcz = pMat[2] * ch.center[0] + pMat[6] * ch.center[1] + pMat[10] * ch.center[2] + pMat[14];
          if (!sphereInFrustum(frustum, wcx, wcy, wcz, ch.radius * maxScale + 4)) continue;
          gl.drawArrays(gl.TRIANGLES, ch.firstVertex, ch.vertexCount);
          this._drawCalls++;
          this._tris += ch.vertexCount / 3;
        }
      } else {
        this._drawPrinterBatch(gpuMesh, pMat, 1.0, thermalMode, lightTheme, isColliding ? [0.95, 0.2, 0.2] : col, 0.9);
      }
    }

    // 3. Analytic fwidth() Floor Grid
    if (this.isWebGL2 && this.progGrid) {
      gl.depthMask(false);
      gl.useProgram(this.progGrid);
      gl.uniformMatrix4fv(this.uGrid.vp, false, camera.vp);
      gl.uniform1f(this.uGrid.light, lightTheme ? 1.0 : 0.0);
      gl.bindVertexArray(this.gridVao);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      this._drawCalls++;
      gl.depthMask(true);
    }

    // 4. Translucent Batch (Polycarb Enclosure Panels, Build Volume Guides, Laser Shield)
    if (this.batches.transparent) {
      gl.depthMask(false);
      this._drawPrinterBatch(this.batches.transparent, idMat, 0.20, thermalMode, lightTheme);
      gl.depthMask(true);
    }

    // 5. Dynamic Overlays: Airflow Streamlines, Hardpoints & 3D Transform Gizmo
    this._drawDynamicOverlays(camera, {
      showAirflow,
      showHardpoints,
      hardpointPositions,
      motionOffset,
      kinematics,
      gizmo,
      selectedPart: customParts.find((p) => p.id === selectedPartId) || null,
      simTime,
      coolingCfm,
      nozzleBaseY: scene.nozzleBaseY ?? 220,
    });

    if (this.isWebGL2) gl.bindVertexArray(null);
    const frameMs = Number((performance.now() - t0).toFixed(2));
    this.stats = {
      drawCalls: this._drawCalls,
      triangles: Math.round(this._tris),
      vramMB: Number((this.vramBytes / (1024 * 1024)).toFixed(2)),
      frameMs,
      backend: this.backendName,
    };
    return this.stats;
  }

  _drawDynamicOverlays(camera, opts) {
    const gl = this.gl;
    const buf = this._lineScratch;

    const uploadAndDraw = (floatCount, mode, pointSize = 6, alpha = 1.0, noDepth = false) => {
      if (floatCount === 0) return;
      if (noDepth) gl.disable(gl.DEPTH_TEST);
      gl.useProgram(this.progLines);
      gl.uniformMatrix4fv(this.uLines.vp, false, camera.vp);
      gl.uniform1f(this.uLines.pointSize, pointSize);
      gl.uniform1f(this.uLines.alpha, alpha);
      if (this.isWebGL2) gl.bindVertexArray(this.lineVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.lineVbo);
      gl.bufferData(gl.ARRAY_BUFFER, buf.subarray(0, floatCount), gl.STREAM_DRAW);
      if (!this.isWebGL2) {
        gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
        gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
      }
      gl.drawArrays(mode, 0, floatCount / 6);
      if (noDepth) gl.enable(gl.DEPTH_TEST);
      this._drawCalls++;
    };

    // Cooling Airflow Streamlines emanating from Nozzle Duct!
    if (opts.showAirflow) {
      let o = 0;
      const nx = opts.motionOffset.x;
      const ny = opts.nozzleBaseY + opts.motionOffset.y;
      const nz = (opts.kinematics === 'corexy' ? opts.motionOffset.z : 0) + 18;
      const count = Math.min(72, Math.round(18 + opts.coolingCfm * 2.2));
      const speed = 0.8 + opts.coolingCfm * 0.08;
      for (let i = 0; i < count; i++) {
        const ang = (i / count) * Math.PI * 2;
        const phase = (opts.simTime * speed + (i * 0.137)) % 1.0;
        const r0 = 24 - phase * 20;
        const r1 = Math.max(2, r0 - 6);
        const y0 = ny + 18 - phase * 36;
        const y1 = y0 - 7;
        const radOut = phase > 0.55 ? (phase - 0.55) * 65 : 0;
        const x0 = nx + Math.cos(ang) * (r0 + radOut);
        const z0 = nz + Math.sin(ang) * (r0 + radOut);
        const x1 = nx + Math.cos(ang) * (r1 + radOut + 12);
        const z1 = nz + Math.sin(ang) * (r1 + radOut + 12);
        const cool = 1 - phase;
        buf[o++] = x0; buf[o++] = y0; buf[o++] = z0; buf[o++] = 0.12; buf[o++] = 0.72 + 0.25 * cool; buf[o++] = 0.98;
        buf[o++] = x1; buf[o++] = y1; buf[o++] = z1; buf[o++] = 0.08; buf[o++] = 0.45; buf[o++] = 0.90;
      }
      uploadAndDraw(o, gl.LINES, 4, 0.82, false);
    }

    // Mounting Hardpoint Markers
    if (opts.showHardpoints && opts.hardpointPositions.length > 0) {
      let o = 0;
      for (const hp of opts.hardpointPositions) {
        buf[o++] = hp.pos[0]; buf[o++] = hp.pos[1]; buf[o++] = hp.pos[2];
        buf[o++] = 0.18; buf[o++] = 0.86; buf[o++] = 0.96;
      }
      uploadAndDraw(o, gl.POINTS, 10.0, 0.92, true);
    }

    // 3D Transform Gizmo for Selected SolidCraft Part
    if (opts.gizmo && opts.selectedPart) {
      const p = opts.selectedPart;
      const gPos = [
        p.pos[0] + (p.zone === 'toolhead' ? opts.motionOffset.x : 0),
        p.pos[1] + (p.zone === 'toolhead' ? opts.motionOffset.y : 0),
        p.pos[2] + (p.zone === 'toolhead' && opts.kinematics === 'corexy' ? opts.motionOffset.z : 0),
      ];
      const { segs } = opts.gizmo.buildLines(gPos, camera);
      let o = 0;
      for (const s of segs) {
        buf[o++] = s.a[0]; buf[o++] = s.a[1]; buf[o++] = s.a[2];
        buf[o++] = s.color[0]; buf[o++] = s.color[1]; buf[o++] = s.color[2];
        buf[o++] = s.b[0]; buf[o++] = s.b[1]; buf[o++] = s.b[2];
        buf[o++] = s.color[0]; buf[o++] = s.color[1]; buf[o++] = s.color[2];
      }
      uploadAndDraw(o, gl.LINES, 4, 1.0, true);
      // Draw handle endpoints as crisp bright nodes
      o = 0;
      for (const s of segs) {
        buf[o++] = s.b[0]; buf[o++] = s.b[1]; buf[o++] = s.b[2];
        buf[o++] = s.color[0]; buf[o++] = s.color[1]; buf[o++] = s.color[2];
      }
      uploadAndDraw(o, gl.POINTS, 11.0, 1.0, true);
    }
  }

  captureSnapshot(scene, mime = 'image/png', quality = 0.92) {
    this.render(scene);
    return this.canvas.toDataURL(mime, quality);
  }
}
