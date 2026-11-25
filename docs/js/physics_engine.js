// 3dich — Real-Time 3D Printer Physics, Kinematics, Thermal, Acoustic, Collision & Klipper Engine
// Pure deterministic engineering solver: zero DOM dependencies, runs in browser & Node tests.

import {
  PRINTER_BY_ID,
  MOD_BY_ID,
  MATERIAL_BY_ID,
  PRINTER_PLATFORMS,
} from './catalog.js';
import { clamp } from './math3d.js';

export const FILAMENT_TARGETS = [
  { id: 'PLA',      minNozzle: 195, minBed: 45,  minChamber: 18, maxChamber: 42, directReq: false, vocReq: false },
  { id: 'PETG',     minNozzle: 230, minBed: 70,  minChamber: 18, maxChamber: 55, directReq: false, vocReq: false },
  { id: 'TPU 95A',  minNozzle: 220, minBed: 45,  minChamber: 18, maxChamber: 50, directReq: true,  vocReq: false },
  { id: 'ABS',      minNozzle: 250, minBed: 100, minChamber: 42, maxChamber: 85, directReq: false, vocReq: true  },
  { id: 'ASA',      minNozzle: 255, minBed: 100, minChamber: 45, maxChamber: 85, directReq: false, vocReq: true  },
  { id: 'PA12-CF',  minNozzle: 280, minBed: 95,  minChamber: 50, maxChamber: 95, directReq: true,  vocReq: true  },
  { id: 'PC',       minNozzle: 295, minBed: 110, minChamber: 58, maxChamber: 100,directReq: true,  vocReq: true  },
  { id: 'PEEK',     minNozzle: 390, minBed: 125, minChamber: 68, maxChamber: 140,directReq: true,  vocReq: true  },
];

// Estimate SolidCraft custom part real mass (grams) from volumeCm3, materialId, infillPct
export function computeCustomPartMassG(part) {
  const mat = MATERIAL_BY_ID.get(part.materialId || 'petg') || MATERIAL_BY_ID.get('petg');
  const volCm3 = Math.max(0.1, Number(part.volumeCm3) || 12);
  const scale = part.scale || [1, 1, 1];
  const scaledVol = volCm3 * Math.abs((scale[0] ?? 1) * (scale[1] ?? 1) * (scale[2] ?? 1));
  if (!mat.printable) {
    return scaledVol * mat.density;
  }
  // Effective solid ratio for FDM: shell (~32% of typical bracket volume) + remaining * infill%
  const infill = clamp(Number(part.infillPct ?? 35), 10, 100) / 100;
  const effFill = clamp(0.32 + 0.68 * infill, 0.32, 1.0);
  return scaledVol * mat.density * effFill;
}

// Compute effective world AABB for a custom part (mm)
export function getCustomPartWorldAABB(part) {
  const bb = part.localBBox || { min: [-20, -15, -20], max: [20, 15, 20] };
  const s = part.scale || [1, 1, 1];
  const p = part.pos || [0, 200, 0];
  const rx = ((part.rot?.[0] || 0) * Math.PI) / 180;
  const ry = ((part.rot?.[1] || 0) * Math.PI) / 180;
  const rz = ((part.rot?.[2] || 0) * Math.PI) / 180;

  // Transform all 8 corners for tight rotated AABB
  const cx = Math.cos(rx), sx = Math.sin(rx);
  const cy = Math.cos(ry), sy = Math.sin(ry);
  const cz = Math.cos(rz), sz = Math.sin(rz);
  const r00 = cy * cz, r01 = cz * sx * sy - cx * sz, r02 = cx * cz * sy + sx * sz;
  const r10 = cy * sz, r11 = cx * cz + sx * sy * sz, r12 = cx * sy * sz - cz * sx;
  const r20 = -sy,     r21 = cy * sx,                r22 = cx * cy;

  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let ix = 0; ix < 2; ix++) {
    for (let iy = 0; iy < 2; iy++) {
      for (let iz = 0; iz < 2; iz++) {
        const lx = (ix ? bb.max[0] : bb.min[0]) * (s[0] ?? 1);
        const ly = (iy ? bb.max[1] : bb.min[1]) * (s[1] ?? 1);
        const lz = (iz ? bb.max[2] : bb.min[2]) * (s[2] ?? 1);
        const wx = r00 * lx + r01 * ly + r02 * lz + p[0];
        const wy = r10 * lx + r11 * ly + r12 * lz + p[1];
        const wz = r20 * lx + r21 * ly + r22 * lz + p[2];
        if (wx < min[0]) min[0] = wx;
        if (wy < min[1]) min[1] = wy;
        if (wz < min[2]) min[2] = wz;
        if (wx > max[0]) max[0] = wx;
        if (wy > max[1]) max[1] = wy;
        if (wz > max[2]) max[2] = wz;
      }
    }
  }
  return { min, max };
}

