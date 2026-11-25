// 3dich — Batched Procedural 3D Geometry Builder for All 7 Printers + All 59 Mods + 4 SolidCraft Demo CAD Parts
// Packs geometry into 5 kinematic batches -> entire detailed 3D printer + 59 mods renders in ONLY 5 GPU draw calls!

import { hexToRgb01 } from './math3d.js';
import { analyzeAndOptimizeMesh } from './mesh_parsers.js';

// Ultra-fast flat-array geometry accumulator (stride: pos3 + norm3 + col3 + meta3 [metal, rough, heat])
export class MeshBatch {
  constructor(initialTris = 256) {
    this.capFloats = initialTris * 3 * 12;
    this.data = new Float32Array(this.capFloats);
    this.len = 0;
  }

  _ensure(extraFloats) {
    if (this.len + extraFloats <= this.capFloats) return;
    while (this.capFloats < this.len + extraFloats) this.capFloats *= 2;
    const next = new Float32Array(this.capFloats);
    next.set(this.data.subarray(0, this.len));
    this.data = next;
  }

  addTri(ax, ay, az, bx, by, bz, cx, cy, cz, col, metal = 0.25, rough = 0.45, heat = 0.0) {
    this._ensure(36);
    const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
    const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
    let nx = e1y * e2z - e1z * e2y;
    let ny = e1z * e2x - e1x * e2z;
    let nz = e1x * e2y - e1y * e2x;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    const r = col[0], g = col[1], b = col[2];
    const d = this.data;
    let o = this.len;
    d[o++] = ax; d[o++] = ay; d[o++] = az; d[o++] = nx; d[o++] = ny; d[o++] = nz; d[o++] = r; d[o++] = g; d[o++] = b; d[o++] = metal; d[o++] = rough; d[o++] = heat;
    d[o++] = bx; d[o++] = by; d[o++] = bz; d[o++] = nx; d[o++] = ny; d[o++] = nz; d[o++] = r; d[o++] = g; d[o++] = b; d[o++] = metal; d[o++] = rough; d[o++] = heat;
    d[o++] = cx; d[o++] = cy; d[o++] = cz; d[o++] = nx; d[o++] = ny; d[o++] = nz; d[o++] = r; d[o++] = g; d[o++] = b; d[o++] = metal; d[o++] = rough; d[o++] = heat;
    this.len = o;
  }

  addQuad(a, b, c, d, col, metal = 0.25, rough = 0.45, heat = 0.0) {
    this.addTri(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], col, metal, rough, heat);
    this.addTri(a[0], a[1], a[2], c[0], c[1], c[2], d[0], d[1], d[2], col, metal, rough, heat);
  }

  addBox(cx, cy, cz, sx, sy, sz, col, metal = 0.25, rough = 0.45, heat = 0.0) {
    const hx = sx * 0.5, hy = sy * 0.5, hz = sz * 0.5;
    const x0 = cx - hx, x1 = cx + hx;
    const y0 = cy - hy, y1 = cy + hy;
    const z0 = cz - hz, z1 = cz + hz;
    // +Z front
    this.addQuad([x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1], col, metal, rough, heat);
    // -Z back
    this.addQuad([x1,y0,z0],[x0,y0,z0],[x0,y1,z0],[x1,y1,z0], col, metal, rough, heat);
    // +Y top
    this.addQuad([x0,y1,z1],[x1,y1,z1],[x1,y1,z0],[x0,y1,z0], col, metal, rough, heat);
    // -Y bottom
    this.addQuad([x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1], col, metal, rough, heat);
    // +X right
    this.addQuad([x1,y0,z1],[x1,y0,z0],[x1,y1,z0],[x1,y1,z1], col, metal, rough, heat);
    // -X left
    this.addQuad([x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0], col, metal, rough, heat);
  }

  addRotatedBox(cx, cy, cz, sx, sy, sz, rxDeg, ryDeg, rzDeg, col, metal = 0.25, rough = 0.45, heat = 0.0) {
    const rx = (rxDeg * Math.PI) / 180, ry = (ryDeg * Math.PI) / 180, rz = (rzDeg * Math.PI) / 180;
    const c1 = Math.cos(rx), s1 = Math.sin(rx);
    const c2 = Math.cos(ry), s2 = Math.sin(ry);
    const c3 = Math.cos(rz), s3 = Math.sin(rz);
    const r00 = c2 * c3, r01 = c3 * s1 * s2 - c1 * s3, r02 = c1 * c3 * s2 + s1 * s3;
    const r10 = c2 * s3, r11 = c1 * c3 + s1 * s2 * s3, r12 = c1 * s2 * s3 - c3 * s1;
    const r20 = -s2,     r21 = c2 * s1,                r22 = c1 * c2;
    const hx = sx * 0.5, hy = sy * 0.5, hz = sz * 0.5;
    const xf = (x, y, z) => [
      cx + r00 * x + r01 * y + r02 * z,
      cy + r10 * x + r11 * y + r12 * z,
      cz + r20 * x + r21 * y + r22 * z,
    ];
    const p0 = xf(-hx,-hy, hz), p1 = xf( hx,-hy, hz), p2 = xf( hx, hy, hz), p3 = xf(-hx, hy, hz);
    const p4 = xf(-hx,-hy,-hz), p5 = xf( hx,-hy,-hz), p6 = xf( hx, hy,-hz), p7 = xf(-hx, hy,-hz);
    this.addQuad(p0,p1,p2,p3, col, metal, rough, heat);
    this.addQuad(p5,p4,p7,p6, col, metal, rough, heat);
    this.addQuad(p3,p2,p6,p7, col, metal, rough, heat);
    this.addQuad(p4,p5,p1,p0, col, metal, rough, heat);
    this.addQuad(p1,p5,p6,p2, col, metal, rough, heat);
    this.addQuad(p4,p0,p3,p7, col, metal, rough, heat);
  }

  addCylinder(cx, cy, cz, rTop, rBot, height, segs, axis, col, metal = 0.5, rough = 0.3, heat = 0.0) {
    const h2 = height * 0.5;
    const pt = (ang, rad, h) => {
      const u = Math.cos(ang) * rad;
      const v = Math.sin(ang) * rad;
      if (axis === 'x') return [cx + h, cy + u, cz + v];
      if (axis === 'z') return [cx + u, cy + v, cz + h];
      return [cx + u, cy + h, cz + v]; // 'y'
    };
    const topCenter = axis === 'x' ? [cx + h2, cy, cz] : axis === 'z' ? [cx, cy, cz + h2] : [cx, cy + h2, cz];
    const botCenter = axis === 'x' ? [cx - h2, cy, cz] : axis === 'z' ? [cx, cy, cz - h2] : [cx, cy - h2, cz];

    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2;
      const a1 = ((i + 1) / segs) * Math.PI * 2;
      const t0 = pt(a0, rTop, h2), t1 = pt(a1, rTop, h2);
      const b0 = pt(a0, rBot, -h2), b1 = pt(a1, rBot, -h2);
      this.addQuad(b0, b1, t1, t0, col, metal, rough, heat);
      if (rTop > 0.01) this.addTri(topCenter[0], topCenter[1], topCenter[2], t0[0], t0[1], t0[2], t1[0], t1[1], t1[2], col, metal, rough, heat);
      if (rBot > 0.01) this.addTri(botCenter[0], botCenter[1], botCenter[2], b1[0], b1[1], b1[2], b0[0], b0[1], b0[2], col, metal, rough, heat);
    }
  }

  // Segmented tube along a 3D polyline (for CPAP hoses, watercooling tubes, CANbus umbilicals!)
  addTube(points, radius, segs, col, metal = 0.1, rough = 0.6, heat = 0.0) {
    for (let p = 0; p < points.length - 1; p++) {
      const a = points[p], b = points[p + 1];
      const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
      const len = Math.hypot(dx, dy, dz);
      if (len < 0.1) continue;
      const mx = (a[0] + b[0]) * 0.5, my = (a[1] + b[1]) * 0.5, mz = (a[2] + b[2]) * 0.5;
      const yaw = Math.atan2(dx, dz) * (180 / Math.PI);
      const pitch = -Math.asin(Math.max(-1, Math.min(1, dy / len))) * (180 / Math.PI);
      this.addRotatedBox(mx, my, mz, radius * 1.75, radius * 1.75, len + radius * 0.4, pitch, yaw, 0, col, metal, rough, heat);
    }
  }

  finish() {
    return {
      interleaved: this.data.subarray(0, this.len),
      vertexCount: this.len / 12,
      triCount: this.len / 36,
    };
  }
}

