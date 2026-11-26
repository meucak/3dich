// 3dich — Zero-Dependency Node.js 22 Production Server
// Serves docs/ static PWA + /api/health + read-only /api/solidcraft-library
// + /api/gemini/proxy (2026 models) + Zero-Trust pass-through /api/agy/{kasa,toshi}

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { URL } from 'node:url';

const PORT = Number(process.env.PORT) || 8099;
const DOCS_DIR = path.resolve(process.env.DOCS_DIR || path.join(process.cwd(), 'docs'));
const LIBRARY_DIRS_RAW = process.env.LIBRARY_DIRS || '';
const SERVER_GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const AGY_KASA_UPSTREAM = (process.env.AGY_KASA_UPSTREAM || 'http://172.17.0.1:8766').replace(/\/+$/, '');
const AGY_TOSHI_UPSTREAM = (process.env.AGY_TOSHI_UPSTREAM || 'http://100.79.246.19:8767').replace(/\/+$/, '');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.stl': 'application/octet-stream',
  '.obj': 'text/plain; charset=utf-8',
  '.3mf': 'application/octet-stream',
  '.sc': 'application/zip',
};

const CAD_EXTS = new Set(['.stl', '.obj', '.3mf', '.sc']);
const GEMINI_MODEL_RE = /^(gemini-[234](\.[0-9]+)?-[a-z0-9.-]+|imagen-[34](\.[0-9]+)?-[a-z0-9.-]+)$/i;
const GEMINI_ACTIONS = new Set(['generateContent', 'predict']);

function scanLibraryFiles() {
  const index = new Map();
  const list = [];
  if (!LIBRARY_DIRS_RAW.trim()) return { index, list };

  const entries = LIBRARY_DIRS_RAW.split(',').map((s) => s.trim()).filter(Boolean);
  const walk = (root, dir, sourceName, depth = 0) => {
    if (depth > 4 || list.length >= 120) return;
    let items;
    try { items = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const it of items) {
      if (it.name.startsWith('.')) continue;
      const full = path.join(dir, it.name);
      if (it.isDirectory()) {
        walk(root, full, sourceName, depth + 1);
      } else {
        const ext = path.extname(it.name).toLowerCase();
        if (!CAD_EXTS.has(ext)) continue;
        try {
          const st = fs.statSync(full);
          if (st.size > 40 * 1024 * 1024) continue;
          const id = crypto.createHash('sha1').update(full).digest('hex').slice(0, 16);
          index.set(id, { full, name: it.name, ext });
          list.push({
            id,
            name: it.name,
            rel: path.relative(root, full),
            source: sourceName,
            size: st.size,
            mtimeMs: st.mtimeMs,
          });
        } catch { /* ignore unreadable */ }
      }
    }
  };

  for (const spec of entries) {
    const [label, dir] = spec.includes('=') ? spec.split('=', 2) : [path.basename(spec), spec];
    if (dir && fs.existsSync(dir)) walk(dir, dir, label);
  }
  list.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return { index, list };
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(body);
}