function aabbOverlapMm(a, b) {
  const ox = Math.min(a.max[0], b.max[0]) - Math.max(a.min[0], b.min[0]);
  const oy = Math.min(a.max[1], b.max[1]) - Math.max(a.min[1], b.min[1]);
  const oz = Math.min(a.max[2], b.max[2]) - Math.max(a.min[2], b.min[2]);
  if (ox > 0.5 && oy > 0.5 && oz > 0.5) {
    return { ox, oy, oz, minDepth: Math.min(ox, oy, oz) };
  }
  return null;
}

// Compute realistic 3DBenchy print time (seconds) using trapezoidal acceleration kinematics
// Standard 3DBenchy: ~4.8m perimeter/infill path at 0.2mm layer, 240 layers, ~8200 moves, avg move 3.6mm
function estimateBenchySeconds(cruiseSpeedMmS, maxAccelMmS2, coolingLimitSpeed, toolchangeSec = 0) {
  const effectiveSpeed = Math.max(25, Math.min(cruiseSpeedMmS, coolingLimitSpeed));
  const accel = Math.max(500, maxAccelMmS2);
  // Segment distribution for Benchy: short detail moves + longer hull moves
  const segments = [
    { count: 4800, len: 2.2 },
    { count: 2900, len: 7.5 },
    { count: 1100, len: 22.0 },
  ];
  let moveSec = 0;
  for (const seg of segments) {
    // Trapezoidal vs triangular profile with junction deviation (~25% corner entry)
    const vEntry = Math.min(effectiveSpeed * 0.28, Math.sqrt(accel * 0.45));
    const dv = Math.max(0, effectiveSpeed - vEntry);
    const dAccel = (effectiveSpeed * effectiveSpeed - vEntry * vEntry) / (2 * accel);
    let tSeg;
    if (2 * dAccel <= seg.len) {
      const tRamp = dv / accel;
      const tCruise = (seg.len - 2 * dAccel) / effectiveSpeed;
      tSeg = 2 * tRamp + tCruise;
    } else {
      const vPeak = Math.sqrt(vEntry * vEntry + accel * seg.len);
      tSeg = (2 * (vPeak - vEntry)) / accel;
    }
    moveSec += seg.count * tSeg;
  }
  // Retractions + travel moves + Z hops + minimum layer cooling time on chimney (~55 small top layers)
  const travelSec = (2400 * 14) / Math.max(100, Math.min(600, effectiveSpeed * 1.5)) + 90;
  const minLayerTime = clamp(4.2 - (coolingLimitSpeed / 160), 0.75, 4.0);
  const chimneyPenalty = 55 * Math.max(0, minLayerTime - 0.65);
  // If single-color Benchy, no toolchange penalty; show multi-color overhead separately
  return Math.round(moveSec + travelSec + chimneyPenalty + (toolchangeSec > 0 ? 0 : 0));
}