// Build complete procedural 3D printer scene + all active mods split into 5 kinematic batches
export function buildPrinterGeometry(printer, activeModIds, appearance = {}) {
  const mods = new Set(activeModIds);
  const frameCol = hexToRgb01(appearance.frameHex || '#232830');
  const accentCol = hexToRgb01(appearance.accentHex || '#f06a28');
  const frameMetal = appearance.frameMetal ?? 0.72;
  const frameRough = appearance.frameRough ?? 0.36;

  // Material palette
  const C = {
    frame: frameCol,
    accent: accentCol,
    darkMetal: [0.16, 0.18, 0.21],
    steel: [0.74, 0.78, 0.83],
    alu: [0.80, 0.83, 0.87],
    brass: [0.86, 0.69, 0.26],
    copper: [0.82, 0.46, 0.28],
    carbon: [0.13, 0.14, 0.16],
    belt: [0.10, 0.10, 0.11],
    pcb: [0.09, 0.32, 0.20],
    pcbBlue: [0.10, 0.28, 0.56],
    pei: [0.22, 0.20, 0.17],
    cryo: [0.14, 0.34, 0.52],
    glass: [0.62, 0.78, 0.88],
    ledWarm: [1.0, 0.96, 0.86],
    ledCyan: [0.18, 0.85, 0.98],
    laserBlue: [0.15, 0.55, 1.0],
    concrete: [0.56, 0.57, 0.58],
    silicone: [0.92, 0.40, 0.12],
    hose: [0.22, 0.24, 0.28],
    red: [0.85, 0.18, 0.18],
    green: [0.18, 0.76, 0.44],
    yellow: [0.94, 0.78, 0.20],
    purple: [0.56, 0.36, 0.82],
    white: [0.92, 0.94, 0.96],
  };

  const staticB = new MeshBatch(1200);
  const transB = new MeshBatch(200);
  const yB = new MeshBatch(500);
  const thB = new MeshBatch(600);
  const zB = new MeshBatch(500);

  const ox = printer.outerSize.x;
  const oy = printer.outerSize.z; // height
  const oz = printer.outerSize.y; // depth
  const bx = printer.buildVolume.x;
  const bz = printer.buildVolume.y;
  const e = printer.extrusionMm;
  const hx = ox * 0.5;
  const hz = oz * 0.5;
  const isCube = printer.frameType === 'cube';
  const bedY = isCube ? oy * 0.36 : 95;
  const gantryY = bedY + 52;
  const baseLift = mods.has('mot-vibration-paver') ? 38 : 0;

  // ================= BASE VIBRATION PAVER & FEET =================
  if (mods.has('mot-vibration-paver')) {
    staticB.addBox(0, 16, 0, ox + 70, 32, oz + 70, C.concrete, 0.04, 0.90, 0);
    // 4 Sorbothane hemispheres/pads
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        staticB.addCylinder(sx * (hx + 14), 3, sz * (hz + 14), 18, 20, 6, 10, 'y', C.belt, 0.05, 0.85, 0);
      }
    }
  } else {
    // Standard rubber corner feet
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        staticB.addCylinder(sx * (hx - e), 6, sz * (hz - e), 13, 15, 12, 10, 'y', C.belt, 0.05, 0.85, 0);
      }
    }
  }

  const fY0 = 12 + baseLift;
  const fYTop = oy + baseLift;
  const bY = bedY + baseLift;
  const gY = gantryY + baseLift;

  // ================= CHASSIS FRAME =================
  if (isCube) {
    // 4 Vertical Corner Extrusions
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        staticB.addBox(sx * (hx - e * 0.5), (fY0 + fYTop) * 0.5, sz * (hz - e * 0.5), e, fYTop - fY0, e, C.frame, frameMetal, frameRough, 0);
        // Anodized corner joint cubes (accent touch)
        staticB.addBox(sx * (hx - e * 0.5), fYTop - e * 0.5, sz * (hz - e * 0.5), e + 3, e + 3, e + 3, C.accent, 0.25, 0.45, 0);
      }
    }
    // Bottom & Top Horizontal Rails (X and Z)
    for (const yRail of [fY0 + e * 0.5, fY0 + 54, fYTop - e * 0.5]) {
      for (const sz of [-1, 1]) {
        staticB.addBox(0, yRail, sz * (hz - e * 0.5), ox - 2 * e, e, e, C.frame, frameMetal, frameRough, 0);
      }
      for (const sx of [-1, 1]) {
        staticB.addBox(sx * (hx - e * 0.5), yRail, 0, e, e, oz - 2 * e, C.frame, frameMetal, frameRough, 0);
      }
    }
    // Electronics Deck Plate & Lower Skirts
    staticB.addBox(0, fY0 + 54, 0, ox - 2 * e, 4, oz - 2 * e, C.darkMetal, 0.6, 0.4, 0.08);
    // Front/side ventilated accent skirts
    for (const sz of [-1, 1]) {
      staticB.addBox(0, fY0 + 28, sz * (hz - 3), ox - 3 * e, 36, 4, C.accent, 0.2, 0.5, 0);
    }
    // 4 Z-Drive Belts or Leadscrews in corners
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        staticB.addCylinder(sx * (hx - e - 16), (fY0 + 60 + fYTop - 20) * 0.5, sz * (hz - e - 16), 4, 4, fYTop - fY0 - 80, 8, 'y', C.steel, 0.9, 0.2, 0);
        // Z stepper motors at bottom
        staticB.addBox(sx * (hx - e - 28), fY0 + 30, sz * (hz - e - 28), 38, 36, 38, C.darkMetal, 0.55, 0.42, 0.15);
      }
    }
    // Rear A/B CoreXY Steppers at top corners
    for (const sx of [-1, 1]) {
      staticB.addBox(sx * (hx - e - 24), fYTop - 32, -hz + e + 24, 42, 46, 42, C.darkMetal, 0.55, 0.42, 0.25);
      staticB.addBox(sx * (hx - e - 24), fYTop - 10, -hz + e + 24, 46, 8, 46, C.accent, 0.25, 0.45, 0);
    }
  } else {
    // Bed-Slinger (Ender-3 / Prusa i3 Gantry Architecture)
    // Base H-frame
    for (const sx of [-1, 1]) {
      staticB.addBox(sx * (hx - 24), fY0 + e * 0.5, 0, e * 1.6, e, oz, C.frame, frameMetal, frameRough, 0);
    }
    staticB.addBox(0, fY0 + e * 0.5, 0, ox - 48, e, e * 2.0, C.frame, frameMetal, frameRough, 0);
    // Center Y-axis rail extrusion
    staticB.addBox(0, fY0 + e * 1.1, 0, e * 1.4, e * 1.2, oz - 16, C.frame, frameMetal, frameRough, 0);
    // Y stepper motor at rear
    staticB.addBox(0, fY0 + 26, -hz + 26, 42, 42, 42, C.darkMetal, 0.55, 0.42, 0.22);
    // Two Vertical Z-Gantry Uprights + Top Crossbar
    const zPostZ = -18;
    for (const sx of [-1, 1]) {
      staticB.addBox(sx * (hx - 24), (fY0 + fYTop) * 0.5, zPostZ, e, fYTop - fY0, e * 1.8, C.frame, frameMetal, frameRough, 0);
      // Leadscrew (or Belted-Z later!)
      if (!mods.has('mot-belted-z')) {
        staticB.addCylinder(sx * (hx - 48), (fY0 + fYTop) * 0.5, zPostZ - 12, 4, 4, fYTop - fY0 - 20, 8, 'y', C.steel, 0.9, 0.2, 0);
      }
      staticB.addBox(sx * (hx - 48), fY0 + 30, zPostZ - 12, 42, 42, 42, C.darkMetal, 0.55, 0.42, 0.18);
    }
    staticB.addBox(0, fYTop - e * 0.5, zPostZ, ox - 20, e, e * 1.5, C.frame, frameMetal, frameRough, 0);
    // Side PSU block
    staticB.addBox(hx - 14, fY0 + 115, zPostZ - 36, 48, 170, 85, C.darkMetal, 0.65, 0.35, 0.18);
    // Front electronics box
    staticB.addBox(-hx * 0.45, fY0 + 24, hz * 0.45, 130, 38, 110, C.darkMetal, 0.5, 0.45, 0.14);
  }

  // ================= BUILD PLATE / HEATED BED =================
  // Moves with Y on Bed-Slinger, or Z on CoreXY
  const bedBatch = printer.kinematics === 'bedslinger' ? yB : zB;
  const bedPlateCol = mods.has('bed-pei-cryogrip') ? C.cryo : C.pei;
  const bedThick = mods.has('bed-cast-alu-mic6') ? 10 : 5;
  // Aluminum heatbed sub-plate
  bedBatch.addBox(0, bY - bedThick * 0.5 - 2, 0, bx + 12, bedThick, bz + 12, C.alu, 0.85, 0.25, 0.72);
  // Magnetic spring steel PEI/CryoGrip sheet
  bedBatch.addBox(0, bY + 1, 0, bx, 2.5, bz, bedPlateCol, 0.32, 0.55, 0.82);
  // Front pull tab
  bedBatch.addBox(0, bY + 1, bz * 0.5 + 8, 56, 2.5, 16, bedPlateCol, 0.32, 0.55, 0.65);
  // Under-bed carriage frame + corner mounts
  bedBatch.addBox(0, bY - 14, 0, bx * 0.76, 6, bz * 0.76, C.darkMetal, 0.6, 0.4, 0.25);
  const mountCol = mods.has('mot-silicon-bed-mounts') ? C.silicone : C.steel;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      bedBatch.addCylinder(sx * bx * 0.36, bY - 9, sz * bz * 0.36, 6, 6, 12, 8, 'y', mountCol, 0.15, 0.6, 0.3);
    }
  }
  // Subtle translucent build volume wireframe guides (corner vertical pillars)
  const bvH = Math.min(printer.buildVolume.z * 0.55, fYTop - bY - 40);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      transB.addBox(sx * bx * 0.49, bY + bvH * 0.5, sz * bz * 0.49, 1.8, bvH, 1.8, C.ledCyan, 0.1, 0.2, 0.0);
    }
  }

  // ================= X / Y GANTRY & LINEAR RAILS =================
  const gantryBatch = isCube ? yB : zB;
  const xBeamCol = mods.has('mot-carbon-x-beam') ? C.carbon : C.frame;
  const xBeamMetal = mods.has('mot-carbon-x-beam') ? 0.15 : frameMetal;
  const xBeamRough = mods.has('mot-carbon-x-beam') ? 0.28 : frameRough;
  const gantryZ = isCube ? 0 : -18;
  // X Gantry Beam
  gantryBatch.addBox(0, gY + 18, gantryZ, ox - 2.6 * e, e, e, xBeamCol, xBeamMetal, xBeamRough, 0.05);
  // CoreXY Side Y-Rails + XY Joints
  if (isCube) {
    for (const sx of [-1, 1]) {
      staticB.addBox(sx * (hx - e - 10), gY + 18, 0, 12, 10, oz - 3 * e, C.steel, 0.92, 0.18, 0);
      yB.addBox(sx * (hx - e - 14), gY + 18, 0, 26, 30, 42, C.accent, 0.22, 0.45, 0);
      // Belts
      staticB.addBox(sx * (hx - e - 22), gY + 28, 0, 2, 6, oz - 3.2 * e, C.belt, 0.05, 0.85, 0);
    }
  }
  // MGN12H Linear Rails upgrade visual
  if (mods.has('mot-mgn12-linear-rails') || printer.stock.hasLinearRails) {
    gantryBatch.addBox(0, gY + 18, gantryZ + e * 0.5 + 4, ox - 3.2 * e, 12, 8, C.steel, 0.94, 0.16, 0);
    thB.addBox(0, gY + 18, gantryZ + e * 0.5 + 8, 44, 26, 12, C.green, 0.65, 0.30, 0);
  }
  if (mods.has('mot-mgn12-linear-rails') && !isCube) {
    // Dual Y linear rails under bed on Bed-Slinger!
    for (const sx of [-1, 1]) {
      staticB.addBox(sx * 64, fY0 + 26, 0, 12, 8, oz - 24, C.steel, 0.94, 0.16, 0);
    }
  }

  // ================= TOOLHEAD ASSEMBLY (Moves on X + Y!) =================
  const thZ = gantryZ + e * 0.5 + 22;
  // Base X-Carriage plate
  thB.addBox(0, gY + 18, thZ - 10, 52, 44, 10, C.darkMetal, 0.6, 0.38, 0.12);

  // Hotend Visuals (Heatsink, Heatbreak, Heater Block, Nozzle tip)
  const nozY = gY - 26;
  const hotHeat = 1.0;
  if (mods.has('hotend-watercooled')) {
    // Anodized copper/blue liquid cooling jacket
    thB.addBox(0, gY + 2, thZ + 2, 26, 28, 24, C.pcbBlue, 0.85, 0.22, 0.25);
    thB.addBox(0, gY - 14, thZ + 2, 22, 14, 18, C.copper, 0.9, 0.2, hotHeat);
    // External 120mm radiator + pump mounted on rear frame + dual translucent coolant tubes
    staticB.addBox(-hx * 0.45, fY0 + 180, -hz - 26, 130, 145, 38, C.darkMetal, 0.7, 0.35, 0.25);
    staticB.addCylinder(-hx * 0.45, fY0 + 180, -hz - 46, 52, 52, 10, 16, 'z', C.pcbBlue, 0.4, 0.4, 0.15);
    staticB.addTube([
      [-hx * 0.45, fY0 + 240, -hz - 18],
      [-hx * 0.35, fYTop - 25, -hz * 0.4],
      [-10, gY + 40, thZ - 5],
    ], 4.5, 6, C.ledCyan, 0.1, 0.35, 0.2);
    staticB.addTube([
      [-hx * 0.45 + 16, fY0 + 240, -hz - 18],
      [-hx * 0.30, fYTop - 18, -hz * 0.35],
      [10, gY + 40, thZ - 5],
    ], 4.5, 6, C.ledCyan, 0.1, 0.35, 0.2);
  } else if (mods.has('hotend-rapido-uhf')) {
    thB.addCylinder(0, gY + 6, thZ + 2, 11, 11, 24, 12, 'y', C.red, 0.8, 0.25, 0.45);
    thB.addCylinder(0, gY - 14, thZ + 2, 10, 10, 18, 12, 'y', C.pcbBlue, 0.6, 0.35, hotHeat);
  } else if (mods.has('hotend-mosquito-magnum')) {
    thB.addBox(0, gY + 6, thZ + 2, 24, 24, 20, C.steel, 0.9, 0.2, 0.4);
    thB.addBox(0, gY - 12, thZ + 2, 24, 14, 18, C.copper, 0.92, 0.18, hotHeat);
  } else if (mods.has('hotend-revo-hf')) {
    thB.addCylinder(0, gY + 6, thZ + 2, 10, 10, 22, 12, 'y', C.red, 0.82, 0.25, 0.4);
    thB.addCylinder(0, gY - 12, thZ + 2, 11, 8, 12, 10, 'y', C.silicone, 0.1, 0.6, hotHeat);
  } else {
    // Stock / CHC Pro hotend
    thB.addCylinder(0, gY + 6, thZ + 2, 10, 10, 22, 10, 'y', C.alu, 0.85, 0.22, 0.4);
    thB.addBox(0, gY - 12, thZ + 2, 20, 12, 16, mods.has('hotend-chc-pro') ? C.white : C.alu, 0.7, 0.3, hotHeat);
  }
  // Nozzle tip (standard brass or extended Non-Planar cone!)
  if (mods.has('exo-nonplanar-cone')) {
    thB.addCylinder(0, nozY - 4, thZ + 2, 4.5, 0.8, 18, 10, 'y', C.brass, 0.92, 0.18, 1.0);
  } else {
    thB.addCylinder(0, nozY + 2, thZ + 2, 4.5, 1.0, 8, 8, 'y', C.brass, 0.92, 0.18, 1.0);
  }

  // Extruder Visuals
  if (mods.has('ext-orbiter-v2')) {
    thB.addCylinder(0, gY + 44, thZ + 2, 18, 18, 22, 14, 'z', C.darkMetal, 0.65, 0.32, 0.22);
    thB.addBox(0, gY + 34, thZ + 6, 26, 24, 24, C.accent, 0.22, 0.45, 0.1);
  } else if (mods.has('ext-galileo-2')) {
    thB.addBox(0, gY + 42, thZ + 2, 42, 34, 34, C.accent, 0.22, 0.45, 0.12);
    thB.addCylinder(0, gY + 42, thZ - 14, 18, 18, 16, 14, 'z', C.darkMetal, 0.7, 0.3, 0.22);
  } else if (printer.stock.extruderType === 'direct') {
    thB.addBox(0, gY + 40, thZ, 38, 32, 34, C.darkMetal, 0.5, 0.42, 0.18);
  }

  // Toolhead Shroud / Part Cooling Visuals
  if (mods.has('cool-stealthburner')) {
    // Iconic Voron StealthBurner sculpted multi-part cowl
    thB.addBox(0, gY + 12, thZ + 18, 52, 54, 24, C.darkMetal, 0.18, 0.45, 0.1);
    thB.addRotatedBox(0, gY + 6, thZ + 28, 46, 44, 14, 12, 0, 0, C.accent, 0.20, 0.42, 0.08);
    thB.addCylinder(0, gY + 16, thZ + 33, 16, 16, 6, 14, 'z', C.darkMetal, 0.35, 0.4, 0.05);
    // Glowing NeoPixel logo + nozzle LEDs
    thB.addBox(0, gY - 8, thZ + 34, 22, 6, 4, C.ledWarm, 0.0, 0.1, 0.0);
  } else if (mods.has('cool-dragon-burner')) {
    // Sleek compact Dragon Burner + dual 4010 side blowers
    thB.addBox(0, gY + 8, thZ + 16, 40, 42, 22, C.accent, 0.22, 0.42, 0.1);
    for (const sx of [-1, 1]) {
      thB.addRotatedBox(sx * 24, gY + 6, thZ + 14, 12, 36, 36, 0, sx * 12, 0, C.darkMetal, 0.2, 0.5, 0.05);
    }
  } else if (mods.has('cool-hero-me-g7')) {
    // Wide dual-5015 CFD twin ducts
    thB.addBox(0, gY + 8, thZ + 16, 44, 40, 22, C.accent, 0.22, 0.44, 0.1);
    for (const sx of [-1, 1]) {
      thB.addCylinder(sx * 32, gY + 12, thZ + 12, 24, 24, 15, 14, 'x', C.darkMetal, 0.2, 0.48, 0.04);
      thB.addRotatedBox(sx * 22, gY - 12, thZ + 12, 16, 22, 16, 0, 0, -sx * 32, C.accent, 0.2, 0.45, 0.12);
    }
  } else if (mods.has('cool-cpap-turbo')) {
    // Featherweight ring manifold on toolhead + massive external CPAP blower + curved silicone hose!
    thB.addBox(0, gY + 6, thZ + 14, 38, 30, 20, C.carbon, 0.18, 0.35, 0.12);
    thB.addCylinder(0, gY - 12, thZ + 6, 22, 18, 12, 14, 'y', C.accent, 0.25, 0.42, 0.15);
    // External WS7040 CPAP turbine housing on rear/side frame
    staticB.addBox(hx + 44, fY0 + 135, -hz * 0.45, 86, 110, 90, C.darkMetal, 0.4, 0.42, 0.1);
    staticB.addCylinder(hx + 44, fY0 + 150, -hz * 0.45 + 44, 34, 34, 20, 16, 'z', C.accent, 0.25, 0.4, 0.05);
    // Flexible corrugated CPAP hose arching into gantry
    staticB.addTube([
      [hx + 44, fY0 + 195, -hz * 0.45],
      [hx + 24, fYTop + 32, -hz * 0.25],
      [hx * 0.35, fYTop + 48, 0],
      [0, gY + 70, thZ + 14],
      [0, gY + 20, thZ + 16],
    ], 11, 8, C.hose, 0.08, 0.65, 0.0);
  } else {
    // Stock fan shroud
    thB.addBox(0, gY + 8, thZ + 16, 44, 42, 22, C.darkMetal, 0.3, 0.45, 0.12);
    thB.addCylinder(0, gY + 12, thZ + 28, 14, 14, 4, 12, 'z', C.accent, 0.2, 0.45, 0.05);
  }

  // ================= REMAINING 45+ MOD VISUALS =================
  // Side 120mm Aux Fan
  if (mods.has('cool-aux-berzel')) {
    staticB.addBox(-hx + 34, bY + 42, 0, 28, 76, bx * 0.72, C.darkMetal, 0.25, 0.45, 0.02);
    staticB.addBox(-hx + 48, bY + 26, 0, 18, 22, bx * 0.66, C.accent, 0.22, 0.42, 0.0);
  }
  // Rear Exhaust Duct
  if (mods.has('cool-chamber-exhaust')) {
    staticB.addBox(0, fYTop - 95, -hz - 24, 126, 126, 44, C.darkMetal, 0.3, 0.45, 0.12);
    staticB.addCylinder(0, fYTop - 95, -hz - 46, 52, 52, 8, 16, 'z', C.accent, 0.25, 0.4, 0.1);
  }
  // AWD 4-Motor Front Steppers
  if (mods.has('mot-awd-4motor')) {
    for (const sx of [-1, 1]) {
      staticB.addBox(sx * (hx - e - 24), fYTop - 32, hz - e - 24, 42, 48, 42, C.darkMetal, 0.58, 0.38, 0.30);
      staticB.addBox(sx * (hx - e - 24), fYTop - 8, hz - e - 24, 46, 8, 46, C.red, 0.4, 0.35, 0.15);
    }
  }
  // 48V Stepper PSU
  if (mods.has('mot-48v-tmc5160')) {
    staticB.addBox(hx * 0.42, fY0 + 26, -hz * 0.28, 125, 42, 210, C.alu, 0.82, 0.30, 0.35);
    staticB.addBox(hx * 0.42, fY0 + 48, -hz * 0.28, 118, 4, 40, C.yellow, 0.2, 0.4, 0.2);
  }
  // Belted-Z Pulley Towers
  if (mods.has('mot-belted-z')) {
    for (const sx of [-1, 1]) {
      staticB.addBox(sx * (hx - 24), fYTop + 16, isCube ? 0 : -18, 32, 34, 42, C.accent, 0.25, 0.42, 0);
      staticB.addBox(sx * (hx - 36), (fY0 + fYTop) * 0.5, isCube ? 0 : -26, 4, fYTop - fY0, 10, C.belt, 0.05, 0.85, 0);
    }
  }
  // 45° CNC Frame Braces
  if (mods.has('mot-frame-braces')) {
    for (const sx of [-1, 1]) {
      if (isCube) {
        staticB.addRotatedBox(sx * (hx - e), fYTop - 52, hz - e - 42, 12, 16, 110, 45, 0, 0, C.alu, 0.88, 0.22, 0);
        staticB.addRotatedBox(sx * (hx - e), fYTop - 52, -hz + e + 42, 12, 16, 110, -45, 0, 0, C.alu, 0.88, 0.22, 0);
      } else {
        staticB.addRotatedBox(sx * (hx - 24), (fY0 + fYTop) * 0.48, hz * 0.38, 10, 10, (fYTop - fY0) * 0.96, -24, 0, 0, C.steel, 0.88, 0.22, 0);
      }
    }
  }
  // Probes
  if (mods.has('probe-beacon-eddy')) {
    thB.addBox(0, gY - 12, thZ - 14, 28, 6, 22, C.pcbBlue, 0.4, 0.35, 0.1);
    thB.addCylinder(0, gY - 15, thZ - 16, 6, 6, 3, 10, 'y', C.copper, 0.9, 0.2, 0.15);
  }
  if (mods.has('probe-voron-tap')) {
    thB.addBox(0, gY + 18, thZ - 4, 34, 52, 14, C.accent, 0.28, 0.42, 0.1);
  }
  if (mods.has('probe-klicky-dock')) {
    staticB.addBox(-hx + 52, gY + 26, -hz + 38, 36, 24, 32, C.accent, 0.22, 0.45, 0);
    thB.addBox(-24, gY - 12, thZ - 6, 14, 18, 12, C.red, 0.2, 0.45, 0);
  }
  if (mods.has('probe-adxl345')) {
    thB.addBox(22, gY + 26, thZ + 6, 16, 16, 5, C.pcb, 0.45, 0.35, 0.05);
  }
  // Electronics
  if (mods.has('elec-klipper-sbc')) {
    staticB.addBox(-hx * 0.35, fY0 + 24, -hz * 0.22, 88, 18, 58, C.pcb, 0.45, 0.35, 0.28);
  }
  if (mods.has('elec-canbus-ebb36')) {
    thB.addBox(0, gY + 42, thZ - 26, 36, 36, 10, C.darkMetal, 0.4, 0.35, 0.15);
    staticB.addTube([[0, gY + 56, thZ - 26], [0, fYTop + 20, -hz * 0.38], [0, fYTop - 25, -hz + 24]], 4, 6, C.belt, 0.1, 0.7, 0);
  }
  if (mods.has('elec-skr-octopus')) {
    staticB.addBox(0, fY0 + 22, 0, 160, 16, 100, C.darkMetal, 0.45, 0.38, 0.22);
    for (let i = 0; i < 8; i++) {
      staticB.addBox(-56 + i * 16, fY0 + 34, -22, 11, 14, 16, C.pcbBlue, 0.8, 0.25, 0.35);
    }
  }
  if (mods.has('elec-klipperscreen-5')) {
    // 45° Tilted 5" Touch Display on Front Extrusion
    staticB.addRotatedBox(0, fY0 + 34, hz + 24, 138, 86, 16, -40, 0, 0, C.darkMetal, 0.3, 0.4, 0.05);
    staticB.addRotatedBox(0, fY0 + 37, hz + 28, 122, 72, 4, -40, 0, 0, C.ledCyan, 0.1, 0.15, 0.0);
  }
  if (mods.has('elec-knomi-eye')) {
    thB.addCylinder(0, gY + 14, thZ + 38, 16, 16, 7, 16, 'z', C.darkMetal, 0.3, 0.35, 0.05);
    thB.addCylinder(0, gY + 14, thZ + 41, 12, 12, 3, 16, 'z', C.ledCyan, 0.0, 0.1, 0.0);
  }
  if (mods.has('elec-cable-drag-chains')) {
    for (let i = 0; i < 7; i++) {
      gantryBatch.addBox(-hx * 0.55 + i * 24, gY + 34, gantryZ - 14, 18, 12, 14, C.belt, 0.1, 0.6, 0);
    }
  }

  // Enclosure & Thermal
  if (mods.has('enc-polycarb-panels') || printer.stock.enclosed) {
    const pH = fYTop - fY0 - 65;
    const pY = fY0 + 58 + pH * 0.5;
    // Left, Right, Back, Top & Double Front Doors (Translucent!)
    transB.addBox(-hx + 2, pY, 0, 4, pH, oz - 2 * e, C.glass, 0.15, 0.08, 0.22);
    transB.addBox(hx - 2, pY, 0, 4, pH, oz - 2 * e, C.glass, 0.15, 0.08, 0.22);
    transB.addBox(0, pY, -hz + 2, ox - 2 * e, pH, 4, C.glass, 0.15, 0.08, 0.22);
    transB.addBox(0, fYTop - 2, 0, ox - 2 * e, 4, oz - 2 * e, C.glass, 0.15, 0.08, 0.25);
    // Double front magnetic doors with vertical gap + handles
    transB.addBox(-ox * 0.23, pY, hz - 2, ox * 0.44, pH, 4, C.glass, 0.15, 0.08, 0.20);
    transB.addBox(ox * 0.23, pY, hz - 2, ox * 0.44, pH, 4, C.glass, 0.15, 0.08, 0.20);
    staticB.addBox(-12, pY, hz + 6, 8, 54, 10, C.accent, 0.25, 0.42, 0);
    staticB.addBox(12, pY, hz + 6, 8, 54, 10, C.accent, 0.25, 0.42, 0);
  }
  if (mods.has('enc-nevermore-v6')) {
    staticB.addBox(0, bY - 38, -bz * 0.18, 128, 30, 82, C.darkMetal, 0.22, 0.5, 0.35);
    staticB.addBox(0, bY - 22, -bz * 0.18, 110, 6, 66, C.accent, 0.22, 0.48, 0.35);
  }
  if (mods.has('enc-ellis-bed-fans')) {
    for (const sx of [-1, 1]) {
      staticB.addRotatedBox(sx * 75, bY - 32, bz * 0.24, 52, 22, 52, 25, 0, 0, C.darkMetal, 0.2, 0.5, 0.42);
    }
  }
  if (mods.has('enc-ptc-chamber-heater')) {
    staticB.addBox(hx - 48, fY0 + 110, -hz + 55, 68, 95, 62, C.red, 0.5, 0.4, 0.92);
    staticB.addBox(hx - 48, fY0 + 110, -hz + 87, 54, 70, 6, C.alu, 0.85, 0.25, 0.95);
  }
  if (mods.has('enc-tophat-riser')) {
    const rH = 72;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        staticB.addBox(sx * (hx - e * 0.5), fYTop + rH * 0.5, sz * (hz - e * 0.5), e, rH, e, C.accent, 0.22, 0.45, 0.1);
      }
    }
    for (const sz of [-1, 1]) staticB.addBox(0, fYTop + rH, sz * (hz - e * 0.5), ox, e, e, C.frame, frameMetal, frameRough, 0.1);
    for (const sx of [-1, 1]) staticB.addBox(sx * (hx - e * 0.5), fYTop + rH, 0, e, e, oz, C.frame, frameMetal, frameRough, 0.1);
  }
  if (mods.has('enc-acoustic-foam')) {
    const lH = (fYTop - fY0) * 0.55;
    staticB.addBox(0, fY0 + 62 + lH * 0.5, -hz + 10, ox - 3.5 * e, lH, 10, C.carbon, 0.02, 0.95, 0.2);
  }

  // Multi-Material Units & Toolchangers
  const topY = fYTop + (mods.has('enc-tophat-riser') ? 82 : 12);
  if (mods.has('mmu-boxturtle')) {
    staticB.addBox(0, topY + 26, -30, 320, 50, 175, C.darkMetal, 0.25, 0.45, 0);
    const spCols = [C.red, C.ledCyan, C.yellow, C.green];
    for (let i = 0; i < 4; i++) {
      staticB.addCylinder(-110 + i * 74, topY + 86, -30, 56, 56, 44, 16, 'x', spCols[i], 0.12, 0.5, 0);
    }
  } else if (mods.has('mmu-ercf-v2')) {
    staticB.addBox(0, topY + 22, -hz * 0.42, 340, 44, 72, C.accent, 0.22, 0.45, 0);
    for (let i = 0; i < 8; i++) {
      staticB.addBox(-140 + i * 40, topY + 46, -hz * 0.42, 22, 26, 46, i % 2 ? C.darkMetal : C.white, 0.2, 0.45, 0);
    }
  } else if (mods.has('mmu-stealthchanger')) {
    // 4 Independent Docked Toolheads parked along upper front bar!
    const dockCols = [C.accent, C.ledCyan, C.green, C.yellow];
    for (let i = 0; i < 4; i++) {
      const dx = -bx * 0.38 + i * (bx * 0.253);
      staticB.addBox(dx, fYTop - 68, hz - 44, 46, 56, 36, C.darkMetal, 0.25, 0.45, 0.15);
      staticB.addBox(dx, fYTop - 68, hz - 24, 38, 44, 8, dockCols[i], 0.22, 0.42, 0.15);
    }
  }
  if (mods.has('mmu-filament-cutter')) {
    thB.addBox(-30, gY + 28, thZ + 12, 16, 12, 22, C.red, 0.4, 0.35, 0);
  }
  if (mods.has('mmu-purge-scrubber')) {
    staticB.addBox(bx * 0.36, bY - 6, -bz * 0.5 - 24, 68, 22, 34, C.darkMetal, 0.25, 0.45, 0.1);
    staticB.addBox(bx * 0.36 - 16, bY + 6, -bz * 0.5 - 24, 32, 8, 12, C.brass, 0.85, 0.35, 0.1);
  }

  // Filament & Dryboxes
  if (mods.has('fil-active-drybox')) {
    staticB.addBox(-hx - 78, fY0 + 115, 0, 125, 220, 210, C.darkMetal, 0.25, 0.42, 0.38);
    transB.addBox(-hx - 78, fY0 + 150, 0, 120, 145, 200, C.glass, 0.1, 0.15, 0.42);
    staticB.addCylinder(-hx - 78, fY0 + 130, -35, 72, 72, 48, 16, 'z', C.accent, 0.15, 0.5, 0.35);
    staticB.addCylinder(-hx - 78, fY0 + 130, 35, 72, 72, 48, 16, 'z', C.ledCyan, 0.15, 0.5, 0.35);
  }
  if (mods.has('fil-bearing-spool')) {
    staticB.addBox(hx + 34, fYTop - 90, 0, 68, 20, 24, C.accent, 0.25, 0.42, 0);
    staticB.addCylinder(hx + 46, fYTop - 90, 0, 74, 74, 54, 18, 'x', C.accent, 0.15, 0.5, 0);
    staticB.addCylinder(hx + 46, fYTop - 90, 0, 28, 28, 58, 14, 'x', C.darkMetal, 0.3, 0.5, 0);
  }
  if (mods.has('fil-btt-sfs-v2')) {
    staticB.addBox(hx - 6, fYTop - 165, -hz + 45, 26, 48, 34, C.darkMetal, 0.3, 0.42, 0);
    staticB.addBox(hx + 8, fYTop - 165, -hz + 45, 4, 16, 16, C.ledCyan, 0.0, 0.15, 0);
  }
  if (mods.has('fil-spoolman-nfc')) {
    staticB.addBox(hx + 16, fYTop - 185, 0, 32, 68, 58, C.pcbBlue, 0.35, 0.35, 0);
    staticB.addBox(hx + 33, fYTop - 185, 0, 4, 34, 34, C.white, 0.05, 0.3, 0);
  }

  // Monitoring, Safety & QoL
  if (mods.has('qol-nozzle-cam')) {
    thB.addBox(26, gY - 8, thZ + 22, 16, 16, 18, C.darkMetal, 0.4, 0.35, 0.1);
    thB.addCylinder(26, gY - 8, thZ + 32, 5, 5, 6, 10, 'z', C.ledCyan, 0.8, 0.1, 0);
  }
  if (mods.has('qol-chamber-cam')) {
    staticB.addRotatedBox(-hx + 36, fYTop - 42, hz - 36, 28, 24, 24, 22, 42, 0, C.darkMetal, 0.35, 0.4, 0);
    staticB.addRotatedBox(-hx + 44, fYTop - 46, hz - 44, 12, 12, 10, 22, 42, 0, C.ledCyan, 0.7, 0.1, 0);
  }
  if (mods.has('qol-rgb-neopixel')) {
    for (const sz of [-1, 1]) {
      staticB.addBox(0, fYTop - e - 4, sz * (hz - e - 12), ox - 3 * e, 8, 12, C.ledWarm, 0.0, 0.05, 0.0);
    }
  }
  if (mods.has('qol-smoke-relay')) {
    staticB.addCylinder(0, fYTop - e - 10, 0, 34, 38, 18, 16, 'y', C.white, 0.1, 0.45, 0);
    staticB.addCylinder(0, fYTop - e - 19, 0, 5, 5, 4, 8, 'y', C.green, 0.0, 0.1, 0);
  }
  if (mods.has('qol-tool-drawer')) {
    staticB.addBox(-hx * 0.46, fY0 + 26, hz + 14, 126, 34, 48, C.darkMetal, 0.22, 0.48, 0);
    staticB.addBox(-hx * 0.46, fY0 + 26, hz + 40, 48, 10, 8, C.accent, 0.25, 0.42, 0);
  }
  if (mods.has('qol-magnetic-build-rack')) {
    staticB.addBox(hx + 22, fY0 + 130, 24, 34, 160, 180, C.darkMetal, 0.25, 0.45, 0);
    for (let i = 0; i < 3; i++) {
      staticB.addBox(hx + 12 + i * 9, fY0 + 135, 24, 3, 155, 165, i === 0 ? C.cryo : i === 1 ? C.pei : C.steel, 0.65, 0.32, 0);
    }
  }

  // Exotic & Experimental Mods
  if (mods.has('exo-laser-diode')) {
    thB.addBox(0, gY + 6, thZ + 44, 38, 62, 38, C.pcbBlue, 0.8, 0.25, 0.45);
    transB.addBox(0, gY - 30, thZ + 44, 42, 24, 42, C.laserBlue, 0.1, 0.1, 0.0);
  }
  if (mods.has('exo-pen-plotter')) {
    thB.addBox(0, gY + 10, thZ + 40, 22, 44, 18, C.accent, 0.2, 0.45, 0);
    thB.addCylinder(0, gY - 8, thZ + 44, 5, 1.5, 76, 10, 'y', C.yellow, 0.3, 0.4, 0);
  }
  if (mods.has('exo-conveyor-belt')) {
    staticB.addRotatedBox(0, bY + 26, 20, bx * 0.96, 18, bz * 1.18, 22, 0, 0, C.belt, 0.15, 0.72, 0.45);
    staticB.addCylinder(0, bY - 6, bz * 0.66, 18, 18, bx * 1.02, 12, 'x', C.alu, 0.85, 0.25, 0);
    staticB.addCylinder(0, bY + 58, -bz * 0.56, 18, 18, bx * 1.02, 12, 'x', C.alu, 0.85, 0.25, 0);
  }
  if (mods.has('exo-auto-eject-arm')) {
    staticB.addRotatedBox(0, fY0 + 52, hz + 56, bx * 0.78, 8, 95, 28, 0, 0, C.alu, 0.78, 0.30, 0);
    staticB.addBox(-bx * 0.39, fY0 + 62, hz + 56, 8, 26, 95, C.accent, 0.25, 0.42, 0);
    staticB.addBox(bx * 0.39, fY0 + 62, hz + 56, 8, 26, 95, C.accent, 0.25, 0.42, 0);
  }

  return {
    staticFrame: staticB.finish(),
    transparent: transB.finish(),
    yGroup: yB.finish(),
    toolheadGroup: thB.finish(),
    zGroup: zB.finish(),
    meta: { bedY: bY, gantryY: gY, baseLift, fYTop },
  };
}

