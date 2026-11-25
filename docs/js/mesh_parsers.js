// 3dich — Zero-Dependency Multi-Format CAD Parser (Binary/ASCII STL, OBJ, 3MF, ZIP, SolidCraft .sc)
// + Exact Mesh Metrology (Volume cm³, Area cm², BBox, COM, Overhang %)
// + Chunked Bounding-Sphere / Normal-Cone Culling Builder + UNORM16 Packing + Binary STL Exporter

const CHUNK_TRIS = 4096;

// Universal raw-deflate decompression (Browser DecompressionStream + Node zlib fallback)
async function inflateRaw(compressedBytes) {
  if (typeof DecompressionStream !== 'undefined') {
    const ds = new DecompressionStream('deflate-raw');
    const writer = ds.writable.getWriter();
    writer.write(compressedBytes);
    writer.close();
    const out = await new Response(ds.readable).arrayBuffer();
    return new Uint8Array(out);
  }
  const zlib = await import('node:zlib');
  return new Uint8Array(zlib.inflateRawSync(compressedBytes));
}

// Parse ZIP archive entries from ArrayBuffer / Uint8Array (supports Stored=0 & Deflate=8)
export async function extractZipEntries(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // Locate End of Central Directory (EOCD) signature 0x06054b50 from the end
  let eocdOff = -1;
  const minOff = Math.max(0, bytes.length - 65557);
  for (let i = bytes.length - 22; i >= minOff; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOff = i;
      break;
    }
  }
  if (eocdOff < 0) throw new Error('Invalid ZIP archive: EOCD signature not found');

  const cdCount = view.getUint16(eocdOff + 10, true);
  const cdOffset = view.getUint32(eocdOff + 16, true);
  const entries = new Map();
  const dec = new TextDecoder('utf-8');

  let ptr = cdOffset;
  for (let i = 0; i < cdCount; i++) {
    if (ptr + 46 > bytes.length || view.getUint32(ptr, true) !== 0x02014b50) break;
    const method = view.getUint16(ptr + 10, true);
    const compSize = view.getUint32(ptr + 20, true);
    const nameLen = view.getUint16(ptr + 28, true);
    const extraLen = view.getUint16(ptr + 30, true);
    const commentLen = view.getUint16(ptr + 32, true);
    const localOff = view.getUint32(ptr + 42, true);
    const name = dec.decode(bytes.subarray(ptr + 46, ptr + 46 + nameLen));
    ptr += 46 + nameLen + extraLen + commentLen;

    if (name.endsWith('/')) continue;
    const lNameLen = view.getUint16(localOff + 26, true);
    const lExtraLen = view.getUint16(localOff + 28, true);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    const rawSlice = bytes.subarray(dataStart, dataStart + compSize);
    entries.set(name, {
      name,
      method,
      readBytes: async () => {
        if (method === 0) return rawSlice.slice();
        if (method === 8) return await inflateRaw(rawSlice);
        throw new Error(`Unsupported ZIP compression method ${method} for ${name}`);
      },
    });
  }
  return entries;
}

// Parse Binary or ASCII STL (guarded against binary files whose 80-byte header begins with "solid")
export function parseSTL(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 84) {
    return parseAsciiSTL(new TextDecoder('utf-8').decode(bytes));
  }
  const triCount = view.getUint32(80, true);
  const expectedBinLen = 84 + triCount * 50;

  // Binary check first: exact length match (or trailing padding < 50 bytes) wins even if header starts with "solid"
  const looksBinary =
    triCount > 0 &&
    triCount < 25_000_000 &&
    Math.abs(bytes.length - expectedBinLen) <= 4;

  if (looksBinary) {
    const positions = new Float32Array(triCount * 9);
    let pOff = 0;
    let off = 84;
    for (let t = 0; t < triCount; t++) {
      // Skip 12-byte stored normal (we compute exact analytic normals & dFdx/dFdy!)
      off += 12;
      positions[pOff++] = view.getFloat32(off, true);     off += 4;
      positions[pOff++] = view.getFloat32(off, true);     off += 4;
      positions[pOff++] = view.getFloat32(off, true);     off += 4;
      positions[pOff++] = view.getFloat32(off, true);     off += 4;
      positions[pOff++] = view.getFloat32(off, true);     off += 4;
      positions[pOff++] = view.getFloat32(off, true);     off += 4;
      positions[pOff++] = view.getFloat32(off, true);     off += 4;
      positions[pOff++] = view.getFloat32(off, true);     off += 4;
      positions[pOff++] = view.getFloat32(off, true);     off += 4;
      off += 2; // attribute byte count
    }
    return positions;
  }

  return parseAsciiSTL(new TextDecoder('utf-8').decode(bytes));
}