// Generate Input Shaper PSD (Power Spectral Density) curve data (10 Hz .. 120 Hz)
export function generateResonanceSpectrum(freqX, freqY, stiffness, hasShaper) {
  const points = [];
  const damping = clamp(0.065 * Math.sqrt(stiffness), 0.045, 0.14);
  for (let hz = 10; hz <= 120; hz += 2) {
    const rx = hz / Math.max(12, freqX);
    const ry = hz / Math.max(12, freqY);
    const px = 1 / Math.sqrt((1 - rx * rx) ** 2 + (2 * damping * rx) ** 2);
    const py = 1 / Math.sqrt((1 - ry * ry) ** 2 + (2 * damping * ry) ** 2);
    // Input shaper notch filter attenuation around dominant peaks
    const notchX = hasShaper ? (1 - 0.84 * Math.exp(-(((hz - freqX) / 8.5) ** 2))) : 1;
    const notchY = hasShaper ? (1 - 0.84 * Math.exp(-(((hz - freqY) / 8.5) ** 2))) : 1;
    points.push({
      hz,
      rawX: Number(Math.min(12, px).toFixed(3)),
      rawY: Number(Math.min(12, py).toFixed(3)),
      shapedX: Number(Math.min(12, px * notchX).toFixed(3)),
      shapedY: Number(Math.min(12, py * notchY).toFixed(3)),
    });
  }
  return points;
}

