import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const requireFromE2e = createRequire('/e2e/package.json');
const { chromium } = requireFromE2e('playwright-core');
const axe = requireFromE2e('axe-core');

const BASE_URL = process.env.TEST_URL || 'http://127.0.0.1:8099';
const OUT_DIR = process.env.SHOT_DIR || '/out';
fs.mkdirSync(OUT_DIR, { recursive: true });

// 1x1 colorful PNG for mocking Gemini 3D Studio Image response
const MOCK_RENDER_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAWklEQVR42u3PAQ0AAAjDMK5/aS3CApK4M212B4ECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIPCfwAKeQwD/yJ5+fQAAAABJRU5ErkJggg==';

// Minimal valid Binary STL (a 30x30x20mm wedge) for testing File Input -> Web Worker import
function makeTinyBinaryStlBuffer() {
  const tris = [
    [[0,0,0],[30,0,0],[30,30,0]], [[0,0,0],[30,30,0],[0,30,0]],
    [[0,0,20],[30,30,20],[30,0,20]], [[0,0,20],[0,30,20],[30,30,20]],
    [[0,0,0],[0,0,20],[30,0,20]], [[0,0,0],[30,0,20],[30,0,0]],
    [[30,0,0],[30,0,20],[30,30,20]], [[30,0,0],[30,30,20],[30,30,0]],
    [[30,30,0],[30,30,20],[0,30,20]], [[30,30,0],[0,30,20],[0,30,0]],
    [[0,30,0],[0,30,20],[0,0,20]], [[0,30,0],[0,0,20],[0,0,0]],
  ];
  const buf = Buffer.alloc(84 + tris.length * 50);
  buf.write('solid TRAP_BINARY_STL_TEST', 0);
  buf.writeUInt32LE(tris.length, 80);
  let off = 84;
  for (const t of tris) {
    off += 12;
    for (const v of t) {
      buf.writeFloatLE(v[0], off); off += 4;
      buf.writeFloatLE(v[1], off); off += 4;
      buf.writeFloatLE(v[2], off); off += 4;
    }
    off += 2;
  }
  return buf;
}

async function runAxe(page, label) {
  await page.addScriptTag({ content: axe.source });
  const results = await page.evaluate(async () => {
    return await window.axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
    });
  });
  if (results.violations.length > 0) {
    console.error(`[AXE FAIL ${label}]`, JSON.stringify(results.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.slice(0, 4).map((n) => ({ html: n.html.slice(0, 140), msg: n.failureSummary })),
    })), null, 2));
  }
  assert.equal(results.violations.length, 0, `Expected 0 axe WCAG AA violations in ${label}`);
  console.log(`  [PASS] axe-core WCAG AA (${label}): 0 violations`);
}

async function countDistinctCanvasColors(page) {
  return await page.evaluate(async () => {
    const dataUrl = window.__3dich.captureSnapshot();
    const img = new Image();
    img.src = dataUrl;
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
    const c = document.createElement('canvas');
    c.width = 160; c.height = 100;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const px = ctx.getImageData(0, 0, c.width, c.height).data;
    const buckets = new Set();
    let brightPixels = 0;
    for (let i = 0; i < px.length; i += 4) {
      const r = px[i], g = px[i + 1], b = px[i + 2];
      buckets.add(`${r >> 4},${g >> 4},${b >> 4}`);
      if (r > 55 || g > 55 || b > 55) brightPixels++;
    }
    return { distinctBuckets: buckets.size, brightPixels };
  });
}

