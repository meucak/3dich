// 3dich — Main Application Orchestrator (On-Demand 3D Engine, Physics, SolidCraft Worker, Gemini Studio & HIG UI)

import {
  PRINTER_PLATFORMS,
  PRINTER_BY_ID,
  MOD_CATALOG,
  MOD_BY_ID,
  MOD_CATEGORIES,
  BUILD_PRESETS,
  MATERIALS,
  MATERIAL_BY_ID,
  FRAME_FINISHES,
  ACCENT_COLORS,
  MOUNT_HARDPOINTS,
  getHardpointPose,
} from './catalog.js';
import {
  evaluatePrinterBuild,
  computeCustomPartMassG,
  generateKlipperConfig,
  formatDuration,
} from './physics_engine.js';
import { OrbitCamera } from './camera.js';
import {
  buildPrinterGeometry,
  DEMO_SOLIDCRAFT_PARTS,
  createDemoSolidCraftMesh,
} from './procedural_meshes.js';
import { parseCADFile, exportBinarySTL } from './mesh_parsers.js';
import { WebGLRenderer } from './renderer_webgl.js';
import { Canvas2DRenderer } from './renderer_canvas2d.js';
import { TransformGizmo } from './gizmo.js';
import {
  GEMINI_TEXT_MODELS,
  GEMINI_IMAGE_MODELS,
  RENDER_STYLES,
  evaluateBuildWithGemini,
  generate3DRenderWithGemini,
  chatWithEngineer,
  buildOfflineEngineeringAudit,
} from './gemini_studio.js';
import {
  MAKER_SOLIDCRAFT_IDEAS,
  buildSolidCraftMCPSpec,
  fetchLocalSolidCraftLibrary,
} from './solidcraft_bridge.js';
import {
  loadSettings,
  saveSettings,
  saveBuildSnapshot,
  loadBuildSnapshot,
  saveRenderToGallery,
  loadRenderGallery,
} from './storage.js';
import { t } from './i18n.js';

const $ = (id) => document.getElementById(id);

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderSafeMarkdown(md) {
  const lines = String(md || '').split(/\r?\n/);
  let html = '';
  let inList = false;
  const fmtInline = (txt) =>
    escapeHtml(txt)
      .replace(/\[\[mod:([a-z0-9-]+)\]\]/gi, (_, id) => `<code>${id}</code>`)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      if (inList) { html += '</ul>'; inList = false; }
      continue;
    }
    if (line.startsWith('### ')) {
      if (inList) { html += '</ul>'; inList = false; }
      html += `<h3>${fmtInline(line.slice(4))}</h3>`;
    } else if (line.startsWith('## ')) {
      if (inList) { html += '</ul>'; inList = false; }
      html += `<h3>${fmtInline(line.slice(3))}</h3>`;
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      if (!inList) { html += '<ul>'; inList = true; }
      html += `<li>${fmtInline(line.slice(2))}</li>`;
    } else if (line.startsWith('> ')) {
      if (inList) { html += '</ul>'; inList = false; }
      html += `<p class="small-muted">${fmtInline(line.slice(2))}</p>`;
    } else {
      if (inList) { html += '</ul>'; inList = false; }
      html += `<p>${fmtInline(line)}</p>`;
    }
  }
  if (inList) html += '</ul>';
  return html;
}

class App3dich {
  constructor() {
    this.settings = loadSettings();
    this.state = {
      printerId: 'voron-24',
      customDims: { x: 280, y: 280, z: 280, kinematics: 'corexy' },
      activeModIds: ['hotend-rapido-uhf', 'cool-stealthburner', 'probe-beacon-eddy', 'elec-canbus-ebb36', 'qol-rgb-neopixel'],
      frameFinishId: 'matte-black',
      accentColorId: 'signal-orange',
      customParts: [],
      selectedPartId: null,
      categoryFilter: 'all',
      searchQuery: '',
      leftTab: 'catalog',
      rightTab: 'telemetry',
      mobileView: 'scene',
      simRunning: false,
      showAirflow: false,
      thermalMode: false,
      showHardpoints: false,
    };

    // Restore persisted build (non-mesh metadata) if available
    const saved = loadBuildSnapshot();
    if (saved && PRINTER_BY_ID.has(saved.printerId)) {
      this.state.printerId = saved.printerId;
      if (Array.isArray(saved.activeModIds)) {
        this.state.activeModIds = saved.activeModIds.filter((id) => MOD_BY_ID.has(id));
      }
      if (saved.frameFinishId) this.state.frameFinishId = saved.frameFinishId;
      if (saved.accentColorId) this.state.accentColorId = saved.accentColorId;
      if (saved.customDims) this.state.customDims = { ...this.state.customDims, ...saved.customDims };
    }

    this.undoStack = [];
    this.redoStack = [];
    this.partMeshes = new Map(); // partId -> analyzed mesh buffers
    this.chatHistory = [];
    this.renderGallery = [];
    this.evalResult = null;
    this.printerGeoMeta = { bedY: 200, gantryY: 252, baseLift: 0, fYTop: 530 };

    // 3D Engine state
    this.camera = new OrbitCamera();
    this.gizmo = new TransformGizmo();
    this.renderer = null;
    this.dirty = true;
    this.rafId = null;
    this.lastFrameTs = 0;
    this.simTime = 0;
    this.motionOffset = { x: 0, y: 0, z: 0 };
    this.worker = null;
    this.workerReqId = 0;
    this.workerPending = new Map();
    this.toastTimer = null;

    this._init();
  }

  async _init() {
    this._applyTheme(this.settings.theme);
    this._initRenderer();
    this._populateStaticSelectors();
    this._bindEvents();
    this._applyLanguage(this.settings.lang);

    this.camera.framePrinter(this.getActivePrinter(), true);
    this._rebuildPrinterGeometry();
    this._recomputePhysicsAndUI();
    this.requestRender();

    // Load gallery & optional local Kasa SolidCraft library asynchronously
    this.renderGallery = await loadRenderGallery();
    this._renderGalleryUI();
    this._loadLocalLibrary();

    // Register PWA Service Worker
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }

