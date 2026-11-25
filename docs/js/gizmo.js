// 3dich — Interactive 3D Transform Gizmo (Translate / Rotate / Scale) & Raycast Picking

import { rayIntersectAABB } from './math3d.js';
import { getCustomPartWorldAABB } from './physics_engine.js';

const AXES = [
  { id: 'x', dir: [1, 0, 0], color: [0.95, 0.28, 0.30] },
  { id: 'y', dir: [0, 1, 0], color: [0.22, 0.85, 0.45] },
  { id: 'z', dir: [0, 0, 1], color: [0.24, 0.62, 0.98] },
];

// Closest distance between ray (ro, rd) and line segment (a, b), returns { dist, tSeg, tRay }
function raySegmentDistance(ro, rd, a, b) {
  const ux = rd[0], uy = rd[1], uz = rd[2];
  const vx = b[0] - a[0], vy = b[1] - a[1], vz = b[2] - a[2];
  const wx = ro[0] - a[0], wy = ro[1] - a[1], wz = ro[2] - a[2];
  const A = ux * ux + uy * uy + uz * uz;
  const B = ux * vx + uy * vy + uz * vz;
  const C = vx * vx + vy * vy + vz * vz;
  const D = ux * wx + uy * wy + uz * wz;
  const E = vx * wx + vy * wy + vz * wz;
  const denom = A * C - B * B;
  let sN, sD = denom, tN, tD = denom;
  if (denom < 1e-7) {
    sN = 0; sD = 1; tN = E; tD = C;
  } else {
    sN = B * E - C * D;
    tN = A * E - B * D;
    if (tN < 0) { tN = 0; sN = -D; sD = A; }
    else if (tN > tD) { tN = tD; sN = -D + B; sD = A; }
  }
  const sc = Math.max(0, Math.abs(sN) < 1e-7 ? 0 : sN / sD);
  const tc = Math.max(0, Math.min(1, Math.abs(tN) < 1e-7 ? 0 : tN / tD));
  const dx = wx + sc * ux - tc * vx;
  const dy = wy + sc * uy - tc * vy;
  const dz = wz + sc * uz - tc * vz;
  return { dist: Math.hypot(dx, dy, dz), tSeg: tc, tRay: sc };
}

export class TransformGizmo {
  constructor() {
    this.mode = 'translate'; // 'translate' | 'rotate' | 'scale'
    this.activeAxis = null;  // 'x' | 'y' | 'z' | null
    this.hoverAxis = null;
    this.dragging = false;
    this._dragStartRayProj = 0;
    this._dragStartVal = [0, 0, 0];
    this._dragStartScreen = [0, 0];
  }

  getSize(camera, pos) {
    const d = Math.hypot(camera.eye[0] - pos[0], camera.eye[1] - pos[1], camera.eye[2] - pos[2]);
    return Math.max(38, Math.min(115, d * 0.14));
  }

  hitTestAxis(ray, partPos, camera, isTouch = false) {
    if (!partPos) return null;
    const len = this.getSize(camera, partPos);
    const tol = len * (isTouch ? 0.24 : 0.15);
    let best = null;
    let bestDist = tol;
    for (const ax of AXES) {
      const end = [
        partPos[0] + ax.dir[0] * len,
        partPos[1] + ax.dir[1] * len,
        partPos[2] + ax.dir[2] * len,
      ];
      const res = raySegmentDistance(ray.origin, ray.dir, partPos, end);
      if (res.dist < bestDist && res.tSeg > 0.12) {
        bestDist = res.dist;
        best = ax.id;
      }
    }
    return best;
  }

  pickCustomPart(ray, customParts) {
    let bestId = null;
    let bestT = Infinity;
    for (const part of customParts) {
      const bb = getCustomPartWorldAABB(part);
      // Slight padding for comfortable clicking
      const pad = 4;
      const t = rayIntersectAABB(
        ray.origin,
        ray.dir,
        [bb.min[0] - pad, bb.min[1] - pad, bb.min[2] - pad],
        [bb.max[0] + pad, bb.max[1] + pad, bb.max[2] + pad],
      );
      if (t !== null && t < bestT) {
        bestT = t;
        bestId = part.id;
      }
    }
    return bestId;
  }

