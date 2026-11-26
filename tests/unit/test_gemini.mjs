import assert from 'node:assert/strict';
import { PRINTER_BY_ID } from '../../docs/js/catalog.js';
import { evaluatePrinterBuild } from '../../docs/js/physics_engine.js';
import {
  GEMINI_TEXT_MODELS,
  GEMINI_IMAGE_MODELS,
  AGY_MODELS,
  fetchLiveGeminiModels,
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

  const printer = PRINTER_BY_ID.get('voron_24_300');
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

  await test('Mocked Gemini API evaluation uses latest Gemini 3.8/4 models and parses [[mod:...]] tags', async () => {
    assert.ok(GEMINI_TEXT_MODELS.some((m) => m.id === 'gemini-3.8-flash'));
    assert.ok(GEMINI_TEXT_MODELS.some((m) => m.id === 'gemini-4-carbon'));
    assert.ok(GEMINI_IMAGE_MODELS.some((m) => m.id === 'gemini-3.1-flash-image'));
    assert.ok(AGY_MODELS.some((m) => m.id === 'gemini-4-neon-high'));

    const mockFetch = async (url, init) => {
      assert.ok(url.includes('gemini-3.8-flash:generateContent'));
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
      apiKey: 'TEST_KEY_123', model: 'gemini-3.8-flash', lang: 'en',
      printer, activeModIds: mods, customParts, evalResult, snapshotDataUrl: fakePng, fetchFn: mockFetch,
    });
    assert.equal(res.source, 'gemini');
    assert.deepEqual(res.recommendedMods, ['hotend-rapido-uhf', 'cool-cpap-turbo']);
  });

  await test('Live ListModels discovery + AGY Kasa Zero-Trust Bearer request work cleanly', async () => {
    const liveRes = await fetchLiveGeminiModels('KEY', async () => ({
      ok: true,
      json: async () => ({
        models: [
          { name: 'models/gemini-4-carbon', displayName: 'Gemini 4 Carbon', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/gemini-3.1-flash-image', displayName: 'Gemini 3.1 Flash Image', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/imagen-4.0-generate-001', displayName: 'Imagen 4', supportedGenerationMethods: ['predict'] },
        ],
      }),
    }));
    assert.equal(liveRes.textModels[0].id, 'gemini-4-carbon');
    assert.equal(liveRes.imageModels.length, 2);

    const agyRes = await evaluateBuildWithGemini({
      provider: 'agy-kasa', agyToken: 'SECRET_256_TOKEN', agyModel: 'gemini-4-neon-high',
      lang: 'tr', printer, activeModIds: mods, customParts, evalResult, snapshotDataUrl: fakePng,
      fetchFn: async (url, init) => {
        assert.ok(url.endsWith('/complete'));
        assert.equal(init.headers['X-3dich-Token'], 'SECRET_256_TOKEN');
        return {
          ok: true,
          json: async () => ({ ok: true, model: 'gemini-4-neon-high', text: 'AGY audit ok [[mod:probe-beacon-eddy]]' }),
        };
      },
    });
    assert.equal(agyRes.source, 'agy-kasa');
    assert.deepEqual(agyRes.recommendedMods, ['probe-beacon-eddy']);
  });

  await test('Mocked Gemini 3.1 Image & Imagen 4 generation extract PNG data URL', async () => {
    const mockFetch = async (url) => {
      assert.ok(url.includes('gemini-3.1-flash-image:generateContent'));
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
      apiKey: 'TEST_KEY', imageModel: 'gemini-3.1-flash-image', styleId: 'studio',
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