function evaluateCore(printer, activeModIds, customParts, options = {}) {
  const s = printer.stock;
  const layerH = options.layerHeight ?? 0.2;
  const lineW = options.lineWidth ?? 0.45;
  const crossSection = layerH * lineW; // mm² (0.09 default)

  let xMassG = s.xMassG;
  let yMassG = s.yMassG;
  let zMassG = s.zMassG;
  let frameMassG = s.frameMassG;
  let stiffness = s.frameStiffness;
  let freqXBonus = 0;
  let freqYBonus = 0;
  let maxFlow = s.maxFlowMm3s;
  let flowAdd = 0;
  let maxNozzleC = s.maxNozzleC;
  let maxBedC = s.maxBedC;
  let chamberC = s.chamberC;
  let coolingCfm = s.coolingCfm;
  let coolingPa = s.coolingStaticPa;
  let voltage = s.stepperVoltage;
  let accelMult = 1.0;
  let directDrive = s.extruderType === 'direct';
  let hasKlipper = s.hasKlipper;
  let hasInputShaper = s.hasInputShaper;
  let hasLinearRails = s.hasLinearRails;
  let enclosed = s.enclosed;
  let vocFilter = false;
  let extraPowerW = 0;
  let psuWatts = s.psuWatts;
  let noiseDba = s.noiseDba;
  let modCostUsd = 0;
  let maxDifficulty = 1;
  let multiMaterialLanes = 1;
  let toolchangeSec = 0;

  const activeMods = [];
  for (const id of activeModIds) {
    const mod = MOD_BY_ID.get(id);
    if (!mod) continue;
    activeMods.push(mod);
    xMassG += mod.mass.x || 0;
    yMassG += mod.mass.y || 0;
    zMassG += mod.mass.z || 0;
    frameMassG += mod.mass.frame || 0;

    const p = mod.perf || {};
    if (p.flowFloor) maxFlow = Math.max(maxFlow, p.flowFloor);
    if (p.flowDelta) flowAdd += p.flowDelta;
    if (p.maxNozzleC) maxNozzleC = Math.max(maxNozzleC, p.maxNozzleC);
    if (p.maxBedC) maxBedC = Math.max(maxBedC, p.maxBedC);
    if (p.chamberDelta) chamberC += p.chamberDelta;
    if (p.coolingCfmDelta) coolingCfm += p.coolingCfmDelta;
    if (p.coolingPaDelta) coolingPa += p.coolingPaDelta;
    if (p.stiffnessMult) stiffness *= p.stiffnessMult;
    if (p.freqXDelta) freqXBonus += p.freqXDelta;
    if (p.freqYDelta) freqYBonus += p.freqYDelta;
    if (p.voltageSet) voltage = Math.max(voltage, p.voltageSet);
    if (p.accelMult) accelMult *= p.accelMult;
    if (p.extruderDirect) directDrive = true;
    if (p.klipperEnable) hasKlipper = true;
    if (p.shaperEnable) hasInputShaper = true;
    if (p.linearRails) hasLinearRails = true;
    if (p.enclosed) enclosed = true;
    if (p.vocFilter) vocFilter = true;
    if (p.powerW) extraPowerW += p.powerW;
    if (p.psuBonusW) psuWatts += p.psuBonusW;
    if (p.noiseDba) noiseDba += p.noiseDba;
    if (p.costUsd) modCostUsd += p.costUsd;
    if (p.difficulty) maxDifficulty = Math.max(maxDifficulty, p.difficulty);
    if (p.multiMaterial) multiMaterialLanes = Math.max(multiMaterialLanes, p.multiMaterial);
    if (p.toolchangeSec) toolchangeSec = p.toolchangeSec;
  }

  // Incorporate user-imported SolidCraft custom CAD parts!
  let customPartMassTotalG = 0;
  let customToolheadMassG = 0;
  let customCantileverTorqueNmm = 0;
  const warnings = [];
  const collisions = [];

  const ox = printer.outerSize.x;
  const oy = printer.outerSize.z;
  const oz = printer.outerSize.y;
  const bx = printer.buildVolume.x;
  const bz = printer.buildVolume.y;
  const bedY = printer.frameType === 'cube' ? oy * 0.36 : 95;
  const nozzleWorld = [0, bedY + 20, 0];
  const buildEnvelopeAABB = {
    min: [-bx * 0.48, bedY + 2, -bz * 0.48],
    max: [bx * 0.48, bedY + printer.buildVolume.z * 0.85, bz * 0.48],
  };

  for (const part of customParts) {
    const massG = computeCustomPartMassG(part);
    customPartMassTotalG += massG;
    const zone = part.zone || 'frame';
    const mat = MATERIAL_BY_ID.get(part.materialId || 'petg') || MATERIAL_BY_ID.get('petg');

    if (zone === 'toolhead') {
      xMassG += massG;
      if (printer.kinematics === 'corexy') {
        yMassG += massG; // CoreXY Y moves gantry + toolhead
      }
      customToolheadMassG += massG;
      // Cantilever lever arm distance from toolhead centerline (X=0, Z=0)
      const armMm = Math.hypot(part.pos?.[0] || 0, part.pos?.[2] || 0);
      customCantileverTorqueNmm += (massG * 0.00981) * armMm;
      if (massG > 120) {
        warnings.push({
          severity: 'warn',
          code: 'heavy-toolhead-part',
          partId: part.id,
          partName: part.name,
          value: Math.round(massG),
          tr: `"${part.name}" (${Math.round(massG)}g) toolhead üzerinde ciddi atalet ekliyor — rezonans düşebilir.`,
          en: `"${part.name}" (${Math.round(massG)}g) adds significant moving inertia on toolhead — lowers resonance.`,
        });
      }
      if (armMm > 55 && massG > 60) {
        warnings.push({
          severity: 'warn',
          code: 'cantilever-torque',
          partId: part.id,
          partName: part.name,
          value: Math.round(armMm),
          tr: `"${part.name}" merkezden ${Math.round(armMm)}mm uzakta asılı — lineer ray torku artıyor.`,
          en: `"${part.name}" cantilevers ${Math.round(armMm)}mm off-center — increases rail twist torque.`,
        });
      }
    } else if (zone === 'bed') {
      if (printer.kinematics === 'bedslinger') {
        yMassG += massG;
      } else {
        zMassG += massG;
      }
    } else if (zone === 'gantry') {
      if (printer.kinematics === 'corexy') yMassG += massG;
      else zMassG += massG;
    } else {
      frameMassG += massG;
      // Heavy frame mass subtly damps chassis vibrations!
      if (massG > 150) stiffness *= 1.015;
    }

    // Thermal softening check (e.g. PLA near hotend or inside hot chamber!)
    const distToNozzle = Math.hypot(
      (part.pos?.[0] || 0) - nozzleWorld[0],
      (part.pos?.[1] || 0) - nozzleWorld[1],
      (part.pos?.[2] || 0) - nozzleWorld[2],
    );
    if (mat.printable && distToNozzle < 48 && mat.maxTemp < 85) {
      warnings.push({
        severity: 'error',
        code: 'thermal-softening-nozzle',
        partId: part.id,
        partName: part.name,
        tr: `Termal Risk: "${part.name}" (${mat.name}, HDT ${mat.maxTemp}°C) hotend'e ${Math.round(distToNozzle)}mm yakın! ABS/ASA/PA-CF önerilir.`,
        en: `Thermal Risk: "${part.name}" (${mat.name}, HDT ${mat.maxTemp}°C) is ${Math.round(distToNozzle)}mm from hotend! Reprint in ABS/ASA/PA-CF.`,
      });
    } else if (mat.printable && enclosed && chamberC > mat.maxTemp - 5) {
      warnings.push({
        severity: 'warn',
        code: 'thermal-softening-chamber',
        partId: part.id,
        partName: part.name,
        tr: `Kabin Isı Riski: "${part.name}" (${mat.name}, limit ${mat.maxTemp}°C) ${Math.round(chamberC)}°C kabinde yumuşayabilir.`,
        en: `Chamber Creep Risk: "${part.name}" (${mat.name}, limit ${mat.maxTemp}°C) may creep in a ${Math.round(chamberC)}°C chamber.`,
      });
    }

    // 3D AABB Collision with Print Envelope (only warn if NOT on toolhead itself or if encroaching build plate!)
    const partBB = getCustomPartWorldAABB(part);
    if (zone !== 'toolhead') {
      const ov = aabbOverlapMm(partBB, buildEnvelopeAABB);
      if (ov) {
        collisions.push({
          partId: part.id,
          partName: part.name,
          target: 'build-volume',
          depthMm: Number(ov.minDepth.toFixed(1)),
          tr: `Çakışma: "${part.name}" baskı hacmine ${ov.minDepth.toFixed(1)}mm giriyor!`,
          en: `Collision: "${part.name}" intrudes ${ov.minDepth.toFixed(1)}mm into print volume!`,
        });
      }
    }
    // Check collision against other custom parts
    for (const other of customParts) {
      if (other.id <= part.id) continue;
      const otherBB = getCustomPartWorldAABB(other);
      const ov = aabbOverlapMm(partBB, otherBB);
      if (ov) {
        collisions.push({
          partId: part.id,
          otherPartId: other.id,
          partName: part.name,
          target: other.name,
          depthMm: Number(ov.minDepth.toFixed(1)),
          tr: `Parça Çakışması: "${part.name}" ↔ "${other.name}" (${ov.minDepth.toFixed(1)}mm örtüşme)`,
          en: `Part Clash: "${part.name}" ↔ "${other.name}" (${ov.minDepth.toFixed(1)}mm overlap)`,
        });
      }
    }
  }

  // Enforce physical floors
  xMassG = Math.max(130, xMassG);
  yMassG = Math.max(240, yMassG);
  zMassG = Math.max(300, zMassG);
  maxFlow = Math.max(8, maxFlow + flowAdd);
  coolingCfm = Math.max(2.0, coolingCfm);
  coolingPa = Math.max(60, coolingPa);
  if (!enclosed) {
    chamberC = clamp(chamberC, 22, 38);
  } else {
    chamberC = clamp(chamberC, 34, 92);
  }

  // Natural resonant frequencies: f_n = f_base * sqrt((k / k_base) * (m_base / m_new)) + delta
  const kRatio = stiffness / s.frameStiffness;
  const freqX = clamp(
    s.baseFreqX * Math.sqrt(kRatio * (s.xMassG / xMassG)) + freqXBonus * 0.65,
    18,
    118,
  );
  const freqY = clamp(
    s.baseFreqY * Math.sqrt(kRatio * (s.yMassG / yMassG)) + freqYBonus * 0.65,
    14,
    108,
  );

  // Recommended ringing-free max acceleration from Klipper MZV shaper physics:
  // a_max ≈ 2.9 * f_min^2 (with shaper), or ~1.1 * f_min^2 without shaper
  const minFreq = Math.min(freqX, freqY);
  const voltageFactor = voltage >= 48 ? 1.32 : 1.0;
  const shaperBaseCoef = hasInputShaper ? 2.85 : 1.15;
  const rawAccel = shaperBaseCoef * minFreq * minFreq * Math.pow(accelMult, 0.45) * voltageFactor;
  const maxAccelMmS2 = Math.round(clamp(rawAccel, 900, 42000));

  // Speed constraints by subsystem
  const flowLimitMmS = Math.round(maxFlow / crossSection);
  // Cooling limit scales with sqrt(CFM) and static pressure bonus (CPAP unlocks huge bridging speeds)
  const coolingScore = coolingCfm * (1 + Math.log10(Math.max(10, coolingPa) / 80) * 0.42);
  const coolingLimitMmS = Math.round(clamp(48 + coolingScore * 16.5, 65, 880));
  const motionLimitMmS = Math.round(
    clamp(
      (printer.kinematics === 'corexy' ? 280 : 145) *
        Math.sqrt(maxAccelMmS2 / 4000) *
        (voltage >= 48 ? 1.38 : 1.0) *
        (hasLinearRails ? 1.16 : 0.92),
      80,
      1150,
    ),
  );

  const effectivePrintSpeedMmS = Math.min(flowLimitMmS, coolingLimitMmS, motionLimitMmS);
  const maxTravelSpeedMmS = Math.round(clamp(motionLimitMmS * 1.25, 150, 1200));

  // Bottleneck identification
  let bottleneck = 'balanced';
  const limits = [
    { key: 'hotend',  val: flowLimitMmS },
    { key: 'cooling', val: coolingLimitMmS },
    { key: 'motion',  val: motionLimitMmS },
  ].sort((a, b) => a.val - b.val);
  if (limits[1].val - limits[0].val > 45) {
    bottleneck = limits[0].key;
  }

  // Shaper recommendation
  let shaperAlgo = 'None (Marlin)';
  if (hasInputShaper) {
    if (minFreq >= 56) shaperAlgo = 'ZV / MZV';
    else if (minFreq >= 40) shaperAlgo = 'MZV';
    else if (minFreq >= 28) shaperAlgo = 'EI';
    else shaperAlgo = '2HUMP_EI';
  }

  // Benchy time estimate
  const benchySec = estimateBenchySeconds(effectivePrintSpeedMmS, maxAccelMmS2, coolingLimitMmS, toolchangeSec);

  // Power budget
  const dcDrawW = Math.max(80, s.baseDrawWatts + extraPowerW);
  const psuHeadroomPct = Math.round(((psuWatts - dcDrawW) / psuWatts) * 100);
  if (psuHeadroomPct < 10) {
    warnings.push({
      severity: 'error',
      code: 'psu-overload',
      tr: `PSU Limiti Aşıldı! DC tüketim ${Math.round(dcDrawW)}W / ${psuWatts}W PSU. Daha güçlü PSU veya AC ısıtıcı/SSR gerekli.`,
      en: `PSU Overload! DC load ${Math.round(dcDrawW)}W vs ${psuWatts}W PSU. Upgrade PSU or isolate heater on AC SSR.`,
    });
  }

  // Filament compatibility matrix
  const materialMatrix = FILAMENT_TARGETS.map((f) => {
    const reasons = [];
    let status = 'ok';
    if (maxNozzleC < f.minNozzle) {
      status = 'fail';
      reasons.push(`Nozzle ${maxNozzleC}°C < ${f.minNozzle}°C`);
    }
    if (maxBedC < f.minBed) {
      status = 'fail';
      reasons.push(`Bed ${maxBedC}°C < ${f.minBed}°C`);
    }
    if (chamberC < f.minChamber) {
      status = f.minChamber >= 55 ? 'fail' : (status === 'fail' ? 'fail' : 'warn');
      reasons.push(`Chamber ${Math.round(chamberC)}°C < ${f.minChamber}°C`);
    }
    if (f.directReq && !directDrive) {
      status = status === 'fail' ? 'fail' : 'warn';
      reasons.push('Direct-drive recommended');
    }
    if (f.vocReq && !vocFilter && enclosed) {
      status = status === 'fail' ? 'fail' : 'warn';
      reasons.push('Add Nevermore VOC filter');
    }
    return { id: f.id, status, reasons };
  });

  // Composite Engineering Score (0-100)
  const speedScore = clamp((effectivePrintSpeedMmS / 520) * 32, 0, 32);
  const accelScore = clamp((Math.log10(maxAccelMmS2 / 1000) / Math.log10(30)) * 22, 0, 22);
  const thermalScore = clamp(((maxNozzleC - 220) / 200) * 14 + (chamberC / 75) * 12, 0, 26);
  const reliabilityScore =
    (hasKlipper ? 5 : 0) +
    (hasInputShaper ? 5 : 0) +
    (hasLinearRails ? 4 : 0) +
    (vocFilter ? 3 : 0) +
    (directDrive ? 3 : 0);
  const penalty = collisions.length * 8 + warnings.filter((w) => w.severity === 'error').length * 7;
  const engineeringScore = Math.round(clamp(speedScore + accelScore + thermalScore + reliabilityScore - penalty, 10, 100));

  return {
    printerId: printer.id,
    printerName: printer.name,
    kinematics: printer.kinematics,
    xMassG: Math.round(xMassG),
    yMassG: Math.round(yMassG),
    zMassG: Math.round(zMassG),
    frameMassG: Math.round(frameMassG),
    customPartMassTotalG: Math.round(customPartMassTotalG),
    customToolheadMassG: Math.round(customToolheadMassG),
    customCantileverTorqueNmm: Number(customCantileverTorqueNmm.toFixed(1)),
    stiffness: Number(stiffness.toFixed(2)),
    freqX: Number(freqX.toFixed(1)),
    freqY: Number(freqY.toFixed(1)),
    shaperAlgo,
    maxFlowMm3s: Number(maxFlow.toFixed(1)),
    maxNozzleC: Math.round(maxNozzleC),
    maxBedC: Math.round(maxBedC),
    chamberC: Math.round(chamberC),
    coolingCfm: Number(coolingCfm.toFixed(1)),
    coolingPa: Math.round(coolingPa),
    voltage,
    directDrive,
    hasKlipper,
    hasInputShaper,
    hasLinearRails,
    enclosed,
    vocFilter,
    flowLimitMmS,
    coolingLimitMmS,
    motionLimitMmS,
    effectivePrintSpeedMmS,
    maxTravelSpeedMmS,
    maxAccelMmS2,
    bottleneck,
    benchySec,
    dcDrawW: Math.round(dcDrawW),
    psuWatts,
    psuHeadroomPct,
    noiseDba: Number(clamp(noiseDba, 31, 78).toFixed(1)),
    modCostUsd: Math.round(modCostUsd),
    totalCostUsd: Math.round(s.baseCostUsd + modCostUsd),
    maxDifficulty,
    multiMaterialLanes,
    toolchangeSec,
    engineeringScore,
    materialMatrix,
    warnings,
    collisions,
    resonanceCurve: generateResonanceSpectrum(freqX, freqY, stiffness, hasInputShaper),
    activeModCount: activeMods.length,
    customPartCount: customParts.length,
  };
}

