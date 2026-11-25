// 3dich — Zero-Allocation-Friendly 3D Math Core (Column-major Mat4, Vec3, Ray, AABB)

export function mat4Identity(out = new Float32Array(16)) {
  out.fill(0);
  out[0] = out[5] = out[10] = out[15] = 1;
  return out;
}

export function mat4Multiply(out, a, b) {
  const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
  const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
  const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
  const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
  let b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3];
  out[0] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
  out[1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
  out[2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
  out[3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
  b0 = b[4]; b1 = b[5]; b2 = b[6]; b3 = b[7];
  out[4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
  out[5] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
  out[6] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
  out[7] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
  b0 = b[8]; b1 = b[9]; b2 = b[10]; b3 = b[11];
  out[8] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
  out[9] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
  out[10] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
  out[11] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
  b0 = b[12]; b1 = b[13]; b2 = b[14]; b3 = b[15];
  out[12] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
  out[13] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
  out[14] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
  out[15] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
  return out;
}

export function mat4Perspective(out, fovyRad, aspect, near, far) {
  const f = 1.0 / Math.tan(fovyRad * 0.5);
  const nf = 1 / (near - far);
  out.fill(0);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) * nf;
  out[11] = -1;
  out[14] = 2 * far * near * nf;
  return out;
}

export function mat4LookAt(out, eye, target, up) {
  let zx = eye[0] - target[0], zy = eye[1] - target[1], zz = eye[2] - target[2];
  let len = Math.hypot(zx, zy, zz) || 1;
  zx /= len; zy /= len; zz /= len;
  let xx = up[1] * zz - up[2] * zy;
  let xy = up[2] * zx - up[0] * zz;
  let xz = up[0] * zy - up[1] * zx;
  len = Math.hypot(xx, xy, xz) || 1;
  xx /= len; xy /= len; xz /= len;
  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;
  out[0] = xx; out[1] = yx; out[2] = zx; out[3] = 0;
  out[4] = xy; out[5] = yy; out[6] = zy; out[7] = 0;
  out[8] = xz; out[9] = yz; out[10] = zz; out[11] = 0;
  out[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
  out[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
  out[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
  out[15] = 1;
  return out;
}

export function mat4FromTRS(out, pos, rotDeg, scale) {
  const rx = (rotDeg[0] || 0) * Math.PI / 180;
  const ry = (rotDeg[1] || 0) * Math.PI / 180;
  const rz = (rotDeg[2] || 0) * Math.PI / 180;
  const cx = Math.cos(rx), sx = Math.sin(rx);
  const cy = Math.cos(ry), sy = Math.sin(ry);
  const cz = Math.cos(rz), sz = Math.sin(rz);
  const scx = scale[0] ?? 1, scy = scale[1] ?? 1, scz = scale[2] ?? 1;
  // ZYX Euler order: R = Rz * Ry * Rx
  const r00 = cy * cz;
  const r01 = cz * sx * sy - cx * sz;
  const r02 = cx * cz * sy + sx * sz;
  const r10 = cy * sz;
  const r11 = cx * cz + sx * sy * sz;
  const r12 = cx * sy * sz - cz * sx;
  const r20 = -sy;
  const r21 = cy * sx;
  const r22 = cx * cy;

  out[0] = r00 * scx; out[1] = r10 * scx; out[2] = r20 * scx; out[3] = 0;
  out[4] = r01 * scy; out[5] = r11 * scy; out[6] = r21 * scy; out[7] = 0;
  out[8] = r02 * scz; out[9] = r12 * scz; out[10] = r22 * scz; out[11] = 0;
  out[12] = pos[0] || 0; out[13] = pos[1] || 0; out[14] = pos[2] || 0; out[15] = 1;
  return out;
}

export function mat4Invert(out, m) {
  const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3];
  const a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7];
  const a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11];
  const a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];
  const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10;
  const b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31;
  const b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det) return null;
  det = 1.0 / det;
  out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
  out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
  out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
  out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
  out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
  out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
  out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
  out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
  out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
  out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
  out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
  out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
  out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
  out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
  out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
  out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
  return out;
}

export function transformPoint(m, p) {
  const x = p[0], y = p[1], z = p[2];
  const w = m[3] * x + m[7] * y + m[11] * z + m[15] || 1;
  return [
    (m[0] * x + m[4] * y + m[8] * z + m[12]) / w,
    (m[1] * x + m[5] * y + m[9] * z + m[13]) / w,
    (m[2] * x + m[6] * y + m[10] * z + m[14]) / w,
  ];
}

export function extractFrustumPlanes(vp) {
  // Returns 6 normalized planes [a,b,c,d] for Gribb-Hartmann frustum culling
  const planes = new Float32Array(24);
  const rows = [
    [vp[3] + vp[0], vp[7] + vp[4], vp[11] + vp[8],  vp[15] + vp[12]], // Left
    [vp[3] - vp[0], vp[7] - vp[4], vp[11] - vp[8],  vp[15] - vp[12]], // Right
    [vp[3] + vp[1], vp[7] + vp[5], vp[11] + vp[9],  vp[15] + vp[13]], // Bottom
    [vp[3] - vp[1], vp[7] - vp[5], vp[11] - vp[9],  vp[15] - vp[13]], // Top
    [vp[3] + vp[2], vp[7] + vp[6], vp[11] + vp[10], vp[15] + vp[14]], // Near
    [vp[3] - vp[2], vp[7] - vp[6], vp[11] - vp[10], vp[15] - vp[14]], // Far
  ];
  for (let i = 0; i < 6; i++) {
    const r = rows[i];
    const len = Math.hypot(r[0], r[1], r[2]) || 1;
    planes[i * 4]     = r[0] / len;
    planes[i * 4 + 1] = r[1] / len;
    planes[i * 4 + 2] = r[2] / len;
    planes[i * 4 + 3] = r[3] / len;
  }
  return planes;
}

export function sphereInFrustum(planes, cx, cy, cz, r) {
  for (let i = 0; i < 6; i++) {
    const o = i * 4;
    if (planes[o] * cx + planes[o + 1] * cy + planes[o + 2] * cz + planes[o + 3] < -r) {
      return false;
    }
  }
  return true;
}

export function rayIntersectAABB(orig, dir, min, max) {
  let tmin = -Infinity, tmax = Infinity;
  for (let i = 0; i < 3; i++) {
    const inv = Math.abs(dir[i]) > 1e-8 ? 1 / dir[i] : 1e12;
    let t0 = (min[i] - orig[i]) * inv;
    let t1 = (max[i] - orig[i]) * inv;
    if (t0 > t1) { const tmp = t0; t0 = t1; t1 = tmp; }
    if (t0 > tmin) tmin = t0;
    if (t1 < tmax) tmax = t1;
    if (tmax < tmin) return null;
  }
  return tmax >= 0 ? (tmin >= 0 ? tmin : tmax) : null;
}

export function hexToRgb01(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
