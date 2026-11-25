// 3dich — Gemini API Multimodal Engineering Evaluator, 3D Concept/Studio Image Generator & Co-Pilot
// Works directly from GitHub Pages via verified CORS on generativelanguage.googleapis.com
// AND optionally via local Docker proxy (/api/gemini/proxy). Includes rich Offline Audit fallback.

import { MOD_BY_ID, MOD_CATALOG, MATERIAL_BY_ID } from './catalog.js';
import { computeCustomPartMassG, formatDuration } from './physics_engine.js';

export const GEMINI_TEXT_MODELS = [
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (Fast + Vision)' },
  { id: 'gemini-2.5-pro',   label: 'Gemini 2.5 Pro (Deep Engineering)' },
  { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash (Legacy Fast)' },
];

export const GEMINI_IMAGE_MODELS = [
  { id: 'gemini-2.5-flash-image',             label: 'Gemini 2.5 Flash Image (Nano Banana)' },
  { id: 'gemini-3-pro-image-preview',         label: 'Gemini 3 Pro Image (Ultra Studio)' },
  { id: 'gemini-2.0-flash-exp-image-generation', label: 'Gemini 2.0 Flash Image (Compat)' },
];

export const RENDER_STYLES = [
  {
    id: 'studio',
    name: { tr: 'Endüstriyel Ürün Stüdyosu', en: 'Industrial Product Studio' },
    prompt: 'Photorealistic Apple/Bambu Lab industrial product photography of this exact customized 3D printer, matte anodized aluminum extrusions, soft overhead diffused softbox studio lighting, crisp machined steel linear rails, subtle floor reflection, 85mm lens f/4, ultra clean neutral slate studio backdrop, sharp focus.',
  },
  {
    id: 'cad-exploded',
    name: { tr: 'Teknik CAD Kesit İllüstrasyonu', en: 'Technical CAD Cutaway Drawing' },
    prompt: 'High-precision isometric industrial CAD technical cutaway illustration of this customized 3D printer assembly, clean architectural drafting shading, translucent exploded callout view showing the custom mounted parts, hotend meltzone, and motion rails on crisp alabaster engineering paper.',
  },
  {
    id: 'workshop',
    name: { tr: 'Maker Atölyesi Hero Çekimi', en: 'Maker Workshop Hero Shot' },
    prompt: 'Editorial documentary photograph of this exact modified 3D printer sitting on a precision oak and steel engineering workbench, warm tungsten key light, digital calipers and spools of filament subtly out of focus in background, realistic FDM 3D printed texture on custom brackets, 50mm f/2.8.',
  },
  {
    id: 'cfd-thermal',
    name: { tr: 'CFD Hava Akışı & Termal Görselleştirme', en: 'CFD Airflow & Thermal Visualization' },
    prompt: 'Scientific engineering CFD and thermal visualization overlaid on this exact 3D printer: luminous cyan-blue laminar part-cooling airflow streamlines sweeping from the cooling ducts across the nozzle tip, glowing orange-amber thermal heat map on the hotend and heated bed, crisp dark engineering studio aesthetic.',
  },
  {
    id: 'concept-part',
    name: { tr: 'Yeni 3D Parça Konsepti (SolidCraft Öncesi)', en: 'New 3D Mod Part Concept (Pre-SolidCraft)' },
    prompt: 'Isolated photorealistic 3D CAD concept render of a functional 3D-printable mechanical mod part for a 3D printer, designed for FDM printing in matte carbon-fiber nylon and orange PETG accents, clear M3 bolt bosses, reinforcing ribs, and chamfers, studio lighting on neutral drafting backdrop.',
  },
  {
    id: 'custom',
    name: { tr: 'Serbest Özel Prompt', en: 'Custom Freeform Prompt' },
    prompt: '',
  },
];

function stripDataUrl(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  const idx = dataUrl.indexOf(',');
  if (idx < 0) return null;
  const head = dataUrl.slice(0, idx);
  const m = /data:([^;]+);base64/.exec(head);
  return {
    mimeType: m ? m[1] : 'image/png',
    data: dataUrl.slice(idx + 1),
  };
}

export function buildEngineeringDossier(printer, activeModIds, customParts, evalResult) {
  const cur = evalResult.current;
  const base = evalResult.baseline;
  const mods = activeModIds.map((id) => {
    const m = MOD_BY_ID.get(id);
    return m ? { id: m.id, name: m.name.en, category: m.category, summary: m.summary.en } : { id };
  });
  const parts = customParts.map((p) => {
    const mat = MATERIAL_BY_ID.get(p.materialId || 'petg');
    return {
      name: p.name,
      source: p.source || 'SolidCraft CAD',
      material: mat ? `${mat.name} (HDT ${mat.maxTemp}C)` : p.materialId,
      infillPct: p.infillPct ?? 35,
      volumeCm3: p.volumeCm3,
      massG: Math.round(computeCustomPartMassG(p)),
      dimensionsMm: p.sizeMm,
      overhangPct: p.overhangPct ?? 0,
      attachmentZone: p.zone,
      positionMm: p.pos,
      rotationDeg: p.rot,
      scale: p.scale,
    };
  });
  return {
    platform: {
      name: printer.name,
      kinematics: printer.kinematics,
      buildVolumeMm: printer.buildVolume,
    },
    installedMods: mods,
    customSolidCraftParts: parts,
    telemetry: {
      xMovingMassG: `${cur.xMassG}g (stock ${base.xMassG}g)`,
      yMovingMassG: `${cur.yMassG}g (stock ${base.yMassG}g)`,
      resonanceHz: { x: cur.freqX, y: cur.freqY, stockX: base.freqX, stockY: base.freqY },
      maxAccelMmS2: `${cur.maxAccelMmS2} (stock ${base.maxAccelMmS2})`,
      maxVolumetricFlowMm3s: `${cur.maxFlowMm3s} (stock ${base.maxFlowMm3s})`,
      speedLimitsMmS: {
        flow: cur.flowLimitMmS,
        cooling: cur.coolingLimitMmS,
        motion: cur.motionLimitMmS,
        effective: cur.effectivePrintSpeedMmS,
      },
      bottleneck: cur.bottleneck,
      estimatedBenchy: `${formatDuration(cur.benchySec)} (stock ${formatDuration(base.benchySec)})`,
      thermal: { maxNozzleC: cur.maxNozzleC, maxBedC: cur.maxBedC, chamberC: cur.chamberC, enclosed: cur.enclosed, vocFilter: cur.vocFilter },
      power: { dcDrawW: cur.dcDrawW, psuWatts: cur.psuWatts, headroomPct: cur.psuHeadroomPct },
      noiseDba: cur.noiseDba,
      totalCostUsd: cur.totalCostUsd,
      engineeringScore: cur.engineeringScore,
      warnings: cur.warnings.map((w) => w.en),
      collisions: cur.collisions.map((c) => c.en),
    },
  };
}

export async function callGeminiAPI({ apiKey, model, payload, useProxy = false, fetchFn = fetch }) {
  const cleanKey = (apiKey || '').trim();
  if (!useProxy && !cleanKey) {
    throw new Error('MISSING_API_KEY');
  }
  const url = useProxy
    ? `/api/gemini/proxy?model=${encodeURIComponent(model)}`
    : `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const headers = { 'Content-Type': 'application/json' };
  if (cleanKey) headers['x-goog-api-key'] = cleanKey;

  const res = await fetchFn(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    let errText = `HTTP ${res.status}`;
    try {
      const errJson = await res.json();
      errText = errJson?.error?.message || JSON.stringify(errJson).slice(0, 240);
    } catch {
      errText = (await res.text()).slice(0, 240) || errText;
    }
    throw new Error(`Gemini API Error (${res.status}): ${errText}`);
  }
  return await res.json();
}

export function extractTextAndImages(apiJson) {
  const parts = apiJson?.candidates?.[0]?.content?.parts || [];
  let text = '';
  const images = [];
  for (const part of parts) {
    if (part.text) text += (text ? '\n' : '') + part.text;
    const inline = part.inlineData || part.inline_data;
    if (inline && inline.data) {
      const mime = inline.mimeType || inline.mime_type || 'image/png';
      images.push(`data:${mime};base64,${inline.data}`);
    }
  }
  return { text: text.trim(), images };
}

// Parse clickable [[mod:mod-id]] tags returned by Gemini or Offline Advisor
export function extractRecommendedModIds(text) {
  const found = [];
  const seen = new Set();
  const re = /\[\[mod:([a-z0-9-]+)\]\]/gi;
  let m;
  while ((m = re.exec(text || '')) !== null) {
    const id = m[1].toLowerCase();
    if (MOD_BY_ID.has(id) && !seen.has(id)) {
      seen.add(id);
      found.push(id);
    }
  }
  return found;
}

export function buildEvaluationPayload({ lang, printer, activeModIds, customParts, evalResult, snapshotDataUrl }) {
  const dossier = buildEngineeringDossier(printer, activeModIds, customParts, evalResult);
  const availableIds = MOD_CATALOG.filter((m) => !activeModIds.includes(m.id))
    .slice(0, 35)
    .map((m) => `${m.id} (${m.name.en})`)
    .join(', ');

  const langInstr = lang === 'tr'
    ? 'Respond in crisp, authoritative Turkish (Türkçe) using Principal Mechanical/Mechatronics Engineer tone.'
    : 'Respond in crisp, authoritative English using Principal Mechanical/Mechatronics Engineer tone.';

  const prompt = `${langInstr}
You are the chief 3D printer engineering evaluator inside "3dich".
Analyze BOTH the attached 3D viewport render of the user's customized 3D printer AND the complete physical telemetry dossier below.

Pay SPECIAL attention to any user-imported SolidCraft CAD parts (customSolidCraftParts):
1. Evaluate their real physical impact: moving inertia, resonant frequency shift, cantilever torque, potential airflow blockage, thermal/HDT deformation risk near the hotend or heated chamber, and optimal FDM print orientation + material choice!
2. Diagnose the primary system bottleneck (Hotend Flow vs. Part Cooling vs. Motion/Kinematics vs. Thermal/PSU).
3. Recommend up to 3 highest-ROI upgrades from the available catalog. Whenever you recommend an upgrade from the catalog, ALWAYS cite its exact tag like [[mod:hotend-rapido-uhf]] so the app can create 1-click install buttons!
4. Provide concrete Klipper tuning targets (max_accel, square_corner_velocity, shaper_type, pressure_advance).

Structure your response cleanly with short headings:
### 1. Executive Verdict
### 2. Custom SolidCraft Parts & Mounting Audit
### 3. Bottleneck & Thermal/Acoustic Diagnostics
### 4. Top 3 High-ROI Next Upgrades
### 5. Klipper Tuning & Safety Notes

Available uninstalled mod IDs: ${availableIds}

ENGINEERING DOSSIER (JSON):
${JSON.stringify(dossier, null, 2)}`;

  const parts = [{ text: prompt }];
  const img = stripDataUrl(snapshotDataUrl);
  if (img) {
    parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
  }
  return {
    contents: [{ role: 'user', parts }],
    generationConfig: { temperature: 0.35, maxOutputTokens: 1400 },
  };
}

export async function evaluateBuildWithGemini(opts) {
  const payload = buildEvaluationPayload(opts);
  const json = await callGeminiAPI({
    apiKey: opts.apiKey,
    model: opts.model || 'gemini-2.5-flash',
    payload,
    useProxy: opts.useProxy,
    fetchFn: opts.fetchFn,
  });
  const { text } = extractTextAndImages(json);
  return {
    source: 'gemini',
    model: opts.model || 'gemini-2.5-flash',
    markdown: text || 'No response text received.',
    recommendedMods: extractRecommendedModIds(text),
  };
}

export function buildImageGenPayload({ styleId, customPrompt, printer, activeModIds, customParts, snapshotDataUrl }) {
  const style = RENDER_STYLES.find((s) => s.id === styleId) || RENDER_STYLES[0];
  const modNames = activeModIds.slice(0, 12).map((id) => MOD_BY_ID.get(id)?.name.en).filter(Boolean).join(', ');
  const customNames = customParts.map((p) => `${p.name} (${p.zone})`).join(', ');

  let prompt;
  if (styleId === 'concept-part') {
    prompt = `${style.prompt}\nSpecific mechanical part brief: ${customPrompt || 'Lightweight dual-5015 toolhead cooling duct bracket for Voron/CoreXY 3D printer with M3 heat-set insert bosses and chamfered airflow channels'}. Target printer: ${printer.name}.`;
  } else {
    const baseStyle = styleId === 'custom' ? (customPrompt || RENDER_STYLES[0].prompt) : style.prompt;
    prompt = `${baseStyle}
Subject details: ${printer.name} (${printer.kinematics.toUpperCase()} 3D printer).
Key visible upgrades: ${modNames || 'Stock precision configuration'}.
Custom CAD mounted parts: ${customNames || 'None'}.
${customPrompt && styleId !== 'custom' ? `Extra user direction: ${customPrompt}` : ''}
Preserve the overall proportions, color scheme, and placement of mounted parts shown in the reference viewport render. Do not add watermarks or random text labels.`;
  }

  const parts = [{ text: prompt }];
  if (styleId !== 'concept-part') {
    const img = stripDataUrl(snapshotDataUrl);
    if (img) {
      parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
    }
  }

  return {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE'],
    },
  };
}

export async function generate3DRenderWithGemini(opts) {
  const payload = buildImageGenPayload(opts);
  const json = await callGeminiAPI({
    apiKey: opts.apiKey,
    model: opts.imageModel || 'gemini-2.5-flash-image',
    payload,
    useProxy: opts.useProxy,
    fetchFn: opts.fetchFn,
  });
  const { text, images } = extractTextAndImages(json);
  if (images.length === 0) {
    throw new Error(text ? `Model returned text only (no image): ${text.slice(0, 180)}` : 'No image returned by Gemini model.');
  }
  return {
    imageDataUrl: images[0],
    caption: text,
    model: opts.imageModel || 'gemini-2.5-flash-image',
    styleId: opts.styleId,
  };
}

export async function chatWithEngineer({ apiKey, model, lang, history = [], message, printer, activeModIds, customParts, evalResult, snapshotDataUrl, useProxy = false, fetchFn = fetch }) {
  const dossier = buildEngineeringDossier(printer, activeModIds, customParts, evalResult);
  const sysText = `You are 3dich's embedded Principal 3D Printer & CAD Engineer. Language: ${lang === 'tr' ? 'Turkish' : 'English'}.
Current printer live state: ${JSON.stringify(dossier)}.
Keep answers practical, physics-backed, concise, and when recommending any catalog mod include [[mod:<id>]].`;

  const contents = [];
  for (const h of history.slice(-6)) {
    contents.push({ role: h.role === 'assistant' ? 'model' : 'user', parts: [{ text: h.text }] });
  }
  const userParts = [{ text: message }];
  const img = stripDataUrl(snapshotDataUrl);
  if (img && history.length === 0) {
    userParts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
  }
  contents.push({ role: 'user', parts: userParts });

  const payload = {
    systemInstruction: { parts: [{ text: sysText }] },
    contents,
    generationConfig: { temperature: 0.45, maxOutputTokens: 900 },
  };
  const json = await callGeminiAPI({ apiKey, model: model || 'gemini-2.5-flash', payload, useProxy, fetchFn });
  const { text } = extractTextAndImages(json);
  return {
    text: text || '...',
    recommendedMods: extractRecommendedModIds(text),
  };
}

// Rich Deterministic Offline Principal Engineer Audit (Zero-latency fallback when no API key is configured!)
export function buildOfflineEngineeringAudit(printer, activeModIds, customParts, evalResult, lang = 'tr') {
  const cur = evalResult.current;
  const del = evalResult.deltas;
  const active = new Set(activeModIds);
  const recs = [];

  if (cur.bottleneck === 'hotend' && !active.has('hotend-rapido-uhf')) recs.push('hotend-rapido-uhf');
  if (cur.bottleneck === 'cooling' && !active.has('cool-cpap-turbo')) recs.push('cool-cpap-turbo');
  if (cur.bottleneck === 'motion' && !active.has('mot-carbon-x-beam')) recs.push('mot-carbon-x-beam');
  if (!cur.hasKlipper && !active.has('elec-klipper-sbc')) recs.push('elec-klipper-sbc');
  if (!cur.hasInputShaper && !active.has('probe-adxl345')) recs.push('probe-adxl345');
  if (cur.enclosed && !cur.vocFilter && !active.has('enc-nevermore-v6')) recs.push('enc-nevermore-v6');
  if (!cur.enclosed && !active.has('enc-polycarb-panels')) recs.push('enc-polycarb-panels');
  if (!active.has('probe-beacon-eddy') && recs.length < 3) recs.push('probe-beacon-eddy');
  const topRecs = recs.slice(0, 3);

  const recLines = topRecs.map((id) => {
    const m = MOD_BY_ID.get(id);
    return `- **${m.name[lang] || m.name.en}** — ${m.summary[lang] || m.summary.en} [[mod:${id}]]`;
  }).join('\n');

  const partsAudit = customParts.length === 0
    ? (lang === 'tr'
      ? 'Henüz SolidCraft / STL özel parça eklenmedi. Sol panelden bir demo SolidCraft parçası veya kendi `.stl` / `.3mf` / `.obj` / `.sc` dosyanı içe aktarıp hardpoint’e oturtabilirsin.'
      : 'No custom SolidCraft / STL parts mounted yet. Import a demo SolidCraft bracket or drop your own `.stl` / `.3mf` / `.obj` / `.sc` file to audit inertia, thermal risk, and collisions.')
    : customParts.map((p) => {
        const mass = Math.round(computeCustomPartMassG(p));
        const mat = MATERIAL_BY_ID.get(p.materialId || 'petg');
        if (lang === 'tr') {
          return `- **${p.name}** (${p.zone}, ${mass}g, ${mat?.name || p.materialId}): ${p.zone === 'toolhead' ? `Hareketli kütleye +${mass}g ekliyor (X rezonans ${cur.freqX} Hz). %${p.overhangPct || 0} sarkma tespit edildi.` : `Statik bölgeye bağlı — X/Y ivme kaybı sıfır.`}`;
        }
        return `- **${p.name}** (${p.zone}, ${mass}g, ${mat?.name || p.materialId}): ${p.zone === 'toolhead' ? `Adds +${mass}g to moving mass (X resonance ${cur.freqX} Hz). Overhang ratio ${p.overhangPct || 0}%.` : `Mounted to static structure — zero X/Y inertia penalty.`}`;
      }).join('\n');

  const warnBlock = [...cur.collisions, ...cur.warnings]
    .map((w) => `- ${w[lang] || w.en}`)
    .join('\n');

  if (lang === 'tr') {
    return {
      source: 'offline',
      model: '3dich Physics Solver (Offline)',
      recommendedMods: topRecs,
      markdown: `### 1. Yönetici Mühendislik Özeti
**${printer.name}** yapılandırman **${cur.engineeringScore}/100** mühendislik puanı aldı. Tahmini 3DBenchy süresi **${formatDuration(cur.benchySec)}** (${del.benchyPct <= 0 ? del.benchyPct : '+' + del.benchyPct}% stok farkı). Etkili baskı hızı **${cur.effectivePrintSpeedMmS} mm/s**, temiz ivme **${cur.maxAccelMmS2} mm/s²** (${cur.shaperAlgo}).

### 2. SolidCraft Özel Parça Analizi
${partsAudit}

### 3. Darboğaz & Termal/Güç Teşhisi
- **Birincil Darboğaz:** \`${cur.bottleneck.toUpperCase()}\` (Akış: ${cur.flowLimitMmS} mm/s • Soğutma: ${cur.coolingLimitMmS} mm/s • Hareket: ${cur.motionLimitMmS} mm/s)
- **Termal Zarf:** Nozul ${cur.maxNozzleC}°C • Tabla ${cur.maxBedC}°C • Kabin ${cur.chamberC}°C • Gürültü ${cur.noiseDba} dBA
- **Güç Payı:** ${cur.dcDrawW}W / ${cur.psuWatts}W PSU (%${cur.psuHeadroomPct} boşluk)
${warnBlock ? `\n**Aktif Uyarılar & Çakışmalar:**\n${warnBlock}` : '\n- Çakışma veya kritik termal/güç ihlali tespit edilmedi.'}

### 4. En Yüksek Yatırım Getirili Sonraki 3 Mod
${recLines || '- Yapılandırman tüm ana alt sistemlerde dengeli görünüyor!'}

> *Daha derin görsel-mekanik analiz (3D ekran görüntüsü ile hava akışı & montaj denetimi) ve fotogerçekçi 3D stüdyo renderları için üstten Gemini API anahtarını gir.*`,
    };
  }

  return {
    source: 'offline',
    model: '3dich Physics Solver (Offline)',
    recommendedMods: topRecs,
    markdown: `### 1. Executive Engineering Summary
Your **${printer.name}** build scores **${cur.engineeringScore}/100**. Estimated 3DBenchy drops to **${formatDuration(cur.benchySec)}** (${del.benchyPct <= 0 ? del.benchyPct : '+' + del.benchyPct}% vs stock), reaching **${cur.effectivePrintSpeedMmS} mm/s** sustained print speed at **${cur.maxAccelMmS2} mm/s²** (${cur.shaperAlgo}).

### 2. Custom SolidCraft Parts Audit
${partsAudit}

### 3. Bottleneck & Thermal/Power Diagnostics
- **Primary Bottleneck:** \`${cur.bottleneck.toUpperCase()}\` (Flow: ${cur.flowLimitMmS} mm/s • Cooling: ${cur.coolingLimitMmS} mm/s • Motion: ${cur.motionLimitMmS} mm/s)
- **Thermal Envelope:** Nozzle ${cur.maxNozzleC}°C • Bed ${cur.maxBedC}°C • Chamber ${cur.chamberC}°C • Acoustic ${cur.noiseDba} dBA
- **PSU Budget:** ${cur.dcDrawW}W / ${cur.psuWatts}W (${cur.psuHeadroomPct}% headroom)
${warnBlock ? `\n**Active Warnings & Collisions:**\n${warnBlock}` : '\n- Zero physical collisions or critical thermal/PSU faults detected.'}

### 4. Top 3 Highest-ROI Next Upgrades
${recLines || '- Your build is well balanced across hotend, cooling, and kinematics!'}

> *Plug in a Gemini API key above to unlock Multimodal 3D Vision Audits and Photorealistic Gemini 3D Studio Renders.*`,
  };
}