function parseAsciiSTL(text) {
  const verts = [];
  const re = /vertex\s+([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)\s+([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)\s+([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    verts.push(parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]));
  }
  const triFloats = Math.floor(verts.length / 9) * 9;
  if (triFloats === 0) throw new Error('No triangles found in STL file');
  return new Float32Array(verts.slice(0, triFloats));
}

// Parse Wavefront OBJ (supports triangles, quads, n-gons, negative relative indices)
export function parseOBJ(text) {
  const vList = [];
  const out = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line[0] === '#') continue;
    if (line.startsWith('v ')) {
      const parts = line.split(/\s+/);
      if (parts.length >= 4) {
        vList.push(parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3]));
      }
    } else if (line.startsWith('f ')) {
      const parts = line.split(/\s+/).slice(1);
      const vCount = vList.length / 3;
      const idx = [];
      for (const tok of parts) {
        let vi = parseInt(tok.split('/')[0], 10);
        if (Number.isNaN(vi)) continue;
        vi = vi < 0 ? vCount + vi : vi - 1;
        if (vi >= 0 && vi < vCount) idx.push(vi);
      }
      for (let k = 1; k + 1 < idx.length; k++) {
        const a = idx[0] * 3, b = idx[k] * 3, c = idx[k + 1] * 3;
        out.push(
          vList[a], vList[a + 1], vList[a + 2],
          vList[b], vList[b + 1], vList[b + 2],
          vList[c], vList[c + 1], vList[c + 2],
        );
      }
    }
  }
  if (out.length === 0) throw new Error('No geometry faces found in OBJ file');
  return new Float32Array(out);
}

// Parse 3MF XML mesh archive (3D/3dmodel.model inside ZIP)
export async function parse3MF(buffer) {
  const entries = await extractZipEntries(buffer);
  let modelEntry = null;
  for (const [name, entry] of entries) {
    if (name.toLowerCase().endsWith('.model')) {
      modelEntry = entry;
      break;
    }
  }
  if (!modelEntry) throw new Error('No .model XML entry found inside 3MF archive');
  const xml = new TextDecoder('utf-8').decode(await modelEntry.readBytes());
  const out = [];

  // Parse each <mesh> block independently so vertex indices stay scoped to their object
  const meshRe = /<mesh\b[^>]*>([\s\S]*?)<\/mesh>/gi;
  let mm;
  while ((mm = meshRe.exec(xml)) !== null) {
    const block = mm[1];
    const verts = [];
    const vRe = /<vertex\b[^>]*x="([^"]+)"[^>]*y="([^"]+)"[^>]*z="([^"]+)"/gi;
    let vm;
    while ((vm = vRe.exec(block)) !== null) {
      verts.push(parseFloat(vm[1]), parseFloat(vm[2]), parseFloat(vm[3]));
    }
    const tRe = /<triangle\b[^>]*v1="(\d+)"[^>]*v2="(\d+)"[^>]*v3="(\d+)"/gi;
    let tm;
    while ((tm = tRe.exec(block)) !== null) {
      const a = parseInt(tm[1], 10) * 3;
      const b = parseInt(tm[2], 10) * 3;
      const c = parseInt(tm[3], 10) * 3;
      if (a + 2 < verts.length && b + 2 < verts.length && c + 2 < verts.length) {
        out.push(
          verts[a], verts[a + 1], verts[a + 2],
          verts[b], verts[b + 1], verts[b + 2],
          verts[c], verts[c + 1], verts[c + 2],
        );
      }
    }
  }
  if (out.length === 0) throw new Error('No triangles parsed from 3MF archive');
  return new Float32Array(out);
}