  // Project ray onto an axis line passing through origin -> scalar position along axis
  _projectRayOntoAxis(ray, origin, axisDir) {
    const ux = ray.dir[0], uy = ray.dir[1], uz = ray.dir[2];
    const vx = axisDir[0], vy = axisDir[1], vz = axisDir[2];
    const wx = ray.origin[0] - origin[0];
    const wy = ray.origin[1] - origin[1];
    const wz = ray.origin[2] - origin[2];
    const b = ux * vx + uy * vy + uz * vz;
    const d = ux * wx + uy * wy + uz * wz;
    const e = vx * wx + vy * wy + vz * wz;
    const denom = 1 - b * b;
    if (Math.abs(denom) < 1e-4) return 0;
    return (e - b * d) / denom;
  }

  beginDrag(axisId, ray, part, screenX, screenY) {
    this.activeAxis = axisId;
    this.dragging = true;
    this._dragStartScreen = [screenX, screenY];
    const ax = AXES.find((a) => a.id === axisId);
    this._dragStartRayProj = this._projectRayOntoAxis(ray, part.pos, ax.dir);
    if (this.mode === 'translate') this._dragStartVal = [...part.pos];
    else if (this.mode === 'rotate') this._dragStartVal = [...part.rot];
    else this._dragStartVal = [...part.scale];
  }

  updateDrag(ray, part, screenX, screenY, snapStep = false) {
    if (!this.dragging || !this.activeAxis || !part) return false;
    const axIdx = this.activeAxis === 'x' ? 0 : this.activeAxis === 'y' ? 1 : 2;
    const ax = AXES[axIdx];
    if (this.mode === 'translate') {
      const proj = this._projectRayOntoAxis(ray, this._dragStartVal, ax.dir);
      let delta = proj - this._dragStartRayProj;
      if (snapStep) delta = Math.round(delta / 5) * 5;
      const next = [...this._dragStartVal];
      next[axIdx] = Number((this._dragStartVal[axIdx] + delta).toFixed(1));
      part.pos = next;
      return true;
    }
    const dx = screenX - this._dragStartScreen[0];
    const dy = screenY - this._dragStartScreen[1];
    const dragPx = dx - dy * 0.5;
    if (this.mode === 'rotate') {
      let deg = dragPx * 0.75;
      if (snapStep) deg = Math.round(deg / 15) * 15;
      const next = [...this._dragStartVal];
      next[axIdx] = Math.round((this._dragStartVal[axIdx] + deg) % 360);
      part.rot = next;
      return true;
    }
    if (this.mode === 'scale') {
      const factor = Math.max(0.15, Math.min(4.0, 1 + dragPx * 0.005));
      const next = [...this._dragStartVal];
      if (snapStep) {
        // Uniform scale when Shift held
        const u = Number((this._dragStartVal[0] * factor).toFixed(2));
        part.scale = [u, u, u];
      } else {
        next[axIdx] = Number((this._dragStartVal[axIdx] * factor).toFixed(2));
        part.scale = next;
      }
      return true;
    }
    return false;
  }

  endDrag() {
    this.dragging = false;
    this.activeAxis = null;
  }

  // Generate lightweight line/arrow vertices for rendering the gizmo in WebGL/Canvas2D
  buildLines(partPos, camera) {
    const len = this.getSize(camera, partPos);
    const segs = [];
    for (const ax of AXES) {
      const highlight = this.activeAxis === ax.id || this.hoverAxis === ax.id;
      const col = highlight ? [1.0, 0.94, 0.35] : ax.color;
      const end = [
        partPos[0] + ax.dir[0] * len,
        partPos[1] + ax.dir[1] * len,
        partPos[2] + ax.dir[2] * len,
      ];
      segs.push({ a: partPos, b: end, color: col, axis: ax.id, highlight });
    }
    return { len, segs };
  }
}
