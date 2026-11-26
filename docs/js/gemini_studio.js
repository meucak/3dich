// 3dich — Latest 2026 Gemini API + Live Model Discovery + Zero-Trust AGY Kasa / AGY Toshi Bridge Client
// Supports:
//   1) Gemini API (Google AI Studio — Gemini 4, Gemini 3.8/3.5/3 Pro, Imagen 4, Gemini 3.1/3 Image) + Live ListModels
//   2) AGY Kasa (Zero-Trust Bearer Token + Tailscale/Loopback IP-Restricted Hardened Bridge)
//   3) AGY Toshi (Zero-Trust Bearer Token + Tailscale/Loopback IP-Restricted Hardened Bridge)
//   4) Instant Deterministic Offline Principal Engineer Audit Fallback

import { MOD_BY_ID, MOD_CATALOG, MATERIAL_BY_ID } from './catalog.js';
import { computeCustomPartMassG, formatDuration } from './physics_engine.js';

export const AI_PROVIDERS = [
  { id: 'gemini',    label: { tr: 'Gemini API (Google AI Studio)', en: 'Gemini API (Google AI Studio)' } },
  { id: 'agy-kasa',  label: { tr: 'Antigravity — AGY Kasa (Güvenli Köprü)', en: 'Antigravity — AGY Kasa (Secure Bridge)' } },
  { id: 'agy-toshi', label: { tr: 'Antigravity — AGY Toshi (Güvenli Köprü)', en: 'Antigravity — AGY Toshi (Secure Bridge)' } },
];