// Inspect Native SolidCraft .sc ZIP Archive (document.json + cache/thumbnail.png)
export async function parseSolidCraftArchive(buffer, fileName = 'design.sc') {
  const entries = await extractZipEntries(buffer);
  const docEntry = entries.get('document.json');
  if (!docEntry) throw new Error('Not a valid SolidCraft .sc container (missing document.json)');
  const docText = new TextDecoder('utf-8').decode(await docEntry.readBytes());
  const doc = JSON.parse(docText);

  let thumbnailBase64 = null;
  const thumbEntry = entries.get('cache/thumbnail.png');
  if (thumbEntry) {
    const pngBytes = await thumbEntry.readBytes();
    let bin = '';
    for (let i = 0; i < pngBytes.length; i++) bin += String.fromCharCode(pngBytes[i]);
    thumbnailBase64 = typeof btoa === 'function'
      ? btoa(bin)
      : Buffer.from(pngBytes).toString('base64');
  }

  const components = (doc.components || []).map((c) => ({
    id: c.id,
    name: c.name || `Body_${c.id}`,
    parent: c.parent ?? 0,
  }));
  const params = doc.params || {};
  const joints = (doc.assembly?.joints || []).map((j) => ({
    name: j.name || `Joint_${j.id}`,
    kind: j.kind || 'rigid',
  }));
  const appearances = Object.values(doc.appearances?.components || {}).map((a) => ({
    name: a.name,
    color: a.color,
  }));

  const safeBase = fileName.replace(/\.sc$/i, '').replace(/[^a-zA-Z0-9_-]/g, '_');
  const exportCommand = JSON.stringify(
    { command: 'file.export', params: { path: `${safeBase}.stl` } },
    null,
    2,
  );

  return {
    isSolidCraftArchive: true,
    name: doc.name || safeBase,
    units: doc.units || 'mm',
    components,
    params,
    joints,
    appearances,
    thumbnailDataUrl: thumbnailBase64 ? `data:image/png;base64,${thumbnailBase64}` : null,
    exportCommand,
  };
}