// Generate 4 Realistic Built-In SolidCraft Demo CAD Parts (returned as Float32Array triangles ready for analyzeAndOptimizeMesh!)
export const DEMO_SOLIDCRAFT_PARTS = [
  {
    id: 'demo-duct-bracket',
    name: 'SolidCraft_Dual5015_Duct.stl',
    label: { tr: 'SolidCraft Çift-5015 Kanal Braketi', en: 'SolidCraft Dual-5015 Duct Bracket' },
    defaultHardpoint: 'toolhead-front',
    defaultMaterial: 'asa',
    buildRawPositions() {
      const b = new MeshBatch(120);
      const col = [1, 1, 1];
      // Mounting backplate + twin angled cooling nozzles + ribs
      b.addBox(0, 0, -10, 54, 38, 6, col);
      b.addRotatedBox(-22, -14, 6, 16, 26, 28, 18, 12, -20, col);
      b.addRotatedBox(22, -14, 6, 16, 26, 28, 18, -12, 20, col);
      b.addBox(0, 12, 4, 36, 10, 22, col);
      return extractPositions(b);
    },
  },
  {
    id: 'demo-mgn12-adapter',
    name: 'SolidCraft_MGN12H_Adapter.stl',
    label: { tr: 'SolidCraft MGN12H Alüminyum Plaka', en: 'SolidCraft MGN12H Billet Adapter' },
    defaultHardpoint: 'x-carriage',
    defaultMaterial: 'alu',
    buildRawPositions() {
      const b = new MeshBatch(80);
      const col = [1, 1, 1];
      b.addBox(0, 0, 0, 48, 44, 8, col);
      b.addBox(-18, 0, 8, 10, 32, 10, col);
      b.addBox(18, 0, 8, 10, 32, 10, col);
      b.addCylinder(0, 14, -6, 9, 9, 8, 12, 'z', col);
      return extractPositions(b);
    },
  },
  {
    id: 'demo-cam-arm',
    name: 'SolidCraft_Corner_CamArm.stl',
    label: { tr: 'SolidCraft 2020 Köşe Kamera Kolu', en: 'SolidCraft 2020 Corner Camera Arm' },
    defaultHardpoint: 'frame-left-post',
    defaultMaterial: 'petg',
    buildRawPositions() {
      const b = new MeshBatch(90);
      const col = [1, 1, 1];
      b.addBox(0, 0, 0, 26, 46, 14, col);
      b.addRotatedBox(34, 8, 16, 72, 14, 12, 0, -24, 12, col);
      b.addBox(68, 16, 30, 32, 28, 24, col);
      b.addCylinder(68, 16, 44, 9, 9, 8, 12, 'z', col);
      return extractPositions(b);
    },
  },
  {
    id: 'demo-kizak-spool',
    name: 'SolidCraft_Kizak_SpoolMount.stl',
    label: { tr: 'SolidCraft Kırlangıç Kızaklı Makara', en: 'SolidCraft Dovetail Spool Mount' },
    defaultHardpoint: 'frame-right-post',
    defaultMaterial: 'pacf',
    buildRawPositions() {
      const b = new MeshBatch(100);
      const col = [1, 1, 1];
      // Base dovetail rail plate + gusset + bearing spindle
      b.addBox(0, 0, 0, 20, 64, 16, col);
      b.addRotatedBox(28, 8, 0, 56, 18, 18, 0, 0, 16, col);
      b.addCylinder(58, 18, 0, 14, 14, 82, 14, 'x', col);
      b.addCylinder(98, 18, 0, 20, 20, 6, 14, 'x', col);
      return extractPositions(b);
    },
  },
];

function extractPositions(batch) {
  const f = batch.finish();
  const out = new Float32Array(f.vertexCount * 3);
  for (let i = 0; i < f.vertexCount; i++) {
    out[i * 3]     = f.interleaved[i * 12];
    out[i * 3 + 1] = f.interleaved[i * 12 + 1];
    out[i * 3 + 2] = f.interleaved[i * 12 + 2];
  }
  return out;
}

export function createDemoSolidCraftMesh(demoId) {
  const def = DEMO_SOLIDCRAFT_PARTS.find((d) => d.id === demoId) || DEMO_SOLIDCRAFT_PARTS[0];
  const raw = def.buildRawPositions();
  const analyzed = analyzeAndOptimizeMesh(raw, { cadZUp: false });
  return { def, analyzed };
}
