// 3dich — Smooth Damped Orbit/Pan/Zoom Camera with Presets & Zero-Idle Dirty Detection

import { mat4LookAt, mat4Perspective, mat4Multiply, mat4Invert, transformPoint, clamp } from './math3d.js';

export class OrbitCamera {
  constructor() {
    this.target = [0, 220, 0];
    this.goalTarget = [0, 220, 0];
    this.yaw = 0.68;      // rad
    this.pitch = 0.34;    // rad
    this.distance = 860;  // mm
    this.goalYaw = 0.68;
    this.goalPitch = 0.34;
    this.goalDistance = 860;
    this.fovDeg = 38;
    this.near = 4;
    this.far = 9000;

    this.view = new Float32Array(16);
    this.proj = new Float32Array(16);
    this.vp = new Float32Array(16);
    this.invVp = new Float32Array(16);
    this.eye = [0, 0, 860];
    this.aspect = 16 / 9;
    this._syncMatrices();
  }

  setAspect(w, h) {
    this.aspect = Math.max(0.1, w / Math.max(1, h));
    this._syncMatrices();
  }

  framePrinter(printer, instant = false) {
    const ox = printer.outerSize.x;
    const oy = printer.outerSize.z;
    const oz = printer.outerSize.y;
    const diag = Math.hypot(ox, oy, oz);
    const portraitBoost = this.aspect < 0.85 ? Math.min(1.85, 0.96 / Math.max(0.42, this.aspect)) : 1.0;
    this.goalTarget = [0, oy * 0.48, 0];
    this.goalDistance = diag * 1.48 * portraitBoost;
    if (instant) {
      this.target = [...this.goalTarget];
      this.distance = this.goalDistance;
      this.yaw = this.goalYaw;
      this.pitch = this.goalPitch;
      this._syncMatrices();
    }
  }

  setPreset(name, printer) {
    const oy = printer.outerSize.z;
    const diag = Math.hypot(printer.outerSize.x, oy, printer.outerSize.y);
    const bedY = printer.frameType === 'cube' ? oy * 0.36 : 95;
    switch (name) {
      case 'iso':
        this.goalYaw = 0.68; this.goalPitch = 0.30;
        this.goalTarget = [0, oy * 0.48, 0]; this.goalDistance = diag * 1.48; break;
      case 'front':
        this.goalYaw = 0.0; this.goalPitch = 0.06;
        this.goalTarget = [0, oy * 0.48, 0]; this.goalDistance = diag * 1.38; break;
      case 'side':
        this.goalYaw = Math.PI * 0.5; this.goalPitch = 0.08;
        this.goalTarget = [0, oy * 0.48, 0]; this.goalDistance = diag * 1.38; break;
      case 'rear':
        this.goalYaw = Math.PI; this.goalPitch = 0.14;
        this.goalTarget = [0, oy * 0.48, 0]; this.goalDistance = diag * 1.38; break;
      case 'top':
        this.goalYaw = 0.0; this.goalPitch = 1.48;
        this.goalTarget = [0, oy * 0.45, 0]; this.goalDistance = diag * 1.42; break;
      case 'toolhead':
        this.goalYaw = 0.48; this.goalPitch = 0.22;
        this.goalTarget = [0, bedY + 75, 10]; this.goalDistance = Math.max(240, diag * 0.48); break;
    }
  }

  orbit(dx, dy) {
    this.goalYaw -= dx * 0.0065;
    this.goalPitch = clamp(this.goalPitch + dy * 0.0065, -1.42, 1.50);
  }

  pan(dx, dy) {
    const scale = this.distance * 0.0012;
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    const sp = Math.sin(this.pitch), cp = Math.cos(this.pitch);
    // Right vector = (cy, 0, -sy)
    // Up vector in camera plane = (-sy*sp, cp, -cy*sp)
    this.goalTarget[0] += (-dx * cy + dy * sy * sp) * scale;
    this.goalTarget[1] += (dy * cp) * scale;
    this.goalTarget[2] += (dx * sy + dy * cy * sp) * scale;
    this.goalTarget[1] = clamp(this.goalTarget[1], -80, 900);
  }

  zoom(delta) {
    const factor = Math.exp(delta * 0.0011);
    this.goalDistance = clamp(this.goalDistance * factor, 120, 2800);
  }

  // Returns true if camera still moving/damping (drives on-demand RAF; 0% idle when false!)
  update(dtSec = 0.016) {
    const k = 1 - Math.exp(-14 * Math.min(0.05, Math.max(0.004, dtSec)));
    const dYaw = this.goalYaw - this.yaw;
    const dPitch = this.goalPitch - this.pitch;
    const dDist = this.goalDistance - this.distance;
    const dTx = this.goalTarget[0] - this.target[0];
    const dTy = this.goalTarget[1] - this.target[1];
    const dTz = this.goalTarget[2] - this.target[2];

    const moving =
      Math.abs(dYaw) > 1e-4 ||
      Math.abs(dPitch) > 1e-4 ||
      Math.abs(dDist) > 0.08 ||
      Math.abs(dTx) > 0.05 ||
      Math.abs(dTy) > 0.05 ||
      Math.abs(dTz) > 0.05;

    if (moving) {
      this.yaw += dYaw * k;
      this.pitch += dPitch * k;
      this.distance += dDist * k;
      this.target[0] += dTx * k;
      this.target[1] += dTy * k;
      this.target[2] += dTz * k;
    } else {
      this.yaw = this.goalYaw;
      this.pitch = this.goalPitch;
      this.distance = this.goalDistance;
      this.target[0] = this.goalTarget[0];
      this.target[1] = this.goalTarget[1];
      this.target[2] = this.goalTarget[2];
    }
    this._syncMatrices();
    return moving;
  }

  _syncMatrices() {
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    this.eye[0] = this.target[0] + this.distance * cp * sy;
    this.eye[1] = this.target[1] + this.distance * sp;
    this.eye[2] = this.target[2] + this.distance * cp * cy;

    mat4LookAt(this.view, this.eye, this.target, [0, 1, 0]);
    mat4Perspective(this.proj, (this.fovDeg * Math.PI) / 180, this.aspect, this.near, this.far);
    mat4Multiply(this.vp, this.proj, this.view);
    mat4Invert(this.invVp, this.vp);
  }

  screenToRay(ndcX, ndcY) {
    const nearP = transformPoint(this.invVp, [ndcX, ndcY, -1]);
    const farP = transformPoint(this.invVp, [ndcX, ndcY, 1]);
    let dx = farP[0] - nearP[0], dy = farP[1] - nearP[1], dz = farP[2] - nearP[2];
    const len = Math.hypot(dx, dy, dz) || 1;
    return {
      origin: nearP,
      dir: [dx / len, dy / len, dz / len],
    };
  }
}
