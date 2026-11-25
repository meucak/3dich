// 3dich — SolidCraft MCP Prompt / JSON Batch Generator, Maker Inspiration Lab & Local Kasa Bridge

import { MOUNT_HARDPOINTS, getHardpointPose } from './catalog.js';

// Curated Maker & Engineer DIY SolidCraft Project Blueprints ("What Can I Design Next?")
export const MAKER_SOLIDCRAFT_IDEAS = [
  {
    id: 'idea-dual5015',
    hardpoint: 'toolhead-front',
    material: 'asa',
    name: { tr: 'CFD Çift-5015 Salınımlı Soğutma Kanalı', en: 'CFD Dual-5015 Swept Cooling Duct' },
    dims: '56 × 40 × 34 mm',
    benefit: { tr: 'Sarkmalarda %40 daha temiz köprüleme + nozul görüş açısı', en: '40% cleaner overhangs + unobstructed nozzle sightline' },
    prompt: 'Design a lightweight symmetric dual-5015 blower fan duct bracket with a 26x26mm M3 mounting pattern, 3mm wall thickness, 2mm fillets, and twin 35-degree downward air nozzles aimed 4mm below Z=0.',
  },
  {
    id: 'idea-beacon-mount',
    hardpoint: 'x-carriage',
    material: 'pacf',
    name: { tr: 'Sıfır-Sapma Eddy / Beacon Prob Braketi', en: 'Zero-Flex Eddy / Beacon Probe Bracket' },
    dims: '34 × 24 × 18 mm',
    benefit: { tr: 'Termal kaymasız 2.5sn hızlı mesh + 6g tüy siklet tasarım', en: 'Zero thermal drift 2.5s bed mesh + 6g ultralight bracket' },
    prompt: 'Model a stiff L-shaped eddy current probe bracket for MGN12H 20x20mm M3 carriage holes, putting the sensor PCB face parallel to XY at Z=-14mm with two M2.5 heat-set insert bosses and 4mm triangular gussets.',
  },
  {
    id: 'idea-kizak-spool',
    hardpoint: 'frame-right-post',
    material: 'petg',
    name: { tr: 'Kırlangıç Kızaklı (KIZAK_STD_V1) Rulmanlı Makara', en: 'Quick-Release Dovetail Bearing Spool Arm' },
    dims: '28 × 98 × 64 mm',
    benefit: { tr: 'Tek hareketle tak-çıkar kırlangıç kızak + 608ZZ rulman yuvası', en: 'Toolless dovetail slide-on mount + dual 608ZZ bearing seats' },
    prompt: 'Build a 2020 extrusion quick-release spool arm featuring a 45-degree dovetail rail (20mm->12mm x 4mm depth with 2mm end stop), 22mm OD 608ZZ bearing seats, and 45-degree load ribs.',
  },
  {
    id: 'idea-nozzle-cam',
    hardpoint: 'toolhead-side',
    material: 'asa',
    name: { tr: 'OV5648 Makro Nozul Kamera & LED Kol', en: 'OV5648 Macro Nozzle-Cam & LED Arm' },
    dims: '32 × 28 × 24 mm',
    benefit: { tr: 'Nozul ucuna 28° açılı makro timelapse & spagetti izleme', en: '28-deg aimed macro nozzle timelapse & AI failure monitor' },
    prompt: 'Create a compact 18mm two-bolt M3 side toolhead arm holding a 16x16mm OV5648 camera PCB angled 28 degrees toward the nozzle tip with a 3.5mm cable relief channel.',
  },
  {
    id: 'idea-cpap-manifold',
    hardpoint: 'toolhead-front',
    material: 'pacf',
    name: { tr: 'CPAP 15mm Hortum Halka Manifold', en: 'CPAP 15mm Hose Ring Air Manifold' },
    dims: '46 × 42 × 26 mm',
    benefit: { tr: '360° eşit hava dağılımı • Toplam ağırlık <18g', en: '360-deg omnidirectional nozzle cooling under 18g' },
    prompt: 'Design a compact toroidal CPAP cooling manifold with a 15.2mm top hose barb inlet splitting smoothly into a 360-degree annular ring with 6 angled 3mm exit jets around a 14mm central nozzle clearance bore.',
  },
  {
    id: 'idea-klipper-bezel',
    hardpoint: 'frame-front-bot',
    material: 'petg',
    name: { tr: '45° 5" KlipperScreen Kapaklı Çerçeve', en: '45° 5-Inch KlipperScreen Hinged Bezel' },
    dims: '138 × 88 × 28 mm',
    benefit: { tr: 'Ön 2020 profile gömülü ergonomik dokunmatik HMI konsolu', en: 'Ergonomic 45-deg flush HMI console for 2020 front extrusion' },
    prompt: 'Model a 45-degree tilted enclosure bezel for a 121x76mm 5-inch DSI touchscreen with M5 2020 T-slot mounting tabs, rear ribbon cable cutout, and 3mm chamfered front frame.',
  },
  {
    id: 'idea-purge-chute',
    hardpoint: 'frame-rear',
    material: 'abs',
    name: { tr: 'Manyetik Çıkarılabilir Atık & Pirinç Fırça Kutusu', en: 'Magnetic Purge Poop Chute & Brass Brush Dock' },
    dims: '74 × 42 × 36 mm',
    benefit: { tr: 'Otomatik nozul temizliği + tek elle boşaltılan mıknatıslı hazne', en: 'Automated nozzle scrub + one-hand magnetic waste bin' },
    prompt: 'Build a rear-mounted purge bucket with a 38x10x8mm brass brush slot, a 45-degree sloped waste chute, and four 6x3mm neodymium magnet pockets for quick removal.',
  },
  {
    id: 'idea-laser-quickswap',
    hardpoint: 'toolhead-front',
    material: 'alu',
    name: { tr: 'Kinematik Bilyalı Lazer / Plotter Adaptörü', en: 'Maxwell Kinematic Ball Quick-Swap Mount' },
    dims: '44 × 44 × 14 mm',
    benefit: { tr: '±0.02mm tekrarlanabilirlikle 5sn’de lazer/kalem değişimi', en: '±0.02mm repeatability 5-second laser/plotter tool swap' },
    prompt: 'Design a Maxwell 3-vee kinematic quick-swap coupling plate (44x44x14mm) with three 120-degree radial V-grooves for 6mm dowel pins and a central 12x4mm magnet pocket.',
  },
  {
    id: 'idea-canbus-strain',
    hardpoint: 'toolhead-top',
    material: 'tpu',
    name: { tr: 'CANbus Umbilical Esnek Gerilim Giderici', en: 'CANbus Umbilical Flexible Strain Relief' },
    dims: '28 × 32 × 42 mm',
    benefit: { tr: 'Kablo kopmalarını sıfırlar • PTFE + 4-pin kablo kılavuzu', en: 'Prevents umbilical wire fatigue • Guides PTFE + 4-pin cable' },
    prompt: 'Model an S-curved flexible umbilical strain relief clamp for EBB36 with a 4.2mm PTFE pass-through, 6.5mm CAN cable clamp, and two M3 mounting ears spaced 24mm apart.',
  },
  {
    id: 'idea-gantry-gusset',
    hardpoint: 'frame-top-front',
    material: 'alu',
    name: { tr: 'CNC 45° 2020 Ekstrüzyon Köşe Takviyesi', en: 'CNC 45° 2020 Extrusion Corner Gusset' },
    dims: '60 × 60 × 18 mm',
    benefit: { tr: 'Gantry burulma sertliğinde +%18 artış • Yüksek Z netliği', en: '+18% frame torsional stiffness • Cleaner tall prints' },
    prompt: 'Create a heavy-duty 60x60x18mm triangular 2020 extrusion corner gusset with four M5 counterbored mounting slots, 2mm alignment tabs for 6mm T-slots, and weight-saving triangular pockets.',
  },
];

