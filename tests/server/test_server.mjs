import assert from 'node:assert/strict';
import { createServer } from '../../server/server.mjs';

let passed = 0;
async function test(name, fn) {
  await fn();
  passed++;
  console.log(`  [PASS] ${name}`);
}

async function run() {
  console.log('=== 3dich Server API & Security Tests ===');
  const srv = createServer();
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  const { port } = srv.address();
  const base = `http://127.0.0.1:${port}`;

  try {
    await test('GET /api/health returns ok:true and app:3dich', async () => {
      const r = await fetch(`${base}/api/health`);
      assert.equal(r.status, 200);
      const j = await r.json();
      assert.equal(j.ok, true);
      assert.equal(j.app, '3dich');
    });

    await test('GET / serves index.html with nosniff security header', async () => {
      const r = await fetch(`${base}/`);
      assert.equal(r.status, 200);
      assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
      const html = await r.text();
      assert.ok(html.includes('<title>3dich'));
    });

    await test('Path traversal attempt (/../server/server.mjs) is blocked (403/404)', async () => {
      const r = await fetch(`${base}/%2e%2e/server/server.mjs`);
      assert.ok(r.status === 403 || r.status === 404, `Expected 403/404, got ${r.status}`);
    });

    await test('GET /api/solidcraft-library returns JSON file array', async () => {
      const r = await fetch(`${base}/api/solidcraft-library`);
      assert.equal(r.status, 200);
      const j = await r.json();
      assert.equal(j.ok, true);
      assert.ok(Array.isArray(j.files));
    });

    await test('POST /api/gemini/proxy rejects unknown models (400) and missing key (401)', async () => {
      const badModel = await fetch(`${base}/api/gemini/proxy?model=evil-model`, { method: 'POST', body: '{}' });
      assert.equal(badModel.status, 400);
      const noKey = await fetch(`${base}/api/gemini/proxy?model=gemini-3.8-flash`, { method: 'POST', body: '{}' });
      assert.equal(noKey.status, 401);
    });

    await test('Zero-Trust /api/agy/{kasa,toshi} strictly rejects requests without X-3dich-Token (401)', async () => {
      const r1 = await fetch(`${base}/api/agy/kasa/health`);
      assert.equal(r1.status, 401);
      const r2 = await fetch(`${base}/api/agy/toshi/complete`, { method: 'POST', body: '{"prompt":"test"}' });
      assert.equal(r2.status, 401);
    });
  } finally {
    srv.close();
  }
  console.log(`ALL ${passed} SERVER TESTS PASSED!`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