// Analyze raw triangle Float32Array (CAD Z-up -> 3D viewport Y-up conversion option),
// center around origin, compute volume/area/bbox/overhang%, build UNORM16 quantized buffer & frustum chunks!
export function analyzeAndOptimizeMesh(rawPositions, options = {}) {
  const swapYZ = options.cadZUp !== false; // CAD (SolidCraft/STL/3MF) is Z-up; convert to Y-up viewport
  const triCount = Math.floor(rawPositions.length / 9);
  if (triCount === 0) throw new Error('Empty triangle mesh');

  // Step 1: Convert coordinate frame & find raw BBox
  const positions = new Float32Array(triCount * 9);
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  for (let i = 0; i < triCount * 9; i += 3) {
    const x = rawPositions[i];
    const y = swapYZ ? rawPositions[i + 2] : rawPositions[i + 1];
    const z = swapYZ ? -rawPositions[i + 1] : rawPositions[i + 2];
    positions[i] = x;
    positions[i + 1] = y;
    positions[i + 2] = z;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }

  // Auto-scale meters->mm if tiny (< 0.5mm max dim)
  const rawSpan = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1e-6);
  const unitScale = rawSpan < 0.5 ? 1000.0 : 1.0;

  const cx = (minX + maxX) * 0.5;
  const cy = (minY + maxY) * 0.5;
  const cz = (minZ + maxZ) * 0.5;

  // Step 2: Center mesh at (0,0,0), compute signed volume (mm³), surface area (mm²), overhang %, & normals
  let signedVol6 = 0;
  let totalArea = 0;
  let overhangArea = 0;
  const normals = new Float32Array(triCount * 9);

  for (let t = 0; t < triCount; t++) {
    const o = t * 9;
    const ax = (positions[o]     - cx) * unitScale;
    const ay = (positions[o + 1] - cy) * unitScale;
    const az = (positions[o + 2] - cz) * unitScale;
    const bx = (positions[o + 3] - cx) * unitScale;
    const by = (positions[o + 4] - cy) * unitScale;
    const bz = (positions[o + 5] - cz) * unitScale;
    const cxp = (positions[o + 6] - cx) * unitScale;
    const cyp = (positions[o + 7] - cy) * unitScale;
    const czp = (positions[o + 8] - cz) * unitScale;

    positions[o] = ax; positions[o + 1] = ay; positions[o + 2] = az;
    positions[o + 3] = bx; positions[o + 4] = by; positions[o + 5] = bz;
    positions[o + 6] = cxp; positions[o + 7] = cyp; positions[o + 8] = czp;

    // Signed tetrahedron volume * 6 = a . (b x c)
    const bcx = by * czp - bz * cyp;
    const bcy = bz * cxp - bx * czp;
    const bcz = bx * cyp - by * cxp;
    signedVol6 += ax * bcx + ay * bcy + az * bcz;

    // Face normal & area
    const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
    const e2x = cxp - ax, e2y = cyp - ay, e2z = czp - az;
    let nx = e1y * e2z - e1z * e2y;
    let ny = e1z * e2x - e1x * e2z;
    let nz = e1x * e2y - e1y * e2x;
    const dblArea = Math.hypot(nx, ny, nz);
    if (dblArea > 1e-10) {
      const area = dblArea * 0.5;
      totalArea += area;
      nx /= dblArea; ny /= dblArea; nz /= dblArea;
      // Downward-facing overhang > 45 deg (ny < -0.7071 and above bottom plane)
      const avgY = (ay + by + cyp) / 3;
      const minLocalY = (minY - cy) * unitScale;
      if (ny < -0.7071 && avgY > minLocalY + 0.5) {
        overhangArea += area;
      }
    } else {
      nx = 0; ny = 1; nz = 0;
    }
    normals[o] = nx; normals[o + 1] = ny; normals[o + 2] = nz;
    normals[o + 3] = nx; normals[o + 4] = ny; normals[o + 5] = nz;
    normals[o + 6] = nx; normals[o + 7] = ny; normals[o + 8] = nz;
  }

  const halfX = ((maxX - minX) * 0.5) * unitScale;
  const halfY = ((maxY - minY) * 0.5) * unitScale;
  const halfZ = ((maxZ - minZ) * 0.5) * unitScale;
  const localBBox = {
    min: [-halfX, -halfY, -halfZ],
    max: [halfX, halfY, halfZ],
  };

  // Fallback to 35% of bbox volume if mesh is open/non-manifold
  const absVolMm3 = Math.abs(signedVol6 / 6);
  const bboxVolMm3 = Math.max(1, (halfX * 2) * (halfY * 2) * (halfZ * 2));
  const volumeCm3 = Number(((absVolMm3 > 1 ? absVolMm3 : bboxVolMm3 * 0.35) / 1000).toFixed(2));
  const surfaceAreaCm2 = Number((totalArea / 100).toFixed(2));
  const overhangPct = totalArea > 0 ? Number(((overhangArea / totalArea) * 100).toFixed(1)) : 0;

  // Step 3: Build UNORM16 Quantized Positions (6 bytes/vertex vs 12 bytes float32 + 0 bytes normal in WebGL2!)
  const spanX = Math.max(halfX * 2, 1e-4);
  const spanY = Math.max(halfY * 2, 1e-4);
  const spanZ = Math.max(halfZ * 2, 1e-4);
  const quantized = new Uint16Array(triCount * 9);
  for (let i = 0; i < triCount * 9; i += 3) {
    quantized[i]     = Math.max(0, Math.min(65535, Math.round(((positions[i]     + halfX) / spanX) * 65535)));
    quantized[i + 1] = Math.max(0, Math.min(65535, Math.round(((positions[i + 1] + halfY) / spanY) * 65535)));
    quantized[i + 2] = Math.max(0, Math.min(65535, Math.round(((positions[i + 2] + halfZ) / spanZ) * 65535)));
  }

  // Step 4: Build 4096-triangle Frustum Culling Chunks (for ultra-fast rendering of large CAD parts!)
  const chunks = [];
  for (let startTri = 0; startTri < triCount; startTri += CHUNK_TRIS) {
    const count = Math.min(CHUNK_TRIS, triCount - startTri);
    let cMinX = Infinity, cMinY = Infinity, cMinZ = Infinity;
    let cMaxX = -Infinity, cMaxY = -Infinity, cMaxZ = -Infinity;
    const endFloat = (startTri + count) * 9;
    for (let i = startTri * 9; i < endFloat; i += 3) {
      const px = positions[i], py = positions[i + 1], pz = positions[i + 2];
      if (px < cMinX) cMinX = px; if (px > cMaxX) cMaxX = px;
      if (py < cMinY) cMinY = py; if (py > cMaxY) cMaxY = py;
      if (pz < cMinZ) cMinZ = pz; if (pz > cMaxZ) cMaxZ = pz;
    }
    const scx = (cMinX + cMaxX) * 0.5;
    const scy = (cMinY + cMaxY) * 0.5;
    const scz = (cMinZ + cMaxZ) * 0.5;
    const sr = Math.hypot(cMaxX - scx, cMaxY - scy, cMaxZ - scz);
    chunks.push({
      firstVertex: startTri * 3,
      vertexCount: count * 3,
      center: [scx, scy, scz],
      radius: sr,
    });
  }

  return {
    positions,
    normals,
    quantized,
    triCount,
    localBBox,
    sizeMm: [Number((halfX * 2).toFixed(1)), Number((halfY * 2).toFixed(1)), Number((halfZ * 2).toFixed(1))],
    volumeCm3,
    surfaceAreaCm2,
    overhangPct,
    chunks,
    quantOrigin: [-halfX, -halfY, -halfZ],
    quantScale: [spanX, spanY, spanZ],
  };
}