async function readBodyLimited(req, maxBytes = 10 * 1024 * 1024) {
  const chunks = [];
  let bytes = 0;
  for await (const c of req) {
    bytes += c.length;
    if (bytes > maxBytes) throw Object.assign(new Error('Payload too large'), { status: 413 });
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}

export function createServer() {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
      const p = url.pathname;

      if (p === '/api/health' && req.method === 'GET') {
        return sendJson(res, 200, { ok: true, app: '3dich', version: '1.1.0', uptimeSec: Math.round(process.uptime()) });
      }

      if (p === '/api/solidcraft-library' && req.method === 'GET') {
        const { list } = scanLibraryFiles();
        return sendJson(res, 200, { ok: true, files: list });
      }

      if (p === '/api/solidcraft-file' && req.method === 'GET') {
        const id = url.searchParams.get('id') || '';
        const { index } = scanLibraryFiles();
        const found = index.get(id);
        if (!found) return sendJson(res, 404, { error: 'File not found' });
        res.writeHead(200, {
          'Content-Type': MIME_TYPES[found.ext] || 'application/octet-stream',
          'Content-Disposition': `inline; filename="${found.name.replace(/"/g, '')}"`,
          'X-Content-Type-Options': 'nosniff',
        });
        fs.createReadStream(found.full).pipe(res);
        return;
      }

      // Zero-Trust Pass-Through Proxy for AGY Kasa / AGY Toshi
      // Server holds NO token — strictly requires & forwards user's X-3dich-Token / Authorization header!
      const agyMatch = /^\/api\/agy\/(kasa|toshi)\/(health|complete)$/.exec(p);
      if (agyMatch) {
        const [, targetNode, subPath] = agyMatch;
        const token = String(req.headers['x-3dich-token'] || req.headers['authorization'] || '').trim();
        if (!token) {
          return sendJson(res, 401, { ok: false, error: 'Missing X-3dich-Token header (Zero-Trust enforced)' });
        }
        const upstreamBase = targetNode === 'toshi' ? AGY_TOSHI_UPSTREAM : AGY_KASA_UPSTREAM;
        const fwdHeaders = {
          'X-3dich-Token': token.replace(/^Bearer\s+/i, ''),
          'Authorization': token.startsWith('Bearer ') ? token : `Bearer ${token}`,
        };
        let body = undefined;
        if (req.method === 'POST') {
          body = await readBodyLimited(req, 8 * 1024 * 1024);
          fwdHeaders['Content-Type'] = 'application/json';
        }
        try {
          const upstream = await fetch(`${upstreamBase}/${subPath}`, {
            method: req.method,
            headers: fwdHeaders,
            body,
            signal: AbortSignal.timeout(115_000),
          });
          const respText = await upstream.text();
          res.writeHead(upstream.status, {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
          });
          res.end(respText);
        } catch (err) {
          sendJson(res, 503, { ok: false, error: `AGY ${targetNode} bridge unreachable: ${err?.message || 'offline'}` });
        }
        return;
      }

      if (p === '/api/gemini/proxy' && req.method === 'POST') {
        const model = url.searchParams.get('model') || 'gemini-3.8-flash';
        const action = url.searchParams.get('action') || 'generateContent';
        if (!GEMINI_MODEL_RE.test(model) || !GEMINI_ACTIONS.has(action)) {
          return sendJson(res, 400, { error: 'Unsupported model ID or action' });
        }
        const key = String(req.headers['x-goog-api-key'] || SERVER_GEMINI_KEY).trim();
        if (!key) return sendJson(res, 401, { error: 'Missing Gemini API key' });

        const body = await readBodyLimited(req, 12 * 1024 * 1024);
        const upstream = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:${action}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
            body,
          },
        );
        const respText = await upstream.text();
        res.writeHead(upstream.status, {
          'Content-Type': 'application/json; charset=utf-8',
          'X-Content-Type-Options': 'nosniff',
        });
        res.end(respText);
        return;
      }

      // Static docs/ hosting with strict path-traversal protection
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        return sendJson(res, 405, { error: 'Method Not Allowed' });
      }
      const relPath = decodeURIComponent(p === '/' ? '/index.html' : p);
      const resolved = path.resolve(DOCS_DIR, '.' + relPath);
      if (!resolved.startsWith(DOCS_DIR + path.sep) && resolved !== DOCS_DIR) {
        return sendJson(res, 403, { error: 'Forbidden' });
      }
      let target = resolved;
      if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
        target = path.join(target, 'index.html');
      }
      if (!fs.existsSync(target)) {
        return sendJson(res, 404, { error: 'Not Found' });
      }
      const ext = path.extname(target).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
        'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=300',
      });
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(target).pipe(res);
    } catch (err) {
      sendJson(res, err?.status || 500, { error: err?.message || 'Internal error' });
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const srv = createServer();
  srv.listen(PORT, '0.0.0.0', () => {
    console.log(`[3dich] Server running on http://0.0.0.0:${PORT} (docs=${DOCS_DIR})`);
  });
}
