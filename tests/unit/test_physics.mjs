import assert from 'node:assert/strict';
import {
  PRINTER_PLATFORMS,
  PRINTER_BY_ID,
  MOD_CATALOG,
  BUILD_PRESETS,
  MOUNT_HARDPOINTS,
  getHardpointPose,
} from '../../docs/js/catalog.js';
import {
  evaluatePrinterBuild,
  computeCustomPartMassG,
  generateKlipperConfig,
  formatDuration,
} from '../../docs/js/physics_engine.js';

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  [PASS] ${name}`);
}

console.log('=== 3dich Physics & Catalog Unit Tests ===');

test('Catalog contains >= 55 engineered mods across 10 categories and >= 150 real printers', () => {
  assert.ok(MOD_CATALOG.length >= 55, `Expected >= 55 mods, got ${MOD_CATALOG.length}`);
  assert.ok(PRINTER_PLATFORMS.length >= 150, `Expected >= 150 printers, got ${PRINTER_PLATFORMS.length}`);
  assert.equal(BUILD_PRESETS.length, 6);
  assert.equal(MOUNT_HARDPOINTS.length, 12);
  const ids = new Set(MOD_CATALOG.map((m) => m.id));
  assert.equal(ids.size, MOD_CATALOG.length, 'Mod IDs must be unique');
  const pIds = new Set(PRINTER_PLATFORMS.map((p) => p.id));
  assert.equal(pIds.size, PRINTER_PLATFORMS.length, 'Printer IDs must be unique');
  // Verify iconic classics & modern machines exist
  for (const mustHave of ['creality_ender3', 'creality_ender3_pro', 'creality_cr10', 'anet_a8', 'prusa_mk4s', 'bambu_x1c', 'voron_24_300', 'flsun_v400', 'prusa_mini', 'custom_scratch']) {
    assert.ok(pIds.has(mustHave), `Missing required printer: ${mustHave}`);
  }
});

test('All curated presets reference valid printers (or aliases) and valid mod IDs', () => {
  const modIds = new Set(MOD_CATALOG.map((m) => m.id));
  for (const preset of BUILD_PRESETS) {
    const res = evaluatePrinterBuild(preset.printerId, preset.mods, []);
    assert.ok(res.current.engineeringScore >= 20, `Preset ${preset.id} must evaluate cleanly`);
    for (const m of preset.mods) {
      assert.ok(modIds.has(m), `Invalid mod ${m} in preset ${preset.id}`);
    }
  }
});

test('Stock baseline deltas are zero when no mods or custom parts installed', () => {
  const res = evaluatePrinterBuild('voron-24', [], []);
  assert.equal(res.deltas.xMassG, 0);
  assert.equal(res.deltas.yMassG, 0);
  assert.equal(res.deltas.benchySec, 0);
  assert.equal(res.current.engineeringScore, res.baseline.engineeringScore);
  assert.ok(res.current.resonanceCurve.length > 40);
});

test('Speedboat Racer preset drastically reduces Benchy time and raises accel & flow', () => {
  const preset = BUILD_PRESETS.find((p) => p.id === 'speedboat-racer');
  const res = evaluatePrinterBuild(preset.printerId, preset.mods, []);
  assert.ok(res.current.maxFlowMm3s >= 45, `Expected flow >= 45, got ${res.current.maxFlowMm3s}`);
  assert.ok(res.current.maxAccelMmS2 > res.baseline.maxAccelMmS2 * 2, 'Accel should more than double');
  assert.ok(res.current.benchySec < res.baseline.benchySec * 0.65, 'Benchy should drop >35%');
  assert.ok(res.current.coolingPa > 5000, 'CPAP should provide >5000 Pa static pressure');
});

test('Engineering PEEK chamber preset unlocks PEEK and PA12-CF compatibility', () => {
  const preset = BUILD_PRESETS.find((p) => p.id === 'engineering-peek');
  const res = evaluatePrinterBuild(preset.printerId, preset.mods, []);
  const peek = res.current.materialMatrix.find((m) => m.id === 'PEEK');
  const pacf = res.current.materialMatrix.find((m) => m.id === 'PA12-CF');
  assert.equal(pacf.status, 'ok', `PA12-CF should be ok: ${JSON.stringify(pacf)}`);
  assert.equal(peek.status, 'ok', `PEEK should be ok: ${JSON.stringify(peek)}`);
});

test('Heavy SolidCraft Steel part on Toolhead lowers resonant frequency & warns, while on Frame does not hurt X mass', () => {
  const heavyToolheadPart = {
    id: 'sc-1',
    name: 'SolidCraft Steel Mount',
    volumeCm3: 28,
    materialId: 'steel',
    infillPct: 100,
    zone: 'toolhead',
    pos: [0, 260, 62],
    rot: [0, 0, 0],
    scale: [1, 1, 1],
    localBBox: { min: [-20, -15, -15], max: [20, 15, 15] },
  };
  const mass = computeCustomPartMassG(heavyToolheadPart);
  assert.ok(mass > 200, `Expected steel part >200g, got ${mass}`);

  const onToolhead = evaluatePrinterBuild('voron-24', [], [heavyToolheadPart]);
  const onFrame = evaluatePrinterBuild('voron-24', [], [{ ...heavyToolheadPart, zone: 'frame', pos: [230, 300, 0] }]);

  assert.ok(onToolhead.current.xMassG > onToolhead.baseline.xMassG + 200);
  assert.ok(onToolhead.current.freqX < onToolhead.baseline.freqX, 'Heavier toolhead must reduce X resonance freq');
  assert.ok(onToolhead.current.warnings.some((w) => w.code === 'heavy-toolhead-part'), 'Must emit heavy toolhead warning');
  assert.ok(onToolhead.current.warnings.some((w) => w.code === 'cantilever-torque'), 'Must emit cantilever torque warning');

  assert.equal(onFrame.current.xMassG, onFrame.baseline.xMassG, 'Static frame part must NOT add toolhead moving mass');
  assert.ok(onFrame.current.frameMassG > onFrame.baseline.frameMassG + 200);
});

test('PLA SolidCraft part placed right next to hotend triggers Thermal Softening error', () => {
  const plaHotPart = {
    id: 'sc-pla',
    name: 'PLA Duct',
    volumeCm3: 10,
    materialId: 'pla',
    infillPct: 30,
    zone: 'toolhead',
    pos: [0, 215, 18],
    rot: [0, 0, 0],
    scale: [1, 1, 1],
    localBBox: { min: [-12, -10, -10], max: [12, 10, 10] },
  };
  const res = evaluatePrinterBuild('voron-24', [], [plaHotPart]);
  assert.ok(res.current.warnings.some((w) => w.code === 'thermal-softening-nozzle'), 'Must warn PLA near hotend');
});

test('Collision detector catches SolidCraft part intruding into build volume and part-vs-part clash', () => {
  const partA = {
    id: 'p1', name: 'Bracket A', volumeCm3: 15, materialId: 'petg', zone: 'frame',
    pos: [0, 260, 0], rot: [0, 0, 0], scale: [1, 1, 1],
    localBBox: { min: [-25, -25, -25], max: [25, 25, 25] },
  };
  const partB = {
    id: 'p2', name: 'Bracket B', volumeCm3: 15, materialId: 'petg', zone: 'frame',
    pos: [10, 260, 0], rot: [0, 0, 0], scale: [1, 1, 1],
    localBBox: { min: [-25, -25, -25], max: [25, 25, 25] },
  };
  const res = evaluatePrinterBuild('voron-24', [], [partA, partB]);
  assert.ok(res.current.collisions.some((c) => c.target === 'build-volume'), 'Must detect build-volume collision');
  assert.ok(res.current.collisions.some((c) => c.target === 'Bracket B'), 'Must detect part-to-part clash');
});

test('Hardpoint poses resolve cleanly for every printer and every hardpoint', () => {
  for (const printer of PRINTER_PLATFORMS) {
    for (const hp of MOUNT_HARDPOINTS) {
      const pose = getHardpointPose(printer, hp.id);
      assert.equal(pose.pos.length, 3);
      assert.ok(pose.pos.every(Number.isFinite));
    }
  }
});

test('Klipper printer.cfg generator includes kinematics (corexy/cartesian/delta), input_shaper, and active mod snippets', () => {
  const voron = PRINTER_BY_ID.get('voron_24_300');
  const mods = ['hotend-rapido-uhf', 'probe-beacon-eddy', 'cool-cpap-turbo'];
  const evalRes = evaluatePrinterBuild(voron, mods, []);
  const cfg = generateKlipperConfig(voron, mods, evalRes);
  assert.ok(cfg.includes('kinematics: corexy'));
  assert.ok(cfg.includes('[input_shaper]'));
  assert.ok(cfg.includes('[beacon]'));
  assert.ok(cfg.includes('Rapido 2 UHF'));

  const ender = PRINTER_BY_ID.get('creality_ender3_pro');
  assert.ok(generateKlipperConfig(ender, [], evaluatePrinterBuild(ender, [], [])).includes('kinematics: cartesian'));

  const delta = PRINTER_BY_ID.get('flsun_v400');
  assert.ok(generateKlipperConfig(delta, [], evaluatePrinterBuild(delta, [], [])).includes('kinematics: delta'));
  assert.equal(formatDuration(754), '12m 34s');
});

console.log(`ALL ${passed} PHYSICS TESTS PASSED!`);