// Main Public Evaluator: computes both Stock Baseline & Modded Build + Deltas!
export function evaluatePrinterBuild(printerOrId, activeModIds = [], customParts = [], options = {}) {
  const printer = typeof printerOrId === 'string'
    ? (PRINTER_BY_ID.get(printerOrId) || PRINTER_PLATFORMS[0])
    : printerOrId;

  const baseline = evaluateCore(printer, [], [], options);
  const current = evaluateCore(printer, activeModIds, customParts, options);

  const deltas = {
    xMassG: current.xMassG - baseline.xMassG,
    yMassG: current.yMassG - baseline.yMassG,
    freqX: Number((current.freqX - baseline.freqX).toFixed(1)),
    freqY: Number((current.freqY - baseline.freqY).toFixed(1)),
    maxFlowMm3s: Number((current.maxFlowMm3s - baseline.maxFlowMm3s).toFixed(1)),
    effectivePrintSpeedMmS: current.effectivePrintSpeedMmS - baseline.effectivePrintSpeedMmS,
    maxAccelMmS2: current.maxAccelMmS2 - baseline.maxAccelMmS2,
    benchySec: current.benchySec - baseline.benchySec,
    benchyPct: baseline.benchySec > 0 ? Math.round(((current.benchySec - baseline.benchySec) / baseline.benchySec) * 100) : 0,
    chamberC: current.chamberC - baseline.chamberC,
    noiseDba: Number((current.noiseDba - baseline.noiseDba).toFixed(1)),
    engineeringScore: current.engineeringScore - baseline.engineeringScore,
  };

  return { baseline, current, deltas };
}