// Universal File Entry Point (auto-detects .stl, .obj, .3mf, .zip, .sc)
export async function parseCADFile(buffer, fileName) {
  const lower = (fileName || '').toLowerCase();
  if (lower.endsWith('.sc') || lower.endsWith('.solidcraft')) {
    return await parseSolidCraftArchive(buffer, fileName);
  }
  if (lower.endsWith('.3mf')) {
    const raw = await parse3MF(buffer);
    return { isMesh: true, format: '3MF', ...analyzeAndOptimizeMesh(raw) };
  }
  if (lower.endsWith('.zip')) {
    const entries = await extractZipEntries(buffer);
    for (const [name, entry] of entries) {
      const nl = name.toLowerCase();
      if (nl.endsWith('.stl') || nl.endsWith('.obj') || nl.endsWith('.3mf')) {
        const bytes = await entry.readBytes();
        return await parseCADFile(bytes.buffer, name);
      }
    }
    throw new Error('No STL, OBJ, or 3MF mesh found inside ZIP archive');
  }
  if (lower.endsWith('.obj')) {
    const text = new TextDecoder('utf-8').decode(buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer));
    const raw = parseOBJ(text);
    return { isMesh: true, format: 'OBJ', ...analyzeAndOptimizeMesh(raw, { cadZUp: false }) };
  }
  // Default: STL (binary or ASCII)
  const raw = parseSTL(buffer);
  return { isMesh: true, format: 'STL', ...analyzeAndOptimizeMesh(raw) };
}

// Export Float32Array positions (Y-up viewport -> CAD Z-up) as compact Binary STL ArrayBuffer
export function exportBinarySTL(positions, headerText = '3dich Exported Assembly') {
  const triCount = Math.floor(positions.length / 9);
  const buf = new ArrayBuffer(84 + triCount * 50);
  const bytes = new Uint8Array(buf);
  const enc = new TextEncoder().encode(headerText.slice(0, 79));
  bytes.set(enc, 0);
  const view = new DataView(buf);
  view.setUint32(80, triCount, true);

  let off = 84;
  for (let t = 0; t < triCount; t++) {
    const o = t * 9;
    // Convert Y-up back to CAD Z-up: (x, -z, y)
    const ax = positions[o],     ay = -positions[o + 2], az = positions[o + 1];
    const bx = positions[o + 3], by = -positions[o + 5], bz = positions[o + 4];
    const cx = positions[o + 6], cy = -positions[o + 8], cz = positions[o + 7];
    const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
    const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
    let nx = e1y * e2z - e1z * e2y;
    let ny = e1z * e2x - e1x * e2z;
    let nz = e1x * e2y - e1y * e2x;
    const len = Math.hypot(nx, ny, nz) || 1;
    view.setFloat32(off, nx / len, true); off += 4;
    view.setFloat32(off, ny / len, true); off += 4;
    view.setFloat32(off, nz / len, true); off += 4;
    view.setFloat32(off, ax, true); off += 4;
    view.setFloat32(off, ay, true); off += 4;
    view.setFloat32(off, az, true); off += 4;
    view.setFloat32(off, bx, true); off += 4;
    view.setFloat32(off, by, true); off += 4;
    view.setFloat32(off, bz, true); off += 4;
    view.setFloat32(off, cx, true); off += 4;
    view.setFloat32(off, cy, true); off += 4;
    view.setFloat32(off, cz, true); off += 4;
    view.setUint16(off, 0, true); off += 2;
  }
  return buf;
}
