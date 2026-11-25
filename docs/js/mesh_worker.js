// 3dich — Off-Thread Web Worker for Zero-Jank CAD Parsing (STL / OBJ / 3MF / ZIP / SolidCraft .sc)
import { parseCADFile } from './mesh_parsers.js';

self.onmessage = async (ev) => {
  const { id, buffer, fileName } = ev.data || {};
  try {
    const t0 = performance.now();
    const result = await parseCADFile(buffer, fileName);
    const elapsedMs = Number((performance.now() - t0).toFixed(2));
    if (result.isMesh) {
      // Zero-copy transferable ArrayBuffers back to main thread!
      const transfers = [result.positions.buffer, result.normals.buffer, result.quantized.buffer];
      self.postMessage({ id, ok: true, elapsedMs, result }, transfers);
    } else {
      self.postMessage({ id, ok: true, elapsedMs, result });
    }
  } catch (err) {
    self.postMessage({ id, ok: false, error: err?.message || String(err) });
  }
};