// Latest 2026 Active Gemini Text/Multimodal Models (plus auto-discovery via ListModels!)
export const GEMINI_TEXT_MODELS = [
  { id: 'gemini-3.8-flash',    label: 'Gemini 3.8 Flash (2026 Default • Fast + Vision)' },
  { id: 'gemini-4-carbon',     label: 'Gemini 4 Carbon (Frontier Engineering)' },
  { id: 'gemini-4-argon',      label: 'Gemini 4 Argon (Balanced Frontier)' },
  { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite (Ultra Fast)' },
  { id: 'gemini-3-pro-preview',label: 'Gemini 3 Pro Preview (Deep Reasoning)' },
  { id: 'gemini-2.5-flash',    label: 'Gemini 2.5 Flash (Compat / Auto-Route)' },
  { id: 'gemini-2.5-pro',      label: 'Gemini 2.5 Pro (Compat / Auto-Route)' },
];

// Latest 2026 Active Gemini & Imagen 4 Image Generation Models
export const GEMINI_IMAGE_MODELS = [
  { id: 'gemini-3.1-flash-image',    label: 'Gemini 3.1 Flash Image (2026 Native 3D)' },
  { id: 'gemini-3-pro-image',        label: 'Gemini 3 Pro Image (Ultra Studio)' },
  { id: 'gemini-3-pro-image-preview',label: 'Gemini 3 Pro Image Preview' },
  { id: 'imagen-4.0-generate-001',   label: 'Imagen 4 (Photorealistic Studio)' },
  { id: 'gemini-2.5-flash-image',    label: 'Gemini 2.5 Flash Image (Compat)' },
];

// Verified Antigravity CLI Models (`agy models` on Kasa & Toshi)
export const AGY_MODELS = [
  { id: 'gemini-4-neon-high',   label: 'Gemini 4 Neon (High)' },
  { id: 'gemini-4-neon-xhigh',  label: 'Gemini 4 Neon (XHigh)' },
  { id: 'gemini-4-carbon-high', label: 'Gemini 4 Carbon (High)' },
  { id: 'gemini-3.8-flash-high',label: 'Gemini 3.8 Flash (High)' },
  { id: 'claude-opus-5-5-high', label: 'Claude Opus 5.5 (High)' },
  { id: 'claude-sonnet-5-5-high', label: 'Claude Sonnet 5.5 (High)' },
  { id: 'gpt-oss-120b-medium',  label: 'GPT-OSS 120B (Medium)' },
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
      vendor: printer.vendor || 'Custom',
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

// Live Model Discovery: queries Google AI Studio for EVERY active model supported by the user's API key!
export async function fetchLiveGeminiModels(apiKey, fetchFn = fetch) {
  const cleanKey = (apiKey || '').trim();
  if (!cleanKey) throw new Error('MISSING_API_KEY');
  const res = await fetchFn('https://generativelanguage.googleapis.com/v1beta/models?pageSize=100', {
    method: 'GET',
    headers: { 'x-goog-api-key': cleanKey },
  });
  if (!res.ok) {
    throw new Error(`ListModels HTTP ${res.status}`);
  }
  const data = await res.json();
  const textModels = [];
  const imageModels = [];
  for (const m of data.models || []) {
    const id = String(m.name || '').replace(/^models\//, '');
    const methods = m.supportedGenerationMethods || [];
    const label = m.displayName ? `${m.displayName} (${id})` : id;
    if (/imagen/i.test(id) && (methods.includes('predict') || methods.includes('generateImages'))) {
      imageModels.push({ id, label });
    } else if (/image/i.test(id) && methods.includes('generateContent')) {
      imageModels.push({ id, label });
    } else if (/^gemini-/i.test(id) && !/embedding|aqa|tts|audio|live|veo|1\.0|1\.5|2\.0-flash-exp/i.test(id) && methods.includes('generateContent')) {
      textModels.push({ id, label });
    }
  }
  // Sort newest generation first (gemini-4 -> gemini-3 -> gemini-2.5)
  const rank = (s) => {
    const m = /gemini-(\d+(?:\.\d+)?)/i.exec(s);
    if (m) return parseFloat(m[1]) * 10 + (/pro|carbon/i.test(s) ? 2 : 1);
    if (/imagen-4/i.test(s)) return 45;
    return 0;
  };
  textModels.sort((a, b) => rank(b.id) - rank(a.id));
  imageModels.sort((a, b) => rank(b.id) - rank(a.id));
  return { textModels, imageModels };
}

export async function callGeminiAPI({ apiKey, model, payload, action = 'generateContent', useProxy = false, fetchFn = fetch }) {
  const cleanKey = (apiKey || '').trim();
  if (!useProxy && !cleanKey) {
    throw new Error('MISSING_API_KEY');
  }
  const url = useProxy
    ? `/api/gemini/proxy?model=${encodeURIComponent(model)}&action=${encodeURIComponent(action)}`
    : `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:${action}`;

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
    const err = new Error(`Gemini API Error (${res.status}): ${errText}`);
    err.status = res.status;
    throw err;
  }
  return await res.json();
}

// Zero-Trust Antigravity Bridge URL resolution (uses Kasa server proxy when hosted locally, or direct loopback/Tailscale URL!)
export function resolveAgyEndpoint(target, customUrl = '') {
  const manual = (customUrl || '').trim().replace(/\/+$/, '');
  if (manual) return manual;
  // When running on local 3dich Docker host (:8099), route safely through hardened server proxy!
  if (typeof location !== 'undefined' && location.protocol === 'http:' && location.port === '8099') {
    return target === 'agy-toshi' ? '/api/agy/toshi' : '/api/agy/kasa';
  }
  // When running from GitHub Pages on the user's own Kasa/Toshi machine, connect to local loopback bridge
  return target === 'agy-toshi' ? 'http://127.0.0.1:8767' : 'http://127.0.0.1:8766';
}

export async function testAgyBridge({ target, token, customUrl = '', fetchFn = fetch }) {
  const cleanTok = (token || '').trim();
  if (!cleanTok) throw new Error('MISSING_AGY_TOKEN');
  const base = resolveAgyEndpoint(target, customUrl);
  const res = await fetchFn(`${base}/health`, {
    method: 'GET',
    headers: { 'X-3dich-Token': cleanTok },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `AGY Bridge HTTP ${res.status}`);
  }
  return data;
}

export async function callAgyBridge({ target, token, customUrl = '', model, prompt, systemPrompt = '', snapshotDataUrl = null, mode = 'text', fetchFn = fetch }) {
  const cleanTok = (token || '').trim();
  if (!cleanTok) throw new Error('MISSING_AGY_TOKEN');
  const base = resolveAgyEndpoint(target, customUrl);
  const res = await fetchFn(`${base}/complete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${cleanTok}`,
      'X-3dich-Token': cleanTok,
    },
    body: JSON.stringify({
      model: model || 'gemini-3.8-flash-high',
      mode,
      systemPrompt,
      prompt,
      imageDataUrl: snapshotDataUrl || null,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new Error(data.error || `AGY Bridge HTTP ${res.status}`);
  }
  return data;
}

export function extractTextAndImages(apiJson) {
  // Support both Gemini generateContent and Imagen 4 predict formats!
  if (Array.isArray(apiJson?.predictions)) {
    const imgs = apiJson.predictions
      .filter((p) => p.bytesBase64Encoded)
      .map((p) => `data:${p.mimeType || 'image/png'};base64,${p.bytesBase64Encoded}`);
    return { text: '', images: imgs };
  }
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

export function buildEvaluationPromptText({ lang, printer, activeModIds, customParts, evalResult }) {
  const dossier = buildEngineeringDossier(printer, activeModIds, customParts, evalResult);
  const availableIds = MOD_CATALOG.filter((m) => !activeModIds.includes(m.id))
    .slice(0, 35)
    .map((m) => `${m.id} (${m.name.en})`)
    .join(', ');

  const langInstr = lang === 'tr'
    ? 'Respond in crisp, authoritative Turkish (Türkçe) using Principal Mechanical/Mechatronics Engineer tone.'
    : 'Respond in crisp, authoritative English using Principal Mechanical/Mechatronics Engineer tone.';

  return `${langInstr}
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
}

export function buildEvaluationPayload(opts) {
  const prompt = buildEvaluationPromptText(opts);
  const parts = [{ text: prompt }];
  const img = stripDataUrl(opts.snapshotDataUrl);
  if (img) {
    parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
  }
  return {
    contents: [{ role: 'user', parts }],
    generationConfig: { temperature: 0.35, maxOutputTokens: 1500 },
  };
}

export async function evaluateBuildWithGemini(opts) {
  const provider = opts.provider || 'gemini';
  if (provider === 'agy-kasa' || provider === 'agy-toshi') {
    const prompt = buildEvaluationPromptText(opts);
    const res = await callAgyBridge({
      target: provider,
      token: opts.agyToken,
      customUrl: opts.agyUrl,
      model: opts.agyModel || 'gemini-3.8-flash-high',
      prompt,
      snapshotDataUrl: opts.snapshotDataUrl,
      mode: 'audit',
      fetchFn: opts.fetchFn,
    });
    return {
      source: provider,
      model: `${provider.toUpperCase()} (${res.model || opts.agyModel})`,
      markdown: res.text || 'No response text received.',
      recommendedMods: extractRecommendedModIds(res.text),
    };
  }

  const payload = buildEvaluationPayload(opts);
  const primaryModel = opts.model || 'gemini-3.8-flash';
  const fallbackChain = [primaryModel, 'gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-2.5-flash'].filter((v, i, a) => a.indexOf(v) === i);
  let lastErr;
  for (const m of fallbackChain) {
    try {
      const json = await callGeminiAPI({
        apiKey: opts.apiKey,
        model: m,
        payload,
        useProxy: opts.useProxy,
        fetchFn: opts.fetchFn,
      });
      const { text } = extractTextAndImages(json);
      return {
        source: 'gemini',
        model: m,
        markdown: text || 'No response text received.',
        recommendedMods: extractRecommendedModIds(text),
      };
    } catch (err) {
      lastErr = err;
      if (err.status !== 404) throw err;
    }
  }
  throw lastErr;
}

export function buildImagePromptText({ styleId, customPrompt, printer, activeModIds, customParts }) {
  const style = RENDER_STYLES.find((s) => s.id === styleId) || RENDER_STYLES[0];
  const modNames = activeModIds.slice(0, 12).map((id) => MOD_BY_ID.get(id)?.name.en).filter(Boolean).join(', ');
  const customNames = customParts.map((p) => `${p.name} (${p.zone})`).join(', ');

  if (styleId === 'concept-part') {
    return `${style.prompt}\nSpecific mechanical part brief: ${customPrompt || 'Lightweight dual-5015 toolhead cooling duct bracket for Voron/CoreXY 3D printer with M3 heat-set insert bosses and chamfered airflow channels'}. Target printer: ${printer.name}.`;
  }
  const baseStyle = styleId === 'custom' ? (customPrompt || RENDER_STYLES[0].prompt) : style.prompt;
  return `${baseStyle}
Subject details: ${printer.name} (${printer.kinematics.toUpperCase()} 3D printer).
Key visible upgrades: ${modNames || 'Stock precision configuration'}.
Custom CAD mounted parts: ${customNames || 'None'}.
${customPrompt && styleId !== 'custom' ? `Extra user direction: ${customPrompt}` : ''}
Preserve the overall proportions, color scheme, and placement of mounted parts shown in the reference viewport render. Do not add watermarks or random text labels.`;
}

export function buildImageGenPayload(opts) {
  const prompt = buildImagePromptText(opts);
  const modelId = opts.imageModel || 'gemini-3.1-flash-image';

  // Imagen 4 uses :predict schema
  if (/^imagen-/i.test(modelId)) {
    return {
      instances: [{ prompt }],
      parameters: { sampleCount: 1, aspectRatio: '4:3' },
    };
  }

  const parts = [{ text: prompt }];
  if (opts.styleId !== 'concept-part') {
    const img = stripDataUrl(opts.snapshotDataUrl);
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
  const provider = opts.provider || 'gemini';
  if (provider === 'agy-kasa' || provider === 'agy-toshi') {
    const prompt = buildImagePromptText(opts);
    const res = await callAgyBridge({
      target: provider,
      token: opts.agyToken,
      customUrl: opts.agyUrl,
      model: opts.agyModel || 'gemini-4-neon-high',
      prompt,
      snapshotDataUrl: opts.styleId !== 'concept-part' ? opts.snapshotDataUrl : null,
      mode: 'image',
      fetchFn: opts.fetchFn,
    });
    if (!res.imageDataUrl) {
      throw new Error(res.text ? `AGY returned text only: ${res.text.slice(0, 200)}` : 'AGY bridge did not produce an image file.');
    }
    return {
      imageDataUrl: res.imageDataUrl,
      caption: res.text || `${provider.toUpperCase()} 3D Render`,
      model: `${provider.toUpperCase()} (${res.model || opts.agyModel})`,
      styleId: opts.styleId,
    };
  }

  const chosen = opts.imageModel || 'gemini-3.1-flash-image';
  const chain = [chosen, 'gemini-3.1-flash-image', 'gemini-3-pro-image-preview', 'gemini-2.5-flash-image'].filter((v, i, a) => a.indexOf(v) === i);
  let lastErr;
  for (const m of chain) {
    try {
      const payload = buildImageGenPayload({ ...opts, imageModel: m });
      const action = /^imagen-/i.test(m) ? 'predict' : 'generateContent';
      const json = await callGeminiAPI({
        apiKey: opts.apiKey,
        model: m,
        payload,
        action,
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
        model: m,
        styleId: opts.styleId,
      };
    } catch (err) {
      lastErr = err;
      if (err.status !== 404) throw err;
    }
  }
  throw lastErr;
}

export async function chatWithEngineer(opts) {
  const {
    provider = 'gemini', apiKey, model, agyToken, agyUrl, agyModel,
    lang, history = [], message, printer, activeModIds, customParts, evalResult,
    snapshotDataUrl, useProxy = false, fetchFn = fetch,
  } = opts;
  const dossier = buildEngineeringDossier(printer, activeModIds, customParts, evalResult);
  const sysText = `You are 3dich's embedded Principal 3D Printer & CAD Engineer. Language: ${lang === 'tr' ? 'Turkish' : 'English'}.
Current printer live state: ${JSON.stringify(dossier)}.
Keep answers practical, physics-backed, concise, and when recommending any catalog mod include [[mod:<id>]].`;

  if (provider === 'agy-kasa' || provider === 'agy-toshi') {
    const conv = history.slice(-6).map((h) => `${h.role === 'assistant' ? 'Engineer' : 'User'}: ${h.text}`).join('\n');
    const res = await callAgyBridge({
      target: provider,
      token: agyToken,
      customUrl: agyUrl,
      model: agyModel || 'gemini-3.8-flash-high',
      systemPrompt: sysText,
      prompt: conv ? `${conv}\nUser: ${message}` : message,
      snapshotDataUrl: history.length === 0 ? snapshotDataUrl : null,
      mode: 'chat',
      fetchFn,
    });
    return {
      text: res.text || '...',
      recommendedMods: extractRecommendedModIds(res.text),
    };
  }

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
  const json = await callGeminiAPI({ apiKey, model: model || 'gemini-3.8-flash', payload, useProxy, fetchFn });
  const { text } = extractTextAndImages(json);
  return {
    text: text || '...',
    recommendedMods: extractRecommendedModIds(text),
  };
}

// Rich Deterministic Offline Principal Engineer Audit
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

> *Daha derin görsel-mekanik analiz ve fotogerçekçi 3D renderlar için Gemini 3.8/4 API anahtarını gir veya şifreli AGY Kasa / AGY Toshi köprüsüne bağlan.*`,
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

> *Enter a Gemini 3.8/4 API key or authenticate with your private AGY Kasa / AGY Toshi Zero-Trust Bridge for Vision Audits & 3D Studio Renders.*`,
  };
}