export function formatDuration(sec) {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m ${String(r).padStart(2, '0')}s`;
}

// Generate tailored Klipper printer.cfg snippet based on active printer + mods + computed physics
export function generateKlipperConfig(printer, activeModIds, evalResult) {
  const cur = evalResult.current;
  const lines = [
    `# ==============================================================================`,
    `# 3dich Auto-Generated Klipper Configuration`,
    `# Base Platform : ${printer.name} (${printer.kinematics.toUpperCase()})`,
    `# Build Volume  : ${printer.buildVolume.x} x ${printer.buildVolume.y} x ${printer.buildVolume.z} mm`,
    `# Target Perf   : ${cur.effectivePrintSpeedMmS} mm/s | ${cur.maxAccelMmS2} mm/s^2 | ${cur.maxFlowMm3s} mm^3/s`,
    `# Est. 3DBenchy : ${formatDuration(cur.benchySec)} (Score ${cur.engineeringScore}/100)`,
    `# ==============================================================================`,
    ``,
    `[printer]`,
    `kinematics: ${printer.kinematics === 'corexy' ? 'corexy' : 'cartesian'}`,
    `max_velocity: ${cur.maxTravelSpeedMmS}`,
    `max_accel: ${cur.maxAccelMmS2}`,
    `max_z_velocity: ${activeModIds.includes('mot-belted-z') ? 35 : 15}`,
    `max_z_accel: ${activeModIds.includes('mot-belted-z') ? 500 : 200}`,
    `square_corner_velocity: ${cur.maxAccelMmS2 >= 15000 ? '10.0' : cur.maxAccelMmS2 >= 7000 ? '7.0' : '5.0'}`,
    ``,
    `[input_shaper]`,
    `shaper_type_x: ${cur.shaperAlgo.split(' ')[0].toLowerCase() === 'none' ? 'mzv' : cur.shaperAlgo.split(' ')[0].toLowerCase()}`,
    `shaper_freq_x: ${cur.freqX}`,
    `shaper_type_y: ${cur.shaperAlgo.split(' ')[0].toLowerCase() === 'none' ? 'mzv' : cur.shaperAlgo.split(' ')[0].toLowerCase()}`,
    `shaper_freq_y: ${cur.freqY}`,
    ``,
    `# --- Installed Mod Sections (${activeModIds.length}) ---`,
  ];

  for (const id of activeModIds) {
    const mod = MOD_BY_ID.get(id);
    if (mod?.klipper) {
      lines.push(``);
      lines.push(`# [${mod.name.en}]`);
      lines.push(mod.klipper);
    }
  }
  return lines.join('\n');
}
