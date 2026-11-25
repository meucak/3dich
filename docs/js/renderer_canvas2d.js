// 3dich — Zero-Dependency Software Z-Sort Canvas2D Fallback Renderer
// Guarantees crisp 3D rendering even under --disable-gpu or non-WebGL browsers!

import { mat4Identity, mat4FromTRS, hexToRgb01 } from './math3d.js';

export class Canvas2DRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    if (!this.ctx) throw new Error('Canvas2D context unavailable');
    this.backendName = 'SW-2D';
    this.batches = {};
    this.customMeshes = new Map();
    this.stats = { drawCalls: 0, triangles: 0, vramMB: 0, frameMs: 0, backend: 'SW-2D' };
  }

  uploadPrinterBatches(geometry) {
    this.batches = geometry;
  }

  uploadCustomPart(partId, meshData) {
    this.customMeshes.set(partId, meshData);
  }

  removeCustomPart(partId) {
    this.customMeshes.delete(partId);
  }

  resize(cssWidth, cssHeight) {
    const w = Math.max(1, Math.round(cssWidth));
    const h = Math.max(1, Math.round(cssHeight));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    return { w, h, dpr: 1 };
  }

  render(scene) {
    const t0 = performance.now();
    const ctx = this.ctx;
    const w = this.canvas.width, h = this.canvas.height;
    const {
      camera, lightTheme = false, thermalMode = false,
      motionOffset = { x: 0, y: 0, z: 0 }, kinematics = 'corexy',
      customParts = [], selectedPartId = null, collidingPartIds = new Set(), gizmo = null,
    } = scene;

    ctx.fillStyle = lightTheme ? '#f1f2f0' : '#121418';
    ctx.fillRect(0, 0, w, h);

    const vp = camera.vp;
    const hw = w * 0.5, hh = h * 0.5;
    const project = (x, y, z) => {
      const cw = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
      if (cw <= 1.0) return null;
      const cx = (vp[0] * x + vp[4] * y + vp[8] * z + vp[12]) / cw;
      const cy = (vp[1] * x + vp[5] * y + vp[9] * z + vp[13]) / cw;
      return [(cx + 1) * hw, (1 - cy) * hh, cw];
    };

    // Draw subtle floor grid
    ctx.strokeStyle = lightTheme ? 'rgba(60,72,88,0.16)' : 'rgba(130,150,175,0.16)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let g = -400; g <= 400; g += 100) {
      const a = project(g, 0, -400), b = project(g, 0, 400);
      if (a && b) { ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
      const c = project(-400, 0, g), d = project(400, 0, g);
      if (c && d) { ctx.moveTo(c[0], c[1]); ctx.lineTo(d[0], d[1]); }
    }
    ctx.stroke();

    const drawList = [];
    const lightDir = [0.55, 0.85, 0.58];
    const lLen = Math.hypot(...lightDir);
    lightDir[0] /= lLen; lightDir[1] /= lLen; lightDir[2] /= lLen;

    const pushBatch = (batch, dx, dy, dz, alpha) => {
      if (!batch || !batch.interleaved) return;
      const d = batch.interleaved;
      const nTris = batch.triCount;
      for (let t = 0; t < nTris; t++) {
        const o = t * 36;
        const ax = d[o] + dx, ay = d[o+1] + dy, az = d[o+2] + dz;
        const bx = d[o+12] + dx, by = d[o+13] + dy, bz = d[o+14] + dz;
        const cx = d[o+24] + dx, cy = d[o+25] + dy, cz = d[o+26] + dz;
        const pa = project(ax, ay, az), pb = project(bx, by, bz), pc = project(cx, cy, cz);
        if (!pa || !pb || !pc) continue;
        // Backface cull in screen space
        const area = (pb[0] - pa[0]) * (pc[1] - pa[1]) - (pb[1] - pa[1]) * (pc[0] - pa[0]);
        if (area >= 0 && alpha > 0.9) continue;
        const nx = d[o+3], ny = d[o+4], nz = d[o+5];
        const shade = 0.34 + 0.66 * Math.max(0, nx * lightDir[0] + ny * lightDir[1] + nz * lightDir[2]);
        let r = d[o+6], g = d[o+7], bl = d[o+8];
        if (thermalMode) {
          const ht = d[o+11];
          r = 0.14 + ht * 0.86; g = 0.38 + Math.sin(ht * 3.14) * 0.52; bl = 0.82 * (1 - ht);
        }
        drawList.push({
          z: (pa[2] + pb[2] + pc[2]) * 0.3333,
          pa, pb, pc,
          fill: `rgba(${Math.round(Math.min(1, r * shade) * 255)},${Math.round(Math.min(1, g * shade) * 255)},${Math.round(Math.min(1, bl * shade) * 255)},${alpha})`,
        });
      }
    };

    pushBatch(this.batches.staticFrame, 0, 0, 0, 1);
    pushBatch(this.batches.yGroup, 0, 0, motionOffset.z, 1);
    pushBatch(this.batches.toolheadGroup, motionOffset.x, motionOffset.y, kinematics === 'corexy' ? motionOffset.z : 0, 1);
    pushBatch(this.batches.zGroup, 0, kinematics === 'corexy' ? -motionOffset.y * 0.4 : motionOffset.y, 0, 1);

    // Custom SolidCraft Parts (decimated stride if massive mesh for 60fps software safety)
    for (const part of customParts) {
      const m = this.customMeshes.get(part.id);
      if (!m) continue;
      const pMat = mat4FromTRS(new Float32Array(16), part.pos, part.rot, part.scale);
      const col = collidingPartIds.has(part.id) ? [0.95, 0.22, 0.25] : hexToRgb01(part.colorHex || '#f06a28');
      const step = Math.max(1, Math.floor(m.triCount / 1600));
      for (let t = 0; t < m.triCount; t += step) {
        const o = t * 9;
        const xf = (x, y, z) => [
          pMat[0]*x + pMat[4]*y + pMat[8]*z + pMat[12],
          pMat[1]*x + pMat[5]*y + pMat[9]*z + pMat[13],
          pMat[2]*x + pMat[6]*y + pMat[10]*z + pMat[14],
        ];
        const a = xf(m.positions[o], m.positions[o+1], m.positions[o+2]);
        const b = xf(m.positions[o+3], m.positions[o+4], m.positions[o+5]);
        const c = xf(m.positions[o+6], m.positions[o+7], m.positions[o+8]);
        const pa = project(a[0], a[1], a[2]), pb = project(b[0], b[1], b[2]), pc = project(c[0], c[1], c[2]);
        if (!pa || !pb || !pc) continue;
        const shade = 0.45 + 0.55 * Math.max(0, m.normals[o]*lightDir[0] + m.normals[o+1]*lightDir[1] + m.normals[o+2]*lightDir[2]);
        drawList.push({
          z: (pa[2] + pb[2] + pc[2]) * 0.3333,
          pa, pb, pc,
          fill: `rgb(${Math.round(col[0]*shade*255)},${Math.round(col[1]*shade*255)},${Math.round(col[2]*shade*255)})`,
        });
      }
    }

    pushBatch(this.batches.transparent, 0, 0, 0, 0.18);

    // Painter's depth sort (back-to-front)
    drawList.sort((a, b) => b.z - a.z);
    for (let i = 0; i < drawList.length; i++) {
      const tri = drawList[i];
      ctx.fillStyle = tri.fill;
      ctx.beginPath();
      ctx.moveTo(tri.pa[0], tri.pa[1]);
      ctx.lineTo(tri.pb[0], tri.pb[1]);
      ctx.lineTo(tri.pc[0], tri.pc[1]);
      ctx.closePath();
      ctx.fill();
    }

    // Gizmo overlay
    const sel = customParts.find((p) => p.id === selectedPartId);
    if (gizmo && sel) {
      const { segs } = gizmo.buildLines(sel.pos, camera);
      ctx.lineWidth = 3;
      for (const s of segs) {
        const a = project(s.a[0], s.a[1], s.a[2]);
        const b = project(s.b[0], s.b[1], s.b[2]);
        if (!a || !b) continue;
        ctx.strokeStyle = `rgb(${Math.round(s.color[0]*255)},${Math.round(s.color[1]*255)},${Math.round(s.color[2]*255)})`;
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      }
    }

    const frameMs = Number((performance.now() - t0).toFixed(2));
    this.stats = { drawCalls: 1, triangles: drawList.length, vramMB: 0, frameMs, backend: 'SW-2D' };
    return this.stats;
  }

  captureSnapshot(scene, mime = 'image/png', quality = 0.92) {
    this.render(scene);
    return this.canvas.toDataURL(mime, quality);
  }
}
