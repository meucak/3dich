import assert from 'node:assert/strict';
import { PRINTER_PLATFORMS } from '../../docs/js/catalog.js';
import { evaluatePrinterBuild } from '../../docs/js/physics_engine.js';
import {
  buildEvaluationPayload,
  buildImageGenPayload,
  evaluateBuildWithGemini,
  generate3DRenderWithGemini,
  extractRecommendedModIds,
  buildOfflineEngineeringAudit,
} from '../../docs/js/gemini_studio.js';
import { buildSolidCraftMCPSpec, MAKER_SOLIDCRAFT_IDEAS } from '../../docs/js/solidcraft_bridge.js';

let passed = 0;
function test(name, fn) {
  return Promise.resolve(fn()).then(() => {
    passed++;
    console.log(`  [PASS] ${name}`);
  });
}

async function run() {
  console.log('=== 3dich Gemini Studio & SolidCraft Bridge Unit Tests ===');

  const printer = PRINTER_PLATFORMS[0];
  const mods = ['hotend-chc-pro', 'enc-polycarb-panels'];
  const customParts = [{
    id: 'p1', name: 'SolidCraft_Duct.stl', volumeCm3: 18, materialId: 'pla', infillPct: 40,
    zone: 'toolhead', pos: [0, 220, 20], rot: [0, 0, 0], scale: [1, 1, 1],
    sizeMm: [42, 34, 28], overhangPct: 14.5, localBBox: { min: [-21, -17, -14], max: [21, 17, 14] },
  }];
  const evalResult = evaluatePrinterBuild(printer, mods, customParts);
  const fakePng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

  await test('Multimodal evaluation payload embeds PNG inlineData + custom SolidCraft telemetry JSON', () => {
    const payload = buildEvaluationPayload({
      lang: 'tr', printer, activeModIds: mods, customParts, evalResult, snapshotDataUrl: fakePng,
    });
    assert.equal(payload.contents[0].parts.length, 2);
    assert.ok(payload.contents[0].parts[0].text.includes('SolidCraft_Duct.stl'));
    assert.equal(payload.contents[0].parts[1].inlineData.mimeType, 'image/png');
  });

  await test('3D image generation payload specifies responseModalities TEXT + IMAGE and reference snapshot', () => {
    const payload = buildImageGenPayload({
      styleId: 'studio', customPrompt: 'dramatic rim light', printer, activeModIds: mods, customParts, snapshotDataUrl: fakePng,
    });
    assert.deepEqual(payload.generationConfig.responseModalities, ['TEXT', 'IMAGE']);
    assert.equal(payload.contents[0].parts.length, 2);
    assert.ok(payload.contents[0].parts[0].text.includes('Voron 2.4'));
  });

  await test('Mocked Gemini API evaluation parses text + clickable [[mod:...]] recommendations', async () => {
    const mockFetch = async (url, init) => {
      assert.ok(url.includes('gemini-2.5-flash:generateContent'));
      assert.equal(init.headers['x-goog-api-key'], 'TEST_KEY_123');
      return {
        ok: true,
        json: async () => ({
          candidates: [{
            content: {
              parts: [{ text: 'Upgrade to [[mod:hotend-rapido-uhf]] and [[mod:cool-cpap-turbo]] for peak speed. Avoid [[mod:nonexistent-id]].' }],
            },
          }],
        }),
      };
    };
    const res = await evaluateBuildWithGemini({
      apiKey: 'TEST_KEY_123', model: 'gemini-2.5-flash', lang: 'en',
      printer, activeModIds: mods, customParts, evalResult, snapshotDataUrl: fakePng, fetchFn: mockFetch,
    });
    assert.equal(res.source, 'gemini');
    assert.deepEqual(res.recommendedMods, ['hotend-rapido-uhf', 'cool-cpap-turbo']);
  });

  await test('Mocked Gemini Image Gen extracts generated PNG data URL', async () => {
    const mockFetch = async (url) => {
      assert.ok(url.includes('gemini-2.5-flash-image:generateContent'));
      return {
        ok: true,
        json: async () => ({
          candidates: [{
            content: {
              parts: [
                { text: 'Studio render complete.' },
                { inlineData: { mimeType: 'image/png', data: 'QUJDREVGRw==' } },
              ],
            },
          }],
        }),
      };
    };
    const res = await generate3DRenderWithGemini({
      apiKey: 'TEST_KEY', imageModel: 'gemini-2.5-flash-image', styleId: 'studio',
      printer, activeModIds: mods, customParts, snapshotDataUrl: fakePng, fetchFn: mockFetch,
    });
    assert.equal(res.imageDataUrl, 'data:image/png;base64,QUJDREVGRw==');
    assert.equal(res.caption, 'Studio render complete.');
  });

  await test('Offline engineering audit works cleanly in TR and EN and detects PLA thermal warning', () => {
    const tr = buildOfflineEngineeringAudit(printer, mods, customParts, evalResult, 'tr');
    const en = buildOfflineEngineeringAudit(printer, mods, customParts, evalResult, 'en');
    assert.ok(tr.markdown.includes('SolidCraft_Duct.stl'));
    assert.ok(en.markdown.includes('Executive Engineering Summary'));
    assert.ok(tr.recommendedMods.length > 0);
    assert.deepEqual(extractRecommendedModIds('Try [[mod:probe-beacon-eddy]]'), ['probe-beacon-eddy']);
  });

  await test('SolidCraft MCP prompt builder produces exact bolt pattern & file.export batch', () => {
    const spec = buildSolidCraftMCPSpec(printer, 'x-carriage', 'Ultralight probe bracket');
    assert.ok(spec.mcpPrompt.includes('MGN12H'));
    assert.ok(spec.mcpExportBatch.includes('file.export'));
    assert.ok(MAKER_SOLIDCRAFT_IDEAS.length >= 10);
  });

  console.log(`ALL ${passed} GEMINI & SOLIDCRAFT TESTS PASSED!`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