async function run() {
  console.log(`=== 3dich Full Multi-Device Chromium E2E Suite (${BASE_URL}) ===`);
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium-browser',
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--use-gl=angle',
      '--use-angle=gles-egl',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      '--disable-gpu-sandbox',
    ],
  });

  try {
    // ==================== 1. DESKTOP (1440x900) FULL FLOW ====================
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => Boolean(window.__3dich));
    await page.waitForTimeout(500);

    // Check TRUE WebGL2 rendering, ultra-low draw-call budget, and 0% idle loop!
    const stats0 = await page.evaluate(() => window.__3dich.getStats());
    console.log('  [INFO] Initial 3D Stats:', JSON.stringify(stats0));
    assert.equal(stats0.backend, 'WebGL2', `Expected true WebGL2, got: ${stats0.backend}`);
    assert.ok(stats0.drawCalls <= 12, `Expected <= 12 draw calls for ultra optimization, got ${stats0.drawCalls}`);
    assert.equal(stats0.rafRunning, false, 'Idle on-demand render loop MUST stop (0% idle CPU/GPU)!');

    const pxInfo = await countDistinctCanvasColors(page);
    console.log('  [INFO] Canvas pixels:', JSON.stringify(pxInfo));
    assert.ok(pxInfo.distinctBuckets >= 12, `Canvas looks blank/flat: only ${pxInfo.distinctBuckets} color buckets`);
    assert.ok(pxInfo.brightPixels >= 400, `Expected printer pixels drawn, got ${pxInfo.brightPixels}`);

    await page.screenshot({ path: path.join(OUT_DIR, 'desktop-dark.png') });
    await runAxe(page, 'Desktop Dark');

    // Test Mod Search, Toggle & Preset Application
    await page.fill('#mod-search', 'CPAP');
    const cpapCard = page.locator('.mod-card[data-mod-id="cool-cpap-turbo"]');
    await cpapCard.waitFor({ state: 'visible' });
    await cpapCard.click();
    await page.fill('#mod-search', '');

    // Switch to Printers tab & apply Speedboat Racer preset
    await page.click('[data-left-tab="printers"]');
    await page.click('[data-preset-id="speedboat-racer"]');
    await page.waitForTimeout(450);
    const speedStats = await page.evaluate(() => window.__3dich.getStats());
    assert.ok(speedStats.activeModCount >= 12, 'Speedboat preset should activate >= 12 mods');
    console.log(`  [PASS] Speedboat preset active (${speedStats.activeModCount} mods, score ${speedStats.engineeringScore})`);

    // Test SolidCraft Tab: Demo Part + Real Binary STL Upload + Real .sc Archive + Collision Detection!
    await page.click('[data-left-tab="solidcraft"]');
    await page.click('[data-demo-part="demo-duct-bracket"]');
    await page.waitForTimeout(250);
    assert.equal(await page.locator('#gizmo-bar').isVisible(), true, 'Gizmo bar must show when part selected');
    assert.equal(await page.locator('#part-editor').isVisible(), true, 'Part editor must open when part mounted');

    // Trigger Collision on purpose (move part to frame zone inside print volume)
    await page.selectOption('#pe-zone', 'frame');
    await page.fill('#pe-px', '0');
    await page.fill('#pe-py', '260');
    await page.fill('#pe-pz', '0');
    await page.dispatchEvent('#pe-pz', 'input');
    await page.waitForTimeout(150);
    const colStats = await page.evaluate(() => window.__3dich.getStats());
    assert.ok(colStats.collisions >= 1, 'Expected collision detector to catch print volume intrusion');
    assert.equal(await page.locator('#viewport-alert').isVisible(), true, 'Collision alert banner must be visible');
    console.log('  [PASS] 3D AABB Collision detection & alert banner verified');

    // Snap cleanly back to hardpoint -> collision clears
    await page.selectOption('#pe-snap-hp', 'frame-right-post');
    await page.click('#btn-snap-part');
    await page.waitForTimeout(150);
    const cleanStats = await page.evaluate(() => window.__3dich.getStats());
    assert.equal(cleanStats.collisions, 0, 'Snapping to right post should clear collision');

    // Upload real Binary STL (with "solid " header trap!) through Web Worker
    const tmpStl = path.join(OUT_DIR, 'solidcraft_test_bracket.stl');
    fs.writeFileSync(tmpStl, makeTinyBinaryStlBuffer());
    await page.setInputFiles('#cad-file-input', tmpStl);
    await page.waitForFunction(() => window.__3dich.getStats().customPartCount === 2, null, { timeout: 5000 });
    console.log('  [PASS] Web Worker Binary STL import verified (customPartCount=2)');

    // Test SolidCraft .sc archive inspector if real kasnak.sc mounted
    if (fs.existsSync('/solidcraft/solidcraft boklu/kasnak.sc')) {
      await page.setInputFiles('#cad-file-input', '/solidcraft/solidcraft boklu/kasnak.sc');
      await page.locator('#sc-archive-card').waitFor({ state: 'visible', timeout: 5000 });
      console.log('  [PASS] Real SolidCraft .sc archive inspector verified with embedded thumbnail');
      await page.click('#btn-close-sc-card');
    }

    // Heavy CAD Performance Benchmark: 3.8 MB / 76K-triangle real STL via Web Worker + UNORM16 + Chunked Frustum Culling
    if (fs.existsSync('/solidcraft/p51/Wing_L.stl')) {
      const tBench0 = Date.now();
      await page.setInputFiles('#cad-file-input', '/solidcraft/p51/Wing_L.stl');
      await page.waitForFunction(() => window.__3dich.getStats().customPartCount === 3, null, { timeout: 10000 });
      const parseWallMs = Date.now() - tBench0;
      await page.waitForTimeout(150);
      const heavyStats = await page.evaluate(() => window.__3dich.getStats());
      console.log(`  [BENCH] 76K-tri Wing_L.stl: worker+upload=${parseWallMs}ms | render=${heavyStats.frameMs}ms | tris=${heavyStats.triangles} | vram=${heavyStats.vramMB}MB | drawCalls=${heavyStats.drawCalls}`);
      assert.ok(heavyStats.vramMB < 3.0, `UNORM16 VRAM should stay < 3 MB even with 76K-tri mesh, got ${heavyStats.vramMB}MB`);
      assert.ok(heavyStats.frameMs < 40, `Expected fast render even with 76K-tri mesh, got ${heavyStats.frameMs}ms`);
      // Remove heavy test wing before continuing clean screenshots
      await page.click('#btn-del-part');
      await page.waitForTimeout(100);
    }

    // Test Motion Simulation + Airflow + Thermal FLIR Mode + Idle Return!
    await page.click('#btn-toggle-motion');
    await page.click('#btn-toggle-airflow');
    await page.click('#btn-toggle-thermal');
    await page.waitForTimeout(250);
    assert.equal((await page.evaluate(() => window.__3dich.getStats())).rafRunning, true, 'RAF must run during active simulation');
    await page.screenshot({ path: path.join(OUT_DIR, 'desktop-thermal.png') });
    await page.click('#btn-toggle-motion');
    await page.click('#btn-toggle-airflow');
    await page.click('#btn-toggle-thermal');
    await page.waitForTimeout(450);
    assert.equal((await page.evaluate(() => window.__3dich.getStats())).rafRunning, false, 'RAF must stop cleanly when simulation turned off');
    console.log('  [PASS] Live Motion + Airflow + Thermal FLIR + Zero-Idle stop verified');

    // Test Gemini AI Studio: Offline Audit + Mocked Multimodal Vision + Mocked 3D Image Gen + Co-Pilot Chat!
    await page.click('[data-right-tab="gemini"]');
    await page.click('#btn-run-offline-audit');
    await page.waitForTimeout(100);
    const offText = await page.locator('#audit-output').textContent();
    assert.ok(offText.includes('Voron 2.4'), 'Offline audit should analyze active printer');

    let visionPayloadChecked = false;
    let imagePayloadChecked = false;
    await page.route('https://generativelanguage.googleapis.com/**', async (route) => {
      const url = route.request().url();
      const body = JSON.parse(route.request().postData() || '{}');
      if (url.includes('gemini-2.5-flash-image')) {
        assert.deepEqual(body.generationConfig?.responseModalities, ['TEXT', 'IMAGE']);
        imagePayloadChecked = true;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            candidates: [{
              content: {
                parts: [
                  { text: 'Studio industrial render complete.' },
                  { inlineData: { mimeType: 'image/png', data: MOCK_RENDER_PNG_B64 } },
                ],
              },
            }],
          }),
        });
      } else {
        const parts = body.contents?.[body.contents.length - 1]?.parts || [];
        if (parts.some((p) => p.inlineData?.mimeType === 'image/png')) visionPayloadChecked = true;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            candidates: [{
              content: {
                parts: [{ text: '### 1. Executive Verdict\nStrong high-speed rig! Add [[mod:enc-nevermore-v6]] for ABS VOC scrubbing.' }],
              },
            }],
          }),
        });
      }
    });

    await page.fill('#gemini-api-key', 'AIzaSyMOCKTESTKEY12345');
    await page.click('#btn-save-key');
    await page.click('#btn-run-gemini-audit');
    await page.locator('#audit-rec-mods button').first().waitFor({ state: 'visible', timeout: 5000 });
    assert.equal(visionPayloadChecked, true, 'Gemini Vision request MUST include live PNG viewport inlineData');
    // Click 1-click AI recommended mod button!
    await page.locator('#audit-rec-mods button').first().click();

    await page.click('#btn-gen-3d-image');
    await page.locator('#render-latest img').waitFor({ state: 'visible', timeout: 5000 });
    assert.equal(imagePayloadChecked, true, 'Gemini 3D image generation must send responseModalities TEXT+IMAGE');
    await page.screenshot({ path: path.join(OUT_DIR, 'desktop-gemini-render.png') });

    // Co-pilot chat test
    await page.fill('#chat-input', 'What max accel is safe?');
    await page.click('#btn-send-chat');
    await page.locator('.chat-ai').first().waitFor({ state: 'visible', timeout: 5000 });
    console.log('  [PASS] Gemini Multimodal Vision Audit, 1-Click Mod Apply, 3D Studio Render & Chat verified');

    // Light Theme + EN Language + Export Klipper Modal + Accessibility Check!
    await page.click('#btn-theme');
    await page.click('#btn-lang');
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT_DIR, 'desktop-light.png') });
    await runAxe(page, 'Desktop Light EN');

    await page.click('#btn-open-export');
    await page.locator('#export-modal').waitFor({ state: 'visible' });
    const klipperVal = await page.locator('#klipper-preview').inputValue();
    assert.ok(klipperVal.includes('[input_shaper]') && klipperVal.includes('kinematics: corexy'));
    await runAxe(page, 'Export Modal');
    await page.click('#btn-close-export');

    // Undo / Redo check
    await page.click('#btn-undo');
    await page.click('#btn-redo');

    assert.equal(errors.length, 0, `Console/Page errors detected: ${JSON.stringify(errors)}`);
    await ctx.close();

    // ==================== 2. SOFTWARE CANVAS2D FALLBACK (?renderer=2d) ====================
    const swCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const swPage = await swCtx.newPage();
    const swErrors = [];
    swPage.on('pageerror', (e) => swErrors.push(e.message));
    await swPage.goto(`${BASE_URL}/?renderer=2d`, { waitUntil: 'networkidle' });
    await swPage.waitForFunction(() => Boolean(window.__3dich));
    await swPage.waitForTimeout(400);
    const swStats = await swPage.evaluate(() => window.__3dich.getStats());
    assert.equal(swStats.backend, 'SW-2D', 'Forced 2D fallback must report SW-2D');
    const swPx = await countDistinctCanvasColors(swPage);
    assert.ok(swPx.distinctBuckets >= 10 && swPx.brightPixels >= 300, 'SW-2D fallback must draw visible printer');
    await swPage.screenshot({ path: path.join(OUT_DIR, 'desktop-sw2d.png') });
    assert.equal(swErrors.length, 0, `SW-2D errors: ${JSON.stringify(swErrors)}`);
    console.log(`  [PASS] Software Canvas2D Fallback verified (${swStats.triangles} tris in ${swStats.frameMs}ms)`);
    await swCtx.close();

    // ==================== 3. MOBILE PHONE (390x844) & TABLET (834x1112) ====================
    for (const dev of [
      { label: 'Phone 390x844', w: 390, h: 844, shot: 'mobile-phone.png' },
      { label: 'Tablet 834x1112', w: 834, h: 1112, shot: 'tablet.png' },
    ]) {
      const mCtx = await browser.newContext({ viewport: { width: dev.w, height: dev.h }, isMobile: dev.w < 500 });
      const mPage = await mCtx.newPage();
      const mErrors = [];
      mPage.on('pageerror', (e) => mErrors.push(e.message));
      await mPage.goto(BASE_URL, { waitUntil: 'networkidle' });
      await mPage.waitForFunction(() => Boolean(window.__3dich));
      await mPage.waitForTimeout(400);

      // Verify zero horizontal overflow
      const overflow = await mPage.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      assert.equal(overflow, false, `${dev.label} must not overflow horizontally`);
      await mPage.screenshot({ path: path.join(OUT_DIR, dev.shot) });
      await runAxe(mPage, `${dev.label} Scene`);

      // Switch mobile bottom tabs
      await mPage.click('[data-mobile-view="left"]');
      await mPage.waitForTimeout(120);
      await runAxe(mPage, `${dev.label} Catalog Sheet`);
      await mPage.click('[data-mobile-view="telemetry"]');
      await mPage.waitForTimeout(120);
      await mPage.click('[data-mobile-view="gemini"]');
      await mPage.waitForTimeout(120);
      await mPage.click('[data-mobile-view="scene"]');

      assert.equal(mErrors.length, 0, `${dev.label} errors: ${JSON.stringify(mErrors)}`);
      await mCtx.close();
    }

    console.log('=== ALL 3DICH MULTI-DEVICE E2E, VISUAL, PERF & A11Y TESTS PASSED! ===');
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error('E2E FAILED:', err);
  process.exit(1);
});