// Generate copy-ready SolidCraft MCP Natural-Language Prompt + Direct MCP Command Snippet
export function buildSolidCraftMCPSpec(printer, hardpointId, partBrief = '') {
  const hp = MOUNT_HARDPOINTS.find((h) => h.id === hardpointId) || MOUNT_HARDPOINTS[0];
  const pose = getHardpointPose(printer, hp.id);
  const safeSlug = `3dich_${printer.id}_${hp.id}`.replace(/[^a-z0-9_]/gi, '_');

  const mcpPrompt = `Draw a precision 3D printer mod part in SolidCraft using MCP:
- Target Printer: ${printer.name} (${printer.kinematics.toUpperCase()}, ${printer.buildVolume.x}×${printer.buildVolume.y}×${printer.buildVolume.z} mm)
- Mounting Hardpoint: ${hp.label.en} (Kinematic Zone: ${hp.zone})
- Required Bolt / Interface Pattern: ${hp.boltPattern}
- Safe Bounding Envelope: keep protrusion <= ${hp.clearanceMm} mm around origin [0, 0, 0]
- Design Brief: ${partBrief || 'Lightweight structural mounting bracket with M3 clearance holes (3.3mm), chamfered ribs, and zero overhanging bridges > 45 deg.'}
- After verifying volume & bounding box with measure {}, export STL directly for 3dich:
  file.export {"path": "${safeSlug}.stl"}`;

  const mcpExportBatch = JSON.stringify([
    { command: 'measure', params: { summary: true } },
    { command: 'file.export', params: { path: `${safeSlug}.stl` } },
  ], null, 2);

  return {
    hardpoint: hp,
    pose,
    fileName: `${safeSlug}.stl`,
    mcpPrompt,
    mcpExportBatch,
  };
}

// Fetch optional local Kasa SolidCraft/Depo STL library (gracefully returns [] on GitHub Pages)
export async function fetchLocalSolidCraftLibrary() {
  try {
    const res = await fetch('/api/solidcraft-library', { signal: AbortSignal.timeout(2500) });
    if (!res.ok) return { available: false, files: [] };
    const data = await res.json();
    return { available: true, files: data.files || [] };
  } catch {
    return { available: false, files: [] };
  }
}