    // Expose safe diagnostic handle for automated benchmarks & E2E verification
    window.__3dich = {
      getStats: () => ({
        ...this.renderer.stats,
        rafRunning: this.rafId !== null,
        printerId: this.state.printerId,
        activeModCount: this.state.activeModIds.length,
        customPartCount: this.state.customParts.length,
        engineeringScore: this.evalResult?.current?.engineeringScore,
        collisions: this.evalResult?.current?.collisions?.length || 0,
      }),
      addDemoPart: (id) => this.addDemoSolidCraftPart(id),
      applyPreset: (id) => this.applyPreset(id),
      captureSnapshot: () => this._captureViewportPng(),
    };
  }

  getActivePrinter() {
    const base = PRINTER_BY_ID.get(this.state.printerId) || PRINTER_PLATFORMS[0];
    if (base.id !== 'custom-scratch') return base;
    const d = this.state.customDims;
    const bx = Math.max(100, Math.min(600, Number(d.x) || 280));
    const by = Math.max(100, Math.min(600, Number(d.y) || 280));
    const bz = Math.max(100, Math.min(600, Number(d.z) || 280));
    const isCore = d.kinematics !== 'bedslinger';
    return {
      ...base,
      kinematics: isCore ? 'corexy' : 'bedslinger',
      frameType: isCore ? 'cube' : 'gantry',
      buildVolume: { x: bx, y: by, z: bz },
      outerSize: { x: bx + 150, y: by + 150, z: bz + 210 },
    };
  }

  _initRenderer() {
    const canvas = $('viewport-canvas');
    const force2d = new URLSearchParams(location.search).get('renderer') === '2d';
    if (!force2d) {
      try {
        this.renderer = new WebGLRenderer(canvas);
      } catch (err) {
        console.warn('[3dich] WebGL unavailable, switching to Canvas2D software fallback:', err?.message);
        this.renderer = new Canvas2DRenderer(canvas);
      }
    } else {
      this.renderer = new Canvas2DRenderer(canvas);
    }
    this._handleResize();
    new ResizeObserver(() => this._handleResize()).observe($('viewport-wrap'));
  }

  _handleResize() {
    const wrap = $('viewport-wrap');
    if (!wrap || !this.renderer) return;
    const rect = wrap.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;
    this.renderer.resize(rect.width, rect.height, this.settings.dprCap || 2.0);
    this.camera.setAspect(rect.width, rect.height);
    this.requestRender();
  }

  _rebuildPrinterGeometry() {
    const printer = this.getActivePrinter();
    const ff = FRAME_FINISHES.find((f) => f.id === this.state.frameFinishId) || FRAME_FINISHES[0];
    const ac = ACCENT_COLORS.find((a) => a.id === this.state.accentColorId) || ACCENT_COLORS[0];
    const geo = buildPrinterGeometry(printer, this.state.activeModIds, {
      frameHex: ff.hex,
      frameMetal: ff.metal,
      frameRough: ff.rough,
      accentHex: ac.hex,
    });
    this.printerGeoMeta = geo.meta;
    this.renderer.uploadPrinterBatches(geo);
    $('vp-printer-tag').textContent = `${printer.name} • ${printer.buildVolume.x}×${printer.buildVolume.y}×${printer.buildVolume.z}mm`;
    this.requestRender();
  }

  // ==================== ON-DEMAND ZERO-IDLE RENDER LOOP ====================
  requestRender() {
    this.dirty = true;
    if (this.rafId === null) {
      this.lastFrameTs = performance.now();
      this.rafId = requestAnimationFrame((ts) => this._tick(ts));
    }
  }

  _tick(now) {
    const dt = Math.min(0.05, Math.max(0.001, (now - this.lastFrameTs) / 1000));
    this.lastFrameTs = now;

    const camMoving = this.camera.update(dt);
    const animActive = this.state.simRunning || this.state.showAirflow;

    if (this.state.simRunning) {
      const printer = this.getActivePrinter();
      const speedScale = Math.max(0.6, (this.evalResult?.current?.effectivePrintSpeedMmS || 200) / 150);
      this.simTime += dt * speedScale;
      const rx = printer.buildVolume.x * 0.30;
      const rz = printer.buildVolume.y * 0.28;
      // Smooth high-speed Lissajous/Benchy toolpath perimeter loop
      this.motionOffset.x = Math.sin(this.simTime * 2.1) * rx;
      this.motionOffset.z = Math.sin(this.simTime * 1.45) * Math.cos(this.simTime * 0.72) * rz;
      this.motionOffset.y = (Math.sin(this.simTime * 0.35) * 0.5 + 0.5) * 28;
    } else if (this.state.showAirflow) {
      this.simTime += dt;
    } else {
      this.motionOffset.x = 0;
      this.motionOffset.y = 0;
      this.motionOffset.z = 0;
    }

    const scene = this._buildSceneDescriptor();
    const stats = this.renderer.render(scene);
    this.dirty = false;

    const keepRunning = camMoving || animActive || this.gizmo.dragging || this.dirty;
    this._updatePerfHud(stats, keepRunning);

    if (keepRunning) {
      this.rafId = requestAnimationFrame((ts) => this._tick(ts));
    } else {
      this.rafId = null;
    }
  }

  _buildSceneDescriptor() {
    const printer = this.getActivePrinter();
    const collidingIds = new Set();
    for (const c of this.evalResult?.current?.collisions || []) {
      collidingIds.add(c.partId);
      if (c.otherPartId) collidingIds.add(c.otherPartId);
    }
    const hardpointPositions = this.state.showHardpoints
      ? MOUNT_HARDPOINTS.map((hp) => ({ id: hp.id, ...getHardpointPose(printer, hp.id, this.motionOffset) }))
      : [];

    return {
      camera: this.camera,
      lightTheme: this.settings.theme === 'light',
      thermalMode: this.state.thermalMode,
      showAirflow: this.state.showAirflow,
      showHardpoints: this.state.showHardpoints,
      hardpointPositions,
      motionOffset: this.motionOffset,
      kinematics: printer.kinematics,
      customParts: this.state.customParts,
      selectedPartId: this.state.selectedPartId,
      collidingPartIds: collidingIds,
      gizmo: this.gizmo,
      simTime: this.simTime,
      coolingCfm: this.evalResult?.current?.coolingCfm || 8,
      nozzleBaseY: this.printerGeoMeta.gantryY - 26,
    };
  }

  _updatePerfHud(stats, active) {
    $('hud-backend').textContent = stats.backend;
    $('hud-framems').textContent = `${stats.frameMs.toFixed(1)}ms`;
    $('hud-dc').textContent = `${stats.drawCalls} DC`;
    const idleEl = $('hud-idle');
    if (active) {
      idleEl.textContent = t(this.settings.lang, 'activeLabel');
      idleEl.className = 'hud-active';
    } else {
      idleEl.textContent = t(this.settings.lang, 'idleLabel');
      idleEl.className = 'hud-idle';
    }
  }

  _captureViewportPng() {
    return this.renderer.captureSnapshot(this._buildSceneDescriptor(), 'image/png', 0.92);
  }

  // ==================== UNDO / REDO HISTORY ====================
  _pushUndo() {
    const snap = JSON.stringify({
      printerId: this.state.printerId,
      customDims: this.state.customDims,
      activeModIds: this.state.activeModIds,
      frameFinishId: this.state.frameFinishId,
      accentColorId: this.state.accentColorId,
      customParts: this.state.customParts,
    });
    this.undoStack.push(snap);
    if (this.undoStack.length > 40) this.undoStack.shift();
    this.redoStack.length = 0;
    this._syncHistoryButtons();
  }

  _restoreHistorySnapshot(snapStr) {
    const snap = JSON.parse(snapStr);
    this.state.printerId = snap.printerId;
    this.state.customDims = snap.customDims;
    this.state.activeModIds = snap.activeModIds;
    this.state.frameFinishId = snap.frameFinishId;
    this.state.accentColorId = snap.accentColorId;
    this.state.customParts = snap.customParts.filter((p) => this.partMeshes.has(p.id));
    if (this.state.selectedPartId && !this.state.customParts.some((p) => p.id === this.state.selectedPartId)) {
      this.state.selectedPartId = null;
    }
    this._rebuildPrinterGeometry();
    this._recomputePhysicsAndUI();
    this._syncHistoryButtons();
  }

  undo() {
    if (this.undoStack.length === 0) return;
    const cur = JSON.stringify({
      printerId: this.state.printerId,
      customDims: this.state.customDims,
      activeModIds: this.state.activeModIds,
      frameFinishId: this.state.frameFinishId,
      accentColorId: this.state.accentColorId,
      customParts: this.state.customParts,
    });
    this.redoStack.push(cur);
    this._restoreHistorySnapshot(this.undoStack.pop());
  }

  redo() {
    if (this.redoStack.length === 0) return;
    const cur = JSON.stringify({
      printerId: this.state.printerId,
      customDims: this.state.customDims,
      activeModIds: this.state.activeModIds,
      frameFinishId: this.state.frameFinishId,
      accentColorId: this.state.accentColorId,
      customParts: this.state.customParts,
    });
    this.undoStack.push(cur);
    this._restoreHistorySnapshot(this.redoStack.pop());
  }

  _syncHistoryButtons() {
    $('btn-undo').disabled = this.undoStack.length === 0;
    $('btn-redo').disabled = this.redoStack.length === 0;
  }

  // ==================== STATE MUTATIONS ====================
  toggleMod(modId, forceState = null) {
    const mod = MOD_BY_ID.get(modId);
    if (!mod) return;
    this._pushUndo();
    const idx = this.state.activeModIds.indexOf(modId);
    const shouldAdd = forceState !== null ? forceState : idx < 0;
    if (shouldAdd && idx < 0) {
      // Replace mutually-exclusive slot peer if any
      if (mod.slot) {
        this.state.activeModIds = this.state.activeModIds.filter((id) => MOD_BY_ID.get(id)?.slot !== mod.slot);
      }
      this.state.activeModIds.push(modId);
    } else if (!shouldAdd && idx >= 0) {
      this.state.activeModIds.splice(idx, 1);
    }
    this._persistBuild();
    this._rebuildPrinterGeometry();
    this._recomputePhysicsAndUI();
  }

  setPrinter(printerId) {
    if (!PRINTER_BY_ID.has(printerId)) return;
    this._pushUndo();
    this.state.printerId = printerId;
    this._persistBuild();
    this.camera.framePrinter(this.getActivePrinter(), false);
    this._rebuildPrinterGeometry();
    this._recomputePhysicsAndUI();
  }

  applyPreset(presetId) {
    const p = BUILD_PRESETS.find((x) => x.id === presetId);
    if (!p) return;
    this._pushUndo();
    this.state.printerId = p.printerId;
    this.state.activeModIds = [...p.mods];
    this.state.frameFinishId = p.frameFinish;
    this.state.accentColorId = p.accentColor;
    this._persistBuild();
    this.camera.framePrinter(this.getActivePrinter(), false);
    this._rebuildPrinterGeometry();
    this._recomputePhysicsAndUI();
    this.toast(t(this.settings.lang, 'toastPresetApplied'));
  }

  _persistBuild() {
    saveBuildSnapshot({
      printerId: this.state.printerId,
      customDims: this.state.customDims,
      activeModIds: this.state.activeModIds,
      frameFinishId: this.state.frameFinishId,
      accentColorId: this.state.accentColorId,
    });
  }

  // ==================== SOLIDCRAFT CAD IMPORT (WEB WORKER) ====================
  _parseInWorker(buffer, fileName) {
    return new Promise((resolve, reject) => {
      try {
        if (!this.worker && typeof Worker !== 'undefined') {
          this.worker = new Worker('./js/mesh_worker.js', { type: 'module' });
          this.worker.onmessage = (ev) => {
            const { id, ok, result, error, elapsedMs } = ev.data || {};
            const entry = this.workerPending.get(id);
            if (!entry) return;
            this.workerPending.delete(id);
            if (ok) entry.resolve({ result, elapsedMs });
            else entry.reject(new Error(error || 'Parse failed'));
          };
          this.worker.onerror = () => {
            this.worker = null;
          };
        }
        if (this.worker) {
          const id = ++this.workerReqId;
          this.workerPending.set(id, { resolve, reject });
          const copy = buffer.slice(0);
          this.worker.postMessage({ id, buffer: copy, fileName }, [copy]);
          return;
        }
      } catch { /* fallback to main thread */ }
      const t0 = performance.now();
      parseCADFile(buffer, fileName)
        .then((result) => resolve({ result, elapsedMs: Number((performance.now() - t0).toFixed(2)) }))
        .catch(reject);
    });
  }

  async importCADFile(file) {
    try {
      const buf = await file.arrayBuffer();
      const { result, elapsedMs } = await this._parseInWorker(buf, file.name);
      if (result.isSolidCraftArchive) {
        this._showSolidCraftArchiveCard(result, file.name);
        return;
      }
      this._mountAnalyzedPart({
        name: file.name,
        format: result.format || 'STL',
        source: 'SolidCraft / CAD Import',
        hardpointId: 'toolhead-front',
        materialId: 'petg',
        analyzed: result,
      });
      this.toast(`${file.name} (${result.triCount.toLocaleString()} tris • ${elapsedMs}ms)`);
    } catch (err) {
      this.toast(`Import error: ${err.message}`);
    }
  }

  addDemoSolidCraftPart(demoId) {
    const { def, analyzed } = createDemoSolidCraftMesh(demoId);
    this._mountAnalyzedPart({
      name: def.name,
      format: 'STL',
      source: 'SolidCraft Demo Part',
      hardpointId: def.defaultHardpoint,
      materialId: def.defaultMaterial,
      analyzed,
    });
    this.toast(t(this.settings.lang, 'toastPartAdded'));
  }

  _mountAnalyzedPart({ name, format, source, hardpointId, materialId, analyzed }) {
    this._pushUndo();
    const id = `part_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const printer = this.getActivePrinter();
    const hp = MOUNT_HARDPOINTS.find((h) => h.id === hardpointId) || MOUNT_HARDPOINTS[0];
    const pose = getHardpointPose(printer, hp.id, this.motionOffset);
    const mat = MATERIAL_BY_ID.get(materialId) || MATERIAL_BY_ID.get('petg');

    const part = {
      id,
      name,
      format,
      source,
      materialId: mat.id,
      colorHex: mat.color,
      metal: mat.printable ? 0.16 : 0.78,
      rough: mat.printable ? 0.48 : 0.26,
      infillPct: 35,
      zone: hp.zone,
      hardpointId: hp.id,
      pos: pose.pos.map((v) => Number(v.toFixed(1))),
      rot: [...pose.rot],
      scale: [1, 1, 1],
      volumeCm3: analyzed.volumeCm3,
      surfaceAreaCm2: analyzed.surfaceAreaCm2,
      sizeMm: analyzed.sizeMm,
      triCount: analyzed.triCount,
      overhangPct: analyzed.overhangPct,
      localBBox: analyzed.localBBox,
    };

    this.partMeshes.set(id, analyzed);
    this.renderer.uploadCustomPart(id, analyzed);
    this.state.customParts.push(part);
    this.state.selectedPartId = id;
    this._switchRightTab('part');
    this._recomputePhysicsAndUI();
    this.requestRender();
  }

  selectPart(partId) {
    this.state.selectedPartId = partId;
    if (partId) this._switchRightTab('part');
    this._renderPartInspector();
    this._renderMountedPartsList();
    this._syncGizmoBar();
    this.requestRender();
  }

  deletePart(partId) {
    const idx = this.state.customParts.findIndex((p) => p.id === partId);
    if (idx < 0) return;
    this._pushUndo();
    this.state.customParts.splice(idx, 1);
    this.renderer.removeCustomPart(partId);
    if (this.state.selectedPartId === partId) {
      this.state.selectedPartId = this.state.customParts[0]?.id || null;
    }
    this._recomputePhysicsAndUI();
    this.requestRender();
  }

  _showSolidCraftArchiveCard(info, fileName) {
    const card = $('sc-archive-card');
    card.hidden = false;
    const comps = info.components.map((c) => `<code>${escapeHtml(c.name)}</code>`).join(' ');
    const thumb = info.thumbnailDataUrl
      ? `<img src="${info.thumbnailDataUrl}" alt="${escapeHtml(fileName)}" style="width:100%;max-height:130px;object-fit:contain;border-radius:6px;background:var(--bg-input);margin-bottom:8px" />`
      : '';
    $('sc-archive-body').innerHTML = `
      ${thumb}
      <div class="small-muted" style="margin-bottom:6px">
        <strong>${escapeHtml(info.name)}</strong> (${escapeHtml(info.units)}) • ${info.components.length} components • ${info.joints.length} joints
      </div>
      <div style="margin-bottom:6px;font-size:11px">${comps}</div>
      <p class="hint-text">${escapeHtml(t(this.settings.lang, 'scInspectorHint'))}</p>
      <pre class="code-box mono" tabindex="0">${escapeHtml(info.exportCommand)}</pre>
      <button type="button" id="btn-copy-sc-export" class="btn btn-primary btn-sm">${escapeHtml(t(this.settings.lang, 'btnCopyBatch'))}</button>
    `;
    $('btn-copy-sc-export')?.addEventListener('click', () => this._copyText(info.exportCommand));
    this._switchLeftTab('solidcraft');
  }

  async _loadLocalLibrary() {
    const lib = await fetchLocalSolidCraftLibrary();
    if (!lib.available || lib.files.length === 0) return;
    $('local-lib-section').hidden = false;
    const el = $('local-lib-list');
    el.innerHTML = '';
    for (const f of lib.files.slice(0, 18)) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mounted-item';
      btn.innerHTML = `<div class="row-between"><strong class="mono">${escapeHtml(f.name)}</strong><span class="tag">${(f.size / 1024).toFixed(0)} KB</span></div><span class="small-muted">${escapeHtml(f.source)}</span>`;
      btn.addEventListener('click', async () => {
        const resp = await fetch(`/api/solidcraft-file?id=${encodeURIComponent(f.id)}`);
        if (!resp.ok) return;
        const blob = await resp.blob();
        await this.importCADFile(new File([blob], f.name));
      });
      el.appendChild(btn);
    }
  }

  // ==================== RECOMPUTE PHYSICS & SYNC ALL UI ====================
  _recomputePhysicsAndUI() {
    const printer = this.getActivePrinter();
    this.evalResult = evaluatePrinterBuild(printer, this.state.activeModIds, this.state.customParts);
    this._renderCatalog();
    this._renderPrintersAndPresets();
    this._renderMountedPartsList();
    this._renderTelemetry();
    this._renderPartInspector();
    this._syncGizmoBar();
    this._updateMcpPreview();
    this._syncViewportAlert();
    this.requestRender();
  }

  _syncViewportAlert() {
    const el = $('viewport-alert');
    const errs = [
      ...(this.evalResult?.current?.collisions || []),
      ...(this.evalResult?.current?.warnings || []).filter((w) => w.severity === 'error'),
    ];
    if (errs.length === 0) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    const first = errs[0];
    el.textContent = `${first[this.settings.lang] || first.en}${errs.length > 1 ? ` (+${errs.length - 1})` : ''}`;
  }

  _renderTelemetry() {
    const { baseline, current, deltas } = this.evalResult;
    const lang = this.settings.lang;

    // Score Ring (circumference = 2 * pi * 34 = 213.63)
    const circ = 213.63;
    const dashOff = circ * (1 - current.engineeringScore / 100);
    $('score-ring-fg').setAttribute('stroke-dashoffset', dashOff.toFixed(1));
    $('kpi-score').textContent = current.engineeringScore;

    // Benchy Hero
    $('kpi-benchy').textContent = formatDuration(current.benchySec);
    $('kpi-benchy-stock').textContent = formatDuration(baseline.benchySec);
    $('kpi-shaper').textContent = current.shaperAlgo;
    const bDelta = $('kpi-benchy-delta');
    bDelta.textContent = `${deltas.benchyPct > 0 ? '+' : ''}${deltas.benchyPct}%`;
    bDelta.className = `delta-pill mono ${deltas.benchyPct <= 0 ? 'delta-good' : 'delta-bad'}`;

    // 6 KPI Cards
    $('kpi-speed').textContent = `${current.effectivePrintSpeedMmS} mm/s`;
    $('kpi-speed-delta').textContent = `${deltas.effectivePrintSpeedMmS >= 0 ? '+' : ''}${deltas.effectivePrintSpeedMmS} vs stock`;
    $('kpi-accel').textContent = current.maxAccelMmS2.toLocaleString();
    $('kpi-accel-delta').textContent = `${deltas.maxAccelMmS2 >= 0 ? '+' : ''}${deltas.maxAccelMmS2.toLocaleString()} mm/s²`;
    $('kpi-flow').textContent = `${current.maxFlowMm3s} mm³/s`;
    $('kpi-temp-sub').textContent = `${current.maxNozzleC}°C / ${current.chamberC}°C`;
    $('kpi-mass').textContent = `${current.xMassG}g X`;
    $('kpi-mass-y').textContent = `${current.yMassG}g Y (${deltas.xMassG >= 0 ? '+' : ''}${deltas.xMassG}g X)`;
    $('kpi-noise').textContent = `${current.noiseDba} dBA`;
    $('kpi-noise-delta').textContent = `${deltas.noiseDba > 0 ? '+' : ''}${deltas.noiseDba} dBA vs stock`;
    $('kpi-cost').textContent = `$${current.totalCostUsd.toLocaleString()}`;
    $('kpi-power').textContent = `${current.dcDrawW}W / ${current.psuWatts}W (${current.psuHeadroomPct}%)`;

    // Bottleneck Bars
    const maxCap = Math.max(450, current.flowLimitMmS, current.coolingLimitMmS, current.motionLimitMmS);
    $('bottleneck-badge').textContent = current.bottleneck.toUpperCase();
    $('bar-flow-val').textContent = `${current.flowLimitMmS} mm/s`;
    $('bar-flow-fill').style.width = `${Math.min(100, (current.flowLimitMmS / maxCap) * 100)}%`;
    $('bar-cool-val').textContent = `${current.coolingLimitMmS} mm/s`;
    $('bar-cool-fill').style.width = `${Math.min(100, (current.coolingLimitMmS / maxCap) * 100)}%`;
    $('bar-motion-val').textContent = `${current.motionLimitMmS} mm/s`;
    $('bar-motion-fill').style.width = `${Math.min(100, (current.motionLimitMmS / maxCap) * 100)}%`;

    // Input Shaper SVG Spectrum
    $('freq-badge').textContent = `X:${current.freqX}Hz  Y:${current.freqY}Hz`;
    this._renderResonanceSVG(current.resonanceCurve, current.freqX, current.freqY);

    // Material Matrix (color + explicit status symbol for color-blind A11y)
    const matEl = $('material-matrix');
    matEl.innerHTML = '';
    const sym = { ok: '✓', warn: '!', fail: '×' };
    for (const m of current.materialMatrix) {
      const div = document.createElement('div');
      div.className = `mat-pill mat-${m.status}`;
      div.textContent = `${sym[m.status] || ''} ${m.id}`;
      div.title = m.reasons.length ? m.reasons.join(' • ') : 'Optimal';
      matEl.appendChild(div);
    }

    // Warnings & Collisions
    const wEl = $('warnings-list');
    wEl.innerHTML = '';
    const allAlerts = [
      ...current.collisions.map((c) => ({ sev: 'err', text: c[lang] || c.en })),
      ...current.warnings.map((w) => ({ sev: w.severity === 'error' ? 'err' : 'warn', text: w[lang] || w.en })),
    ];
    if (allAlerts.length === 0) {
      const ok = document.createElement('div');
      ok.className = 'warn-item ok';
      ok.textContent = t(lang, 'noWarnings');
      wEl.appendChild(ok);
    } else {
      for (const a of allAlerts) {
        const d = document.createElement('div');
        d.className = `warn-item ${a.sev}`;
        d.textContent = a.text;
        wEl.appendChild(d);
      }
    }
  }

  _renderResonanceSVG(points, fx, fy) {
    const svg = $('resonance-svg');
    const W = 320, H = 116, padL = 24, padR = 10, padT = 10, padB = 20;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;
    const maxY = 10.5;
    const xOf = (hz) => padL + ((hz - 10) / 110) * plotW;
    const yOf = (val) => padT + plotH - Math.min(1, val / maxY) * plotH;

    const poly = (key) => points.map((p) => `${xOf(p.hz).toFixed(1)},${yOf(p[key]).toFixed(1)}`).join(' ');
    const gridTicks = [20, 40, 60, 80, 100];
    const gridSvg = gridTicks.map((hz) => {
      const x = xOf(hz).toFixed(1);
      return `<line x1="${x}" y1="${padT}" x2="${x}" y2="${padT + plotH}" stroke="rgba(148,163,184,0.16)" stroke-width="1"/>
              <text x="${x}" y="${H - 5}" text-anchor="middle" fill="currentColor" opacity="0.58" font-size="9" font-family="monospace">${hz}Hz</text>`;
    }).join('');

    const peakX = points.reduce((best, p) => (p.shapedX > best.shapedX ? p : best), points[0]);
    const peakY = points.reduce((best, p) => (p.shapedY > best.shapedY ? p : best), points[0]);

    svg.innerHTML = `
      ${gridSvg}
      <polyline points="${poly('rawX')}" fill="none" stroke="#ff8c52" stroke-width="1.2" stroke-dasharray="3 2" opacity="0.52"/>
      <polyline points="${poly('rawY')}" fill="none" stroke="#4fd1ed" stroke-width="1.2" stroke-dasharray="3 2" opacity="0.52"/>
      <polyline points="${poly('shapedX')}" fill="none" stroke="#f06a28" stroke-width="2.2"/>
      <polyline points="${poly('shapedY')}" fill="none" stroke="#2eb8d8" stroke-width="2.2"/>
      <circle cx="${xOf(peakX.hz).toFixed(1)}" cy="${yOf(peakX.shapedX).toFixed(1)}" r="3.2" fill="#f06a28"/>
      <circle cx="${xOf(peakY.hz).toFixed(1)}" cy="${yOf(peakY.shapedY).toFixed(1)}" r="3.2" fill="#2eb8d8"/>
      <text x="${W - 10}" y="${padT + 9}" text-anchor="end" fill="#ff8c52" font-size="9" font-family="monospace">─ X (${fx}Hz)</text>
      <text x="${W - 10}" y="${padT + 20}" text-anchor="end" fill="#4fd1ed" font-size="9" font-family="monospace">─ Y (${fy}Hz)</text>
    `;
  }

  // ==================== LEFT DOCK RENDERING ====================
  _populateStaticSelectors() {
    // Quick printer selector
    const qSel = $('quick-printer-select');
    qSel.innerHTML = '';
    for (const p of PRINTER_PLATFORMS) {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      qSel.appendChild(opt);
    }
    qSel.value = this.state.printerId;

    // Hardpoint selects (MCP & Part Snap)
    for (const selId of ['mcp-hp-select', 'pe-snap-hp']) {
      const sel = $(selId);
      sel.innerHTML = '';
      for (const hp of MOUNT_HARDPOINTS) {
        const opt = document.createElement('option');
        opt.value = hp.id;
        opt.textContent = hp.label[this.settings.lang] || hp.label.en;
        sel.appendChild(opt);
      }
    }

    // Material select for Custom Parts
    const mSel = $('pe-material');
    mSel.innerHTML = '';
    for (const mat of MATERIALS) {
      const opt = document.createElement('option');
      opt.value = mat.id;
      opt.textContent = `${mat.name} (${mat.density} g/cm³ • ${mat.maxTemp}°C)`;
      mSel.appendChild(opt);
    }

    // Gemini Model & Style selects
    const tmSel = $('gemini-text-model');
    tmSel.innerHTML = GEMINI_TEXT_MODELS.map((m) => `<option value="${m.id}">${m.label}</option>`).join('');
    tmSel.value = this.settings.textModel;

    const imSel = $('gemini-image-model');
    imSel.innerHTML = GEMINI_IMAGE_MODELS.map((m) => `<option value="${m.id}">${m.label}</option>`).join('');
    imSel.value = this.settings.imageModel;

    const rsSel = $('render-style-select');
    rsSel.innerHTML = RENDER_STYLES.map((s) => `<option value="${s.id}">${s.name[this.settings.lang] || s.name.en}</option>`).join('');

    $('gemini-api-key').value = this.settings.apiKey || '';

    // Color swatches
    this._renderSwatches();
    this._renderDemoParts();
    this._renderIdeasList();
  }

  _renderSwatches() {
    const fWrap = $('frame-swatches');
    fWrap.innerHTML = '';
    for (const f of FRAME_FINISHES) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `swatch-btn ${this.state.frameFinishId === f.id ? 'active' : ''}`;
      b.style.background = f.hex;
      b.title = f.name[this.settings.lang] || f.name.en;
      b.setAttribute('aria-label', f.name.en);
      b.addEventListener('click', () => {
        this._pushUndo();
        this.state.frameFinishId = f.id;
        this._persistBuild();
        this._renderSwatches();
        this._rebuildPrinterGeometry();
      });
      fWrap.appendChild(b);
    }

    const aWrap = $('accent-swatches');
    aWrap.innerHTML = '';
    for (const a of ACCENT_COLORS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `swatch-btn ${this.state.accentColorId === a.id ? 'active' : ''}`;
      b.style.background = a.hex;
      b.title = a.name[this.settings.lang] || a.name.en;
      b.setAttribute('aria-label', a.name.en);
      b.addEventListener('click', () => {
        this._pushUndo();
        this.state.accentColorId = a.id;
        this._persistBuild();
        this._renderSwatches();
        this._rebuildPrinterGeometry();
      });
      aWrap.appendChild(b);
    }
  }

  _renderCatalog() {
    const lang = this.settings.lang;
    $('active-mod-count').textContent = this.state.activeModIds.length;
    $('quick-printer-select').value = this.state.printerId;

    // Category filter chips
    const chipWrap = $('category-chips');
    chipWrap.innerHTML = '';
    for (const cat of MOD_CATEGORIES) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `chip ${this.state.categoryFilter === cat.id ? 'active' : ''}`;
      b.textContent = cat.name[lang] || cat.name.en;
      b.addEventListener('click', () => {
        this.state.categoryFilter = cat.id;
        this._renderCatalog();
      });
      chipWrap.appendChild(b);
    }

    const activeSet = new Set(this.state.activeModIds);
    const q = this.state.searchQuery.trim().toLowerCase();
    const filtered = MOD_CATALOG.filter((m) => {
      if (this.state.categoryFilter !== 'all' && m.category !== this.state.categoryFilter) return false;
      if (!q) return true;
      const hay = `${m.id} ${m.name.tr} ${m.name.en} ${m.summary.tr} ${m.summary.en} ${m.category}`.toLowerCase();
      return hay.includes(q);
    });

    const list = $('mod-list');
    list.innerHTML = '';
    for (const mod of filtered) {
      const installed = activeSet.has(mod.id);
      const card = document.createElement('div');
      card.className = `mod-card ${installed ? 'installed' : ''}`;
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-pressed', String(installed));
      card.dataset.modId = mod.id;

      const tags = [];
      if (mod.mass.x) tags.push(`<span class="tag ${mod.mass.x < 0 ? 'tag-good' : 'tag-warn'}">${mod.mass.x > 0 ? '+' : ''}${mod.mass.x}g X</span>`);
      if (mod.perf.flowFloor) tags.push(`<span class="tag tag-good">${mod.perf.flowFloor} mm³/s</span>`);
      if (mod.perf.coolingPaDelta) tags.push(`<span class="tag tag-good">+${mod.perf.coolingPaDelta} Pa</span>`);
      if (mod.perf.chamberDelta) tags.push(`<span class="tag tag-good">${mod.perf.chamberDelta > 0 ? '+' : ''}${mod.perf.chamberDelta}°C</span>`);
      if (mod.perf.noiseDba) tags.push(`<span class="tag ${mod.perf.noiseDba < 0 ? 'tag-good' : 'tag-warn'}">${mod.perf.noiseDba > 0 ? '+' : ''}${mod.perf.noiseDba} dBA</span>`);
      if (mod.perf.costUsd) tags.push(`<span class="tag tag-cost">$${mod.perf.costUsd}</span>`);

      card.innerHTML = `
        <div class="mod-card-top">
          <div class="mod-name">${escapeHtml(mod.name[lang] || mod.name.en)}</div>
          <span class="toggle-pill">${installed ? 'ON' : 'OFF'}</span>
        </div>
        <div class="mod-summary">${escapeHtml(mod.summary[lang] || mod.summary.en)}</div>
        <div class="mod-tags">${tags.join('')}</div>
      `;
      const handler = () => this.toggleMod(mod.id);
      card.addEventListener('click', handler);
      card.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); handler(); }
      });
      list.appendChild(card);
    }
  }

  _renderPrintersAndPresets() {
    const lang = this.settings.lang;
    const pList = $('printer-list');
    pList.innerHTML = '';
    for (const p of PRINTER_PLATFORMS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `printer-item ${this.state.printerId === p.id ? 'active' : ''}`;
      btn.innerHTML = `
        <div class="row-between"><strong>${escapeHtml(p.name)}</strong><span class="tag mono">${p.kinematics.toUpperCase()}</span></div>
        <span class="small-muted">${escapeHtml(p.tagline[lang] || p.tagline.en)}</span>
      `;
      btn.addEventListener('click', () => this.setPrinter(p.id));
      pList.appendChild(btn);
    }

    $('custom-dims-card').hidden = this.state.printerId !== 'custom-scratch';
    $('custom-vol-x').value = this.state.customDims.x;
    $('custom-vol-y').value = this.state.customDims.y;
    $('custom-vol-z').value = this.state.customDims.z;
    $('custom-kinematics').value = this.state.customDims.kinematics;

    const preList = $('preset-list');
    preList.innerHTML = '';
    for (const pre of BUILD_PRESETS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'preset-item';
      btn.dataset.presetId = pre.id;
      btn.innerHTML = `
        <div class="row-between"><strong>${escapeHtml(pre.name[lang] || pre.name.en)}</strong><span class="tag mono">${pre.mods.length} mods</span></div>
        <span class="small-muted">${escapeHtml(pre.desc[lang] || pre.desc.en)}</span>
      `;
      btn.addEventListener('click', () => this.applyPreset(pre.id));
      preList.appendChild(btn);
    }
  }

  _renderDemoParts() {
    const lang = this.settings.lang;
    const wrap = $('demo-parts-list');
    wrap.innerHTML = '';
    for (const d of DEMO_SOLIDCRAFT_PARTS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'demo-btn';
      btn.dataset.demoPart = d.id;
      btn.innerHTML = `<span>+ ${escapeHtml(d.label[lang] || d.label.en)}</span><small class="mono">${d.defaultHardpoint}</small>`;
      btn.addEventListener('click', () => this.addDemoSolidCraftPart(d.id));
      wrap.appendChild(btn);
    }
  }

  _renderMountedPartsList() {
    const wrap = $('mounted-parts-list');
    wrap.innerHTML = '';
    if (this.state.customParts.length === 0) {
      wrap.innerHTML = `<p class="hint-text">${escapeHtml(t(this.settings.lang, 'noCustomParts'))}</p>`;
      return;
    }
    for (const part of this.state.customParts) {
      const massG = Math.round(computeCustomPartMassG(part));
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `mounted-item ${this.state.selectedPartId === part.id ? 'active' : ''}`;
      btn.innerHTML = `
        <div class="row-between"><strong class="mono">${escapeHtml(part.name)}</strong><span class="tag">${massG}g</span></div>
        <span class="small-muted mono">${part.zone} • ${part.sizeMm.join('×')}mm</span>
      `;
      btn.addEventListener('click', () => this.selectPart(part.id));
      wrap.appendChild(btn);
    }
  }

  _renderIdeasList() {
    const lang = this.settings.lang;
    const wrap = $('ideas-list');
    wrap.innerHTML = '';
    for (const idea of MAKER_SOLIDCRAFT_IDEAS) {
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `
        <div class="row-between"><strong>${escapeHtml(idea.name[lang] || idea.name.en)}</strong><span class="tag mono">${idea.material.toUpperCase()}</span></div>
        <div class="small-muted" style="margin:4px 0">${escapeHtml(idea.benefit[lang] || idea.benefit.en)}</div>
        <div class="small-muted mono" style="margin-bottom:8px">${idea.dims} • ${idea.hardpoint}</div>
        <div class="btn-row">
          <button type="button" class="btn btn-secondary btn-sm js-idea-mcp">${escapeHtml(t(lang, 'btnSendToMcp'))}</button>
          <button type="button" class="btn btn-primary btn-sm js-idea-render">${escapeHtml(t(lang, 'btnRenderConcept'))}</button>
        </div>
      `;
      card.querySelector('.js-idea-mcp').addEventListener('click', () => {
        $('mcp-hp-select').value = idea.hardpoint;
        $('mcp-brief').value = idea.prompt;
        this._updateMcpPreview();
        this._switchLeftTab('solidcraft');
      });
      card.querySelector('.js-idea-render').addEventListener('click', () => {
        $('render-style-select').value = 'concept-part';
        $('render-prompt').value = idea.prompt;
        this._switchRightTab('gemini');
        if (window.innerWidth <= 960) this._setMobileView('gemini');
      });
      wrap.appendChild(card);
    }
  }

  _updateMcpPreview() {
    const spec = buildSolidCraftMCPSpec(
      this.getActivePrinter(),
      $('mcp-hp-select').value || 'toolhead-front',
      $('mcp-brief').value || '',
    );
    $('mcp-preview').textContent = spec.mcpPrompt;
    this._latestMcpSpec = spec;
  }

  // ==================== PART INSPECTOR & GIZMO BAR ====================
  _renderPartInspector() {
    const part = this.state.customParts.find((p) => p.id === this.state.selectedPartId);
    $('part-empty-state').hidden = Boolean(part);
    $('part-editor').hidden = !part;
    if (!part) return;

    const massG = computeCustomPartMassG(part);
    $('pe-name').textContent = part.name;
    $('pe-format').textContent = part.format || 'STL';
    $('pe-metrology').innerHTML = `
      <div class="metrology-cell"><span>Mass</span><strong>${massG.toFixed(1)} g</strong></div>
      <div class="metrology-cell"><span>Volume</span><strong>${part.volumeCm3} cm³</strong></div>
      <div class="metrology-cell"><span>Dimensions</span><strong>${part.sizeMm.join('×')} mm</strong></div>
      <div class="metrology-cell"><span>Triangles / >45°</span><strong>${part.triCount.toLocaleString()} / ${part.overhangPct}%</strong></div>
    `;
    $('pe-zone').value = part.zone;
    $('pe-snap-hp').value = part.hardpointId || 'toolhead-front';
    $('pe-material').value = part.materialId || 'petg';
    $('pe-color').value = part.colorHex || '#f06a28';
    $('pe-infill').value = part.infillPct ?? 35;
    $('pe-infill-val').textContent = `${part.infillPct ?? 35}%`;
    $('pe-px').value = part.pos[0];
    $('pe-py').value = part.pos[1];
    $('pe-pz').value = part.pos[2];
    $('pe-rx').value = part.rot[0];
    $('pe-ry').value = part.rot[1];
    $('pe-rz').value = part.rot[2];
    $('pe-sx').value = part.scale[0];
    $('pe-sy').value = part.scale[1];
    $('pe-sz').value = part.scale[2];
  }

  _syncGizmoBar() {
    const part = this.state.customParts.find((p) => p.id === this.state.selectedPartId);
    const bar = $('gizmo-bar');
    bar.hidden = !part;
    if (part) {
      $('gizmo-part-name').textContent = part.name;
    }
    for (const btn of bar.querySelectorAll('[data-gizmo-mode]')) {
      btn.classList.toggle('active', btn.dataset.gizmoMode === this.gizmo.mode);
    }
  }

  // ==================== GEMINI AI STUDIO HANDLERS ====================
  async _runAudit(forceOffline = false) {
    const status = $('audit-status');
    const out = $('audit-output');
    const recWrap = $('audit-rec-mods');
    const apiKey = $('gemini-api-key').value.trim();

    if (forceOffline || (!apiKey && !this.settings.useProxy)) {
      const res = buildOfflineEngineeringAudit(
        this.getActivePrinter(),
        this.state.activeModIds,
        this.state.customParts,
        this.evalResult,
        this.settings.lang,
      );
      status.textContent = res.model;
      out.innerHTML = renderSafeMarkdown(res.markdown);
      this._renderRecommendedModButtons(recWrap, res.recommendedMods);
      return;
    }

    const btn = $('btn-run-gemini-audit');
    btn.disabled = true;
    status.textContent = this.settings.lang === 'tr' ? '3D görüntü yakalanıyor ve Gemini analiz ediyor...' : 'Capturing 3D viewport & analyzing with Gemini...';
    try {
      const snapshotDataUrl = this._captureViewportPng();
      const res = await evaluateBuildWithGemini({
        apiKey,
        model: $('gemini-text-model').value,
        lang: this.settings.lang,
        printer: this.getActivePrinter(),
        activeModIds: this.state.activeModIds,
        customParts: this.state.customParts,
        evalResult: this.evalResult,
        snapshotDataUrl,
        useProxy: this.settings.useProxy,
      });
      status.textContent = `✓ ${res.model}`;
      out.innerHTML = renderSafeMarkdown(res.markdown);
      this._renderRecommendedModButtons(recWrap, res.recommendedMods);
    } catch (err) {
      status.textContent = `⚠ ${err.message}`;
      const fallback = buildOfflineEngineeringAudit(
        this.getActivePrinter(),
        this.state.activeModIds,
        this.state.customParts,
        this.evalResult,
        this.settings.lang,
      );
      out.innerHTML = renderSafeMarkdown(fallback.markdown);
      this._renderRecommendedModButtons(recWrap, fallback.recommendedMods);
    } finally {
      btn.disabled = false;
    }
  }

  _renderRecommendedModButtons(container, modIds) {
    container.innerHTML = '';
    const lang = this.settings.lang;
    for (const id of modIds || []) {
      const mod = MOD_BY_ID.get(id);
      if (!mod) continue;
      const installed = this.state.activeModIds.includes(id);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'rec-mod-btn';
      b.textContent = installed
        ? `✓ ${mod.name[lang] || mod.name.en}`
        : `+ ${mod.name[lang] || mod.name.en}`;
      b.disabled = installed;
      b.addEventListener('click', () => {
        this.toggleMod(id, true);
        b.textContent = `✓ ${mod.name[lang] || mod.name.en}`;
        b.disabled = true;
      });
      container.appendChild(b);
    }
  }

  async _generate3DImage() {
    const apiKey = $('gemini-api-key').value.trim();
    const status = $('render-status');
    const styleId = $('render-style-select').value;
    const customPrompt = $('render-prompt').value.trim();

    if (!apiKey && !this.settings.useProxy) {
      status.textContent = this.settings.lang === 'tr'
        ? '3D görsel üretimi için üstteki alana Gemini API anahtarını gir (ücretsiz AI Studio anahtarı çalışır).'
        : 'Enter a Gemini API key above to generate AI 3D studio renders.';
      return;
    }

    const btn = $('btn-gen-3d-image');
    btn.disabled = true;
    status.textContent = this.settings.lang === 'tr'
      ? 'Gemini 3D görsel oluşturuyor (10–25sn)...'
      : 'Generating Gemini 3D visual (10–25s)...';

    try {
      const snapshotDataUrl = this._captureViewportPng();
      const res = await generate3DRenderWithGemini({
        apiKey,
        imageModel: $('gemini-image-model').value,
        lang: this.settings.lang,
        styleId,
        customPrompt,
        printer: this.getActivePrinter(),
        activeModIds: this.state.activeModIds,
        customParts: this.state.customParts,
        snapshotDataUrl,
        useProxy: this.settings.useProxy,
      });

      const item = {
        id: `render_${Date.now()}`,
        imageDataUrl: res.imageDataUrl,
        caption: res.caption || `${this.getActivePrinter().name} • ${styleId}`,
        model: res.model,
        createdAt: Date.now(),
      };
      this.renderGallery.unshift(item);
      await saveRenderToGallery(item);
      this._showLatestRender(item);
      this._renderGalleryUI();
      status.textContent = `✓ ${res.model}`;
    } catch (err) {
      status.textContent = `⚠ ${err.message}`;
    } finally {
      btn.disabled = false;
    }
  }

  _showLatestRender(item) {
    const wrap = $('render-latest');
    wrap.hidden = false;
    wrap.innerHTML = `
      <img src="${item.imageDataUrl}" alt="${escapeHtml(item.caption)}" />
      <div class="row-between" style="margin-top:6px">
        <span class="small-muted">${escapeHtml(item.caption.slice(0, 64))}</span>
        <a class="btn btn-secondary btn-sm" href="${item.imageDataUrl}" download="${item.id}.png">PNG</a>
      </div>
    `;
    wrap.querySelector('img').addEventListener('click', () => this._openLightbox(item));
  }

  _renderGalleryUI() {
    const wrap = $('render-gallery-wrap');
    const grid = $('render-gallery');
    if (this.renderGallery.length === 0) {
      wrap.hidden = true;
      return;
    }
    wrap.hidden = false;
    grid.innerHTML = '';
    for (const item of this.renderGallery.slice(0, 9)) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'gallery-thumb';
      btn.title = item.caption;
      btn.innerHTML = `<img src="${item.imageDataUrl}" alt="${escapeHtml(item.caption)}" />`;
      btn.addEventListener('click', () => this._openLightbox(item));
      grid.appendChild(btn);
    }
  }

  _openLightbox(item) {
    $('lightbox-img').src = item.imageDataUrl;
    $('lightbox-caption').textContent = item.caption;
    $('lightbox-dl').href = item.imageDataUrl;
    $('lightbox-dl').download = `${item.id}.png`;
    $('lightbox-modal').hidden = false;
  }

  async _sendChat(text) {
    const msg = text.trim();
    if (!msg) return;
    const log = $('chat-log');
    const userDiv = document.createElement('div');
    userDiv.className = 'chat-msg chat-user';
    userDiv.textContent = msg;
    log.appendChild(userDiv);
    log.scrollTop = log.scrollHeight;

    const apiKey = $('gemini-api-key').value.trim();
    const aiDiv = document.createElement('div');
    aiDiv.className = 'chat-msg chat-ai';
    aiDiv.textContent = '...';
    log.appendChild(aiDiv);

    if (!apiKey && !this.settings.useProxy) {
      const off = buildOfflineEngineeringAudit(
        this.getActivePrinter(), this.state.activeModIds, this.state.customParts, this.evalResult, this.settings.lang,
      );
      aiDiv.innerHTML = renderSafeMarkdown(off.markdown);
      log.scrollTop = log.scrollHeight;
      return;
    }

    try {
      const res = await chatWithEngineer({
        apiKey,
        model: $('gemini-text-model').value,
        lang: this.settings.lang,
        history: this.chatHistory,
        message: msg,
        printer: this.getActivePrinter(),
        activeModIds: this.state.activeModIds,
        customParts: this.state.customParts,
        evalResult: this.evalResult,
        snapshotDataUrl: this._captureViewportPng(),
        useProxy: this.settings.useProxy,
      });
      this.chatHistory.push({ role: 'user', text: msg }, { role: 'assistant', text: res.text });
      aiDiv.innerHTML = renderSafeMarkdown(res.text);
      if (res.recommendedMods.length > 0) {
        const recRow = document.createElement('div');
        recRow.className = 'rec-mods-row';
        this._renderRecommendedModButtons(recRow, res.recommendedMods);
        aiDiv.appendChild(recRow);
      }
    } catch (err) {
      aiDiv.textContent = `⚠ ${err.message}`;
    }
    log.scrollTop = log.scrollHeight;
  }

  // ==================== UI TABS, THEME, LANGUAGE, EXPORTS ====================
  _switchLeftTab(tabId) {
    this.state.leftTab = tabId;
    for (const b of document.querySelectorAll('[data-left-tab]')) {
      const act = b.dataset.leftTab === tabId;
      b.classList.toggle('active', act);
      b.setAttribute('aria-selected', String(act));
    }
    for (const id of ['catalog', 'printers', 'solidcraft', 'ideas']) {
      $(`panel-${id}`).hidden = id !== tabId;
    }
  }

  _switchRightTab(tabId) {
    this.state.rightTab = tabId;
    for (const b of document.querySelectorAll('[data-right-tab]')) {
      const act = b.dataset.rightTab === tabId;
      b.classList.toggle('active', act);
      b.setAttribute('aria-selected', String(act));
    }
    for (const id of ['telemetry', 'part', 'gemini']) {
      $(`panel-${id}`).hidden = id !== tabId;
    }
  }

  _setMobileView(view) {
    this.state.mobileView = view;
    for (const b of document.querySelectorAll('[data-mobile-view]')) {
      b.classList.toggle('active', b.dataset.mobileView === view);
    }
    $('dock-left').classList.toggle('mobile-open', view === 'left');
    $('dock-right').classList.toggle('mobile-open', view === 'telemetry' || view === 'gemini');
    if (view === 'telemetry') this._switchRightTab('telemetry');
    if (view === 'gemini') this._switchRightTab('gemini');
    if (view === 'scene') this._handleResize();
  }

  _applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = theme === 'light' ? '#f1f2ef' : '#121418';
    this.requestRender();
  }

  _applyLanguage(lang) {
    document.documentElement.lang = lang;
    $('btn-lang').textContent = lang.toUpperCase();
    for (const el of document.querySelectorAll('[data-i18n]')) {
      el.textContent = t(lang, el.dataset.i18n);
    }
    $('mod-search').placeholder = t(lang, 'searchModsPlaceholder');
    $('mcp-brief').placeholder = t(lang, 'mcpBriefPlaceholder');
    $('gemini-api-key').placeholder = t(lang, 'apiKeyPlaceholder');
    $('render-prompt').placeholder = t(lang, 'renderPromptPlaceholder');
    $('chat-input').placeholder = t(lang, 'chatPlaceholder');
    this._populateStaticSelectors();
    if (this.evalResult) this._recomputePhysicsAndUI();
  }

  _openExportModal() {
    const cfg = generateKlipperConfig(this.getActivePrinter(), this.state.activeModIds, this.evalResult);
    $('klipper-preview').value = cfg;
    $('export-modal').hidden = false;
  }

  _downloadFile(content, fileName, mime) {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  }

  async _copyText(txt) {
    try {
      await navigator.clipboard.writeText(txt);
      this.toast(t(this.settings.lang, 'toastCopied'));
    } catch {
      this.toast(t(this.settings.lang, 'toastCopied'));
    }
  }

  toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
  }

  // ==================== EVENT BINDINGS ====================
  _bindEvents() {
    // Top bar printer & cameras
    $('quick-printer-select').addEventListener('change', (e) => this.setPrinter(e.target.value));
    for (const btn of document.querySelectorAll('[data-cam]')) {
      btn.addEventListener('click', () => {
        this.camera.setPreset(btn.dataset.cam, this.getActivePrinter());
        this.requestRender();
      });
    }

    // Viewport simulation toggles
    const bindToggle = (id, key) => {
      const btn = $(id);
      btn.addEventListener('click', () => {
        this.state[key] = !this.state[key];
        btn.setAttribute('aria-pressed', String(this.state[key]));
        this.requestRender();
      });
    };
    bindToggle('btn-toggle-motion', 'simRunning');
    bindToggle('btn-toggle-airflow', 'showAirflow');
    bindToggle('btn-toggle-thermal', 'thermalMode');
    bindToggle('btn-toggle-hardpoints', 'showHardpoints');

    // Undo / Redo / Theme / Lang / Export
    $('btn-undo').addEventListener('click', () => this.undo());
    $('btn-redo').addEventListener('click', () => this.redo());
    $('btn-open-export').addEventListener('click', () => this._openExportModal());
    $('btn-close-export').addEventListener('click', () => { $('export-modal').hidden = true; });
    $('btn-close-lightbox').addEventListener('click', () => { $('lightbox-modal').hidden = true; });
    $('btn-lang').addEventListener('click', () => {
      const next = this.settings.lang === 'tr' ? 'en' : 'tr';
      this.settings = saveSettings({ lang: next });
      this._applyLanguage(next);
    });
    $('btn-theme').addEventListener('click', () => {
      const next = this.settings.theme === 'dark' ? 'light' : 'dark';
      this.settings = saveSettings({ theme: next });
      this._applyTheme(next);
    });

    // Dock tabs & mobile bottom nav
    for (const b of document.querySelectorAll('[data-left-tab]')) {
      b.addEventListener('click', () => this._switchLeftTab(b.dataset.leftTab));
    }
    for (const b of document.querySelectorAll('[data-right-tab]')) {
      b.addEventListener('click', () => this._switchRightTab(b.dataset.rightTab));
    }
    for (const b of document.querySelectorAll('[data-mobile-view]')) {
      b.addEventListener('click', () => this._setMobileView(b.dataset.mobileView));
    }

    // Catalog search & clear
    $('mod-search').addEventListener('input', (e) => {
      this.state.searchQuery = e.target.value;
      this._renderCatalog();
    });
    $('btn-clear-mods').addEventListener('click', () => {
      this._pushUndo();
      this.state.activeModIds = [];
      this._persistBuild();
      this._rebuildPrinterGeometry();
      this._recomputePhysicsAndUI();
    });

    // Custom scratch-build dims
    const onCustomDim = () => {
      this.state.customDims = {
        x: Number($('custom-vol-x').value) || 280,
        y: Number($('custom-vol-y').value) || 280,
        z: Number($('custom-vol-z').value) || 280,
        kinematics: $('custom-kinematics').value,
      };
      this._persistBuild();
      this._rebuildPrinterGeometry();
      this._recomputePhysicsAndUI();
    };
    for (const id of ['custom-vol-x', 'custom-vol-y', 'custom-vol-z', 'custom-kinematics']) {
      $(id).addEventListener('change', onCustomDim);
    }

    // SolidCraft CAD Dropzone & File Picker
    const dz = $('cad-dropzone');
    const fi = $('cad-file-input');
    $('btn-choose-cad').addEventListener('click', (e) => { e.stopPropagation(); fi.click(); });
    dz.addEventListener('click', () => fi.click());
    dz.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fi.click(); } });
    fi.addEventListener('change', async () => {
      for (const f of fi.files || []) await this.importCADFile(f);
      fi.value = '';
    });
    $('btn-close-sc-card').addEventListener('click', () => { $('sc-archive-card').hidden = true; });

    // Global Window Drag-and-Drop
    const overlay = $('global-drop-overlay');
    let dragDepth = 0;
    window.addEventListener('dragenter', (e) => {
      e.preventDefault();
      dragDepth++;
      overlay.hidden = false;
    });
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('dragleave', () => {
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) overlay.hidden = true;
    });
    window.addEventListener('drop', async (e) => {
      e.preventDefault();
      dragDepth = 0;
      overlay.hidden = true;
      for (const f of e.dataTransfer?.files || []) await this.importCADFile(f);
    });

    // Clipboard Ctrl+V CAD Paste (Files or ASCII STL/OBJ text)
    window.addEventListener('paste', async (e) => {
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
      const files = e.clipboardData?.files;
      if (files && files.length > 0) {
        for (const f of files) await this.importCADFile(f);
        return;
      }
      const txt = e.clipboardData?.getData('text/plain') || '';
      if (txt.includes('facet normal') || txt.includes('\nv ')) {
        const ext = txt.includes('facet normal') ? 'stl' : 'obj';
        await this.importCADFile(new File([txt], `pasted_cad.${ext}`));
      }
    });

    // SolidCraft MCP Prompt Generator
    $('mcp-hp-select').addEventListener('change', () => this._updateMcpPreview());
    $('mcp-brief').addEventListener('input', () => this._updateMcpPreview());
    $('btn-copy-mcp-prompt').addEventListener('click', () => this._copyText(this._latestMcpSpec?.mcpPrompt || ''));
    $('btn-copy-mcp-batch').addEventListener('click', () => this._copyText(this._latestMcpSpec?.mcpExportBatch || ''));

    // Part Editor controls
    const editPart = (fn) => {
      const part = this.state.customParts.find((p) => p.id === this.state.selectedPartId);
      if (!part) return;
      fn(part);
      this._recomputePhysicsAndUI();
      this.requestRender();
    };
    $('pe-zone').addEventListener('change', (e) => editPart((p) => { p.zone = e.target.value; }));
    $('btn-snap-part').addEventListener('click', () => editPart((p) => {
      const hpId = $('pe-snap-hp').value;
      const hp = MOUNT_HARDPOINTS.find((h) => h.id === hpId);
      const pose = getHardpointPose(this.getActivePrinter(), hpId, this.motionOffset);
      p.hardpointId = hpId;
      if (hp) p.zone = hp.zone;
      p.pos = pose.pos.map((v) => Number(v.toFixed(1)));
      p.rot = [...pose.rot];
    }));
    $('pe-material').addEventListener('change', (e) => editPart((p) => {
      const mat = MATERIAL_BY_ID.get(e.target.value);
      p.materialId = e.target.value;
      if (mat) {
        p.colorHex = mat.color;
        p.metal = mat.printable ? 0.16 : 0.78;
        p.rough = mat.printable ? 0.48 : 0.26;
      }
    }));
    $('pe-color').addEventListener('input', (e) => editPart((p) => { p.colorHex = e.target.value; }));
    $('pe-infill').addEventListener('input', (e) => editPart((p) => { p.infillPct = Number(e.target.value); }));

    const bindNum = (id, key, idx) => {
      $(id).addEventListener('input', (e) => editPart((p) => {
        const v = parseFloat(e.target.value);
        if (Number.isFinite(v)) p[key][idx] = v;
      }));
    };
    bindNum('pe-px', 'pos', 0); bindNum('pe-py', 'pos', 1); bindNum('pe-pz', 'pos', 2);
    bindNum('pe-rx', 'rot', 0); bindNum('pe-ry', 'rot', 1); bindNum('pe-rz', 'rot', 2);
    bindNum('pe-sx', 'scale', 0); bindNum('pe-sy', 'scale', 1); bindNum('pe-sz', 'scale', 2);

    $('btn-mirror-part').addEventListener('click', () => editPart((p) => {
      p.pos[0] = Number((-p.pos[0]).toFixed(1));
      p.scale[0] = Number((-p.scale[0]).toFixed(2));
    }));
    $('btn-dup-part').addEventListener('click', () => {
      const orig = this.state.customParts.find((p) => p.id === this.state.selectedPartId);
      const mesh = orig ? this.partMeshes.get(orig.id) : null;
      if (!orig || !mesh) return;
      this._pushUndo();
      const id = `part_${Date.now()}`;
      const copy = JSON.parse(JSON.stringify(orig));
      copy.id = id;
      copy.name = `${orig.name.replace(/\.[^.]+$/, '')}_copy`;
      copy.pos[0] += 35;
      this.partMeshes.set(id, mesh);
      this.renderer.uploadCustomPart(id, mesh);
      this.state.customParts.push(copy);
      this.selectPart(id);
      this._recomputePhysicsAndUI();
    });
    $('btn-del-part').addEventListener('click', () => this.deletePart(this.state.selectedPartId));
    $('btn-gizmo-delete').addEventListener('click', () => this.deletePart(this.state.selectedPartId));
    for (const b of document.querySelectorAll('[data-gizmo-mode]')) {
      b.addEventListener('click', () => {
        this.gizmo.mode = b.dataset.gizmoMode;
        this._syncGizmoBar();
        this.requestRender();
      });
    }

    // Gemini API Controls
    $('btn-save-key').addEventListener('click', () => {
      this.settings = saveSettings({
        apiKey: $('gemini-api-key').value.trim(),
        textModel: $('gemini-text-model').value,
        imageModel: $('gemini-image-model').value,
      });
      this.toast(t(this.settings.lang, 'toastKeySaved'));
    });
    $('btn-clear-key').addEventListener('click', () => {
      $('gemini-api-key').value = '';
      this.settings = saveSettings({ apiKey: '' });
      this.toast(t(this.settings.lang, 'toastKeyCleared'));
    });
    $('gemini-text-model').addEventListener('change', (e) => { this.settings = saveSettings({ textModel: e.target.value }); });
    $('gemini-image-model').addEventListener('change', (e) => { this.settings = saveSettings({ imageModel: e.target.value }); });
    $('btn-run-gemini-audit').addEventListener('click', () => this._runAudit(false));
    $('btn-run-offline-audit').addEventListener('click', () => this._runAudit(true));
    $('btn-gen-3d-image').addEventListener('click', () => this._generate3DImage());
    $('chat-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const inp = $('chat-input');
      const txt = inp.value;
      inp.value = '';
      this._sendChat(txt);
    });

    // Export modal actions
    $('btn-copy-klipper').addEventListener('click', () => this._copyText($('klipper-preview').value));
    $('btn-dl-klipper').addEventListener('click', () => this._downloadFile($('klipper-preview').value, `3dich_${this.state.printerId}_printer.cfg`, 'text/plain'));
    $('btn-dl-png').addEventListener('click', () => {
      const dataUrl = this._captureViewportPng();
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `3dich_${this.state.printerId}.png`;
      a.click();
    });
    $('btn-dl-bom').addEventListener('click', () => {
      const rows = ['Category,Mod Name,Cost USD,X Mass Delta (g),Power (W),Difficulty'];
      for (const id of this.state.activeModIds) {
        const m = MOD_BY_ID.get(id);
        if (!m) continue;
        rows.push(`"${m.category}","${m.name.en}",${m.perf.costUsd || 0},${m.mass.x || 0},${m.perf.powerW || 0},${m.perf.difficulty || 1}`);
      }
      this._downloadFile(rows.join('\n'), `3dich_${this.state.printerId}_BOM.csv`, 'text/csv');
    });
    $('btn-dl-json').addEventListener('click', () => {
      const dump = JSON.stringify({
        app: '3dich',
        version: '1.0.0',
        printerId: this.state.printerId,
        customDims: this.state.customDims,
        activeModIds: this.state.activeModIds,
        frameFinishId: this.state.frameFinishId,
        accentColorId: this.state.accentColorId,
      }, null, 2);
      this._downloadFile(dump, `3dich_${this.state.printerId}_build.json`, 'application/json');
    });
    $('btn-import-json').addEventListener('click', () => $('project-json-input').click());
    $('project-json-input').addEventListener('change', async (e) => {
      const f = e.target.files?.[0];
      if (!f) return;
      try {
        const obj = JSON.parse(await f.text());
        this._pushUndo();
        if (PRINTER_BY_ID.has(obj.printerId)) this.state.printerId = obj.printerId;
        if (Array.isArray(obj.activeModIds)) this.state.activeModIds = obj.activeModIds.filter((id) => MOD_BY_ID.has(id));
        if (obj.frameFinishId) this.state.frameFinishId = obj.frameFinishId;
        if (obj.accentColorId) this.state.accentColorId = obj.accentColorId;
        if (obj.customDims) this.state.customDims = obj.customDims;
        this._persistBuild();
        this._rebuildPrinterGeometry();
        this._recomputePhysicsAndUI();
        $('export-modal').hidden = true;
      } catch (err) {
        this.toast(`Invalid JSON: ${err.message}`);
      }
    });
    $('btn-dl-stl').addEventListener('click', () => {
      if (this.state.customParts.length === 0) {
        this.toast(t(this.settings.lang, 'noCustomParts'));
        return;
      }
      // Combine all mounted custom parts into one transformed Binary STL
      let totalFloats = 0;
      for (const p of this.state.customParts) totalFloats += (this.partMeshes.get(p.id)?.positions.length || 0);
      const merged = new Float32Array(totalFloats);
      let off = 0;
      for (const p of this.state.customParts) {
        const m = this.partMeshes.get(p.id);
        if (!m) continue;
        for (let i = 0; i < m.positions.length; i += 3) {
          merged[off++] = m.positions[i] * p.scale[0] + p.pos[0];
          merged[off++] = m.positions[i + 1] * p.scale[1] + p.pos[1];
          merged[off++] = m.positions[i + 2] * p.scale[2] + p.pos[2];
        }
      }
      const stlBuf = exportBinarySTL(merged, `3dich_${this.state.printerId}_custom_parts`);
      this._downloadFile(new Blob([stlBuf]), `3dich_${this.state.printerId}_parts.stl`, 'application/octet-stream');
    });

    // Pointer / Touch / Wheel Controls on 3D Canvas
    this._bindCanvasControls();

    // Global Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
        if (e.key === 'Escape') document.activeElement.blur();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) this.redo(); else this.undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault(); this.redo(); return;
      }
      if (e.key === 'Escape') {
        $('export-modal').hidden = true;
        $('lightbox-modal').hidden = true;
        return;
      }
      if (e.key === ' ') {
        e.preventDefault();
        $('btn-toggle-motion').click();
      } else if (e.key === '1') { this.camera.setPreset('iso', this.getActivePrinter()); this.requestRender(); }
      else if (e.key === '2') { this.camera.setPreset('front', this.getActivePrinter()); this.requestRender(); }
      else if (e.key === '3') { this.camera.setPreset('side', this.getActivePrinter()); this.requestRender(); }
      else if (e.key === '4') { this.camera.setPreset('top', this.getActivePrinter()); this.requestRender(); }
      else if (e.key === '5') { this.camera.setPreset('toolhead', this.getActivePrinter()); this.requestRender(); }
      else if (e.key.toLowerCase() === 'f') { this.camera.framePrinter(this.getActivePrinter(), false); this.requestRender(); }
      else if (e.key.toLowerCase() === 'g' && this.state.selectedPartId) { this.gizmo.mode = 'translate'; this._syncGizmoBar(); this.requestRender(); }
      else if (e.key.toLowerCase() === 'r' && this.state.selectedPartId) { this.gizmo.mode = 'rotate'; this._syncGizmoBar(); this.requestRender(); }
      else if (e.key.toLowerCase() === 's' && this.state.selectedPartId) { this.gizmo.mode = 'scale'; this._syncGizmoBar(); this.requestRender(); }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && this.state.selectedPartId) { this.deletePart(this.state.selectedPartId); }
    });
  }

  _bindCanvasControls() {
    const canvas = $('viewport-canvas');
    const pointers = new Map();
    let mode = null; // 'orbit' | 'pan' | 'gizmo'
    let lastX = 0, lastY = 0, downX = 0, downY = 0;
    let prevPinchDist = 0;

    const getRay = (clientX, clientY) => {
      const rect = canvas.getBoundingClientRect();
      const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
      const ndcY = 1 - ((clientY - rect.top) / rect.height) * 2;
      return this.camera.screenToRay(ndcX, ndcY);
    };

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      lastX = downX = e.clientX;
      lastY = downY = e.clientY;

      if (pointers.size === 2) {
        const pts = [...pointers.values()];
        prevPinchDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        mode = 'pinch';
        return;
      }

      const ray = getRay(e.clientX, e.clientY);
      const selPart = this.state.customParts.find((p) => p.id === this.state.selectedPartId);
      if (selPart && e.button === 0) {
        const ax = this.gizmo.hitTestAxis(ray, selPart.pos, this.camera, e.pointerType === 'touch');
        if (ax) {
          this._pushUndo();
          this.gizmo.beginDrag(ax, ray, selPart, e.clientX, e.clientY);
          mode = 'gizmo';
          this.requestRender();
          return;
        }
      }
      mode = (e.button === 2 || e.button === 1 || e.shiftKey) ? 'pan' : 'orbit';
    });

    canvas.addEventListener('pointermove', (e) => {
      if (pointers.has(e.pointerId)) {
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }
      if (pointers.size === 2 && mode === 'pinch') {
        const pts = [...pointers.values()];
        const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        if (prevPinchDist > 0) this.camera.zoom((prevPinchDist - dist) * 4.5);
        prevPinchDist = dist;
        this.requestRender();
        return;
      }
      if (mode === 'gizmo') {
        const selPart = this.state.customParts.find((p) => p.id === this.state.selectedPartId);
        const ray = getRay(e.clientX, e.clientY);
        if (this.gizmo.updateDrag(ray, selPart, e.clientX, e.clientY, e.shiftKey)) {
          this._recomputePhysicsAndUI();
        }
        return;
      }
      if (mode === 'orbit') {
        this.camera.orbit(e.clientX - lastX, e.clientY - lastY);
        lastX = e.clientX; lastY = e.clientY;
        this.requestRender();
      } else if (mode === 'pan') {
        this.camera.pan(e.clientX - lastX, e.clientY - lastY);
        lastX = e.clientX; lastY = e.clientY;
        this.requestRender();
      } else if (this.state.selectedPartId) {
        // Lightweight hover highlight on gizmo axis
        const selPart = this.state.customParts.find((p) => p.id === this.state.selectedPartId);
        if (selPart) {
          const ax = this.gizmo.hitTestAxis(getRay(e.clientX, e.clientY), selPart.pos, this.camera, false);
          if (ax !== this.gizmo.hoverAxis) {
            this.gizmo.hoverAxis = ax;
            canvas.style.cursor = ax ? 'pointer' : 'grab';
            this.requestRender();
          }
        }
      }
    });

    const onPointerEnd = (e) => {
      pointers.delete(e.pointerId);
      const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
      if (mode === 'gizmo') {
        this.gizmo.endDrag();
        this.requestRender();
      } else if (moved < 5 && e.button === 0 && this.state.customParts.length > 0) {
        const hitId = this.gizmo.pickCustomPart(getRay(e.clientX, e.clientY), this.state.customParts);
        if (hitId !== this.state.selectedPartId) {
          this.selectPart(hitId);
        }
      }
      if (pointers.size === 0) mode = null;
    };
    canvas.addEventListener('pointerup', onPointerEnd);
    canvas.addEventListener('pointercancel', onPointerEnd);

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.camera.zoom(e.deltaY);
      this.requestRender();
    }, { passive: false });
  }
}

new App3dich();
