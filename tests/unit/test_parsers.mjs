import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import {
  parseSTL,
  parseOBJ,
  parse3MF,
  parseCADFile,
  analyzeAndOptimizeMesh,
  exportBinarySTL,
} from '../../docs/js/mesh_parsers.js';

let passed = 0;
function test(name, fn) {
  return Promise.resolve(fn()).then(() => {
    passed++;
    console.log(`  [PASS] ${name}`);
  });
}

// Helper: construct a 10x20x30mm box (volume = 6000 mm³ = 6.00 cm³) in ASCII STL
function makeBoxAsciiSTL(w, d, h) {
  const p = [
    [0,0,0],[w,0,0],[w,d,0],[0,d,0],
    [0,0,h],[w,0,h],[w,d,h],[0,d,h],
  ];
  const tris = [
    [0,2,1],[0,3,2], // bottom
    [4,5,6],[4,6,7], // top
    [0,1,5],[0,5,4], // front
    [2,3,7],[2,7,6], // back
    [0,4,7],[0,7,3], // left
    [1,2,6],[1,6,5], // right
  ];
  let out = 'solid box\n';
  for (const [a, b, c] of tris) {
    out += 'facet normal 0 0 1\nouter loop\n';
    for (const idx of [a, b, c]) out += `vertex ${p[idx][0]} ${p[idx][1]} ${p[idx][2]}\n`;
    out += 'endloop\nendfacet\n';
  }
  out += 'endsolid box\n';
  return out;
}

// Helper: build minimal valid ZIP archive with stored or deflated file
function makeZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data, deflate } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const rawBuf = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
    const compBuf = deflate ? zlib.deflateRawSync(rawBuf) : rawBuf;
    const method = deflate ? 8 : 0;

    const local = Buffer.alloc(30 + nameBuf.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(compBuf.length, 18);
    local.writeUInt32LE(rawBuf.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    nameBuf.copy(local, 30);
    locals.push(local, compBuf);

    const central = Buffer.alloc(46 + nameBuf.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(compBuf.length, 20);
    central.writeUInt32LE(rawBuf.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    nameBuf.copy(central, 46);
    centrals.push(central);

    offset += local.length + compBuf.length;
  }
  const cdBuf = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cdBuf, eocd]);
}

async function run() {
  console.log('=== 3dich CAD Parser & Metrology Unit Tests ===');

  await test('ASCII STL parsing + exact signed volume (10x20x30mm = 6.00 cm³) + UNORM16 quantization', () => {
    const buf = Buffer.from(makeBoxAsciiSTL(10, 20, 30), 'utf8');
    const raw = parseSTL(buf);
    assert.equal(raw.length, 12 * 9);
    const m = analyzeAndOptimizeMesh(raw);
    assert.equal(m.triCount, 12);
    assert.ok(Math.abs(m.volumeCm3 - 6.0) < 0.05, `Expected ~6.00 cm³, got ${m.volumeCm3}`);
    assert.ok(Math.abs(m.surfaceAreaCm2 - 22.0) < 0.1, `Expected ~22.0 cm², got ${m.surfaceAreaCm2}`);
    assert.equal(m.quantized.length, 12 * 9);
    assert.equal(m.chunks.length, 1);
  });

  await test('Binary STL round-trip + "solid " binary header trap protection', () => {
    const asciiRaw = parseSTL(Buffer.from(makeBoxAsciiSTL(40, 20, 15), 'utf8'));
    const analyzed = analyzeAndOptimizeMesh(asciiRaw);
    // Intentionally start binary STL header with "solid TRAP" to prove binary length guard works!
    const binBuf = exportBinarySTL(analyzed.positions, 'solid TRAP binary STL header');
    const reparsed = parseSTL(binBuf);
    assert.equal(reparsed.length, 12 * 9);
    const m2 = analyzeAndOptimizeMesh(reparsed);
    assert.ok(Math.abs(m2.volumeCm3 - 12.0) < 0.05, `Expected ~12.0 cm³, got ${m2.volumeCm3}`);
  });

  await test('Wavefront OBJ parsing (quad triangulation + negative indices)', () => {
    const obj = `
      # Test quad face
      v 0 0 0
      v 20 0 0
      v 20 20 0
      v 0 20 0
      f -4 -3 -2 -1
    `;
    const raw = parseOBJ(obj);
    assert.equal(raw.length, 2 * 9, 'Quad must triangulate to 2 triangles');
  });

  await test('3MF ZIP-deflate + XML mesh extraction', async () => {
    const modelXml = `<?xml version="1.0" encoding="UTF-8"?>
      <model unit="millimeter"><resources><object id="1"><mesh>
        <vertices>
          <vertex x="0" y="0" z="0" /><vertex x="10" y="0" z="0" />
          <vertex x="10" y="10" z="0" /><vertex x="0" y="0" z="10" />
        </vertices>
        <triangles>
          <triangle v1="0" v2="2" v3="1" />
          <triangle v1="0" v2="1" v3="3" />
          <triangle v1="1" v2="2" v3="3" />
          <triangle v1="2" v2="0" v3="3" />
        </triangles>
      </mesh></object></resources></model>`;
    const zipBuf = makeZip([{ name: '3D/3dmodel.model', data: modelXml, deflate: true }]);
    const res = await parseCADFile(zipBuf, 'bracket.3mf');
    assert.equal(res.isMesh, true);
    assert.equal(res.format, '3MF');
    assert.equal(res.triCount, 4);
  });

  await test('SolidCraft .sc archive inspector extracts components, params, joints & thumbnail', async () => {
    const scPath = '/solidcraft/solidcraft boklu/kasnak.sc';
    if (fs.existsSync(scPath)) {
      const scBuf = fs.readFileSync(scPath);
      const info = await parseCADFile(scBuf, 'kasnak.sc');
      assert.equal(info.isSolidCraftArchive, true);
      assert.ok(info.components.length >= 2, `Expected SolidCraft components, got ${info.components.length}`);
      assert.ok(info.thumbnailDataUrl?.startsWith('data:image/png;base64,'), 'Must extract embedded PNG thumbnail');
      assert.ok(info.exportCommand.includes('file.export'));
    } else {
      // Synthetic .sc test if mounted path not present
      const fakeDoc = JSON.stringify({ name: 'TestBracket', units: 'mm', components: [{ id: 1, name: 'Body1' }], params: { W: '40 mm' } });
      const scBuf = makeZip([{ name: 'document.json', data: fakeDoc, deflate: true }]);
      const info = await parseCADFile(scBuf, 'test.sc');
      assert.equal(info.isSolidCraftArchive, true);
      assert.equal(info.components[0].name, 'Body1');
    }
  });

  await test('Real SolidCraft exported STL (Fuselage_Key.stl) parses cleanly if mounted', async () => {
    const stlPath = '/solidcraft/p51/Fuselage_Key.stl';
    if (fs.existsSync(stlPath)) {
      const stlBuf = fs.readFileSync(stlPath);
      const res = await parseCADFile(stlBuf, 'Fuselage_Key.stl');
      assert.equal(res.isMesh, true);
      assert.ok(res.triCount > 10);
      assert.ok(res.volumeCm3 > 0);
    }
  });

  console.log(`ALL ${passed} CAD PARSER TESTS PASSED!`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
