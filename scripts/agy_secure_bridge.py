#!/usr/bin/env python3
"""3dich Zero-Trust Hardened Antigravity (`agy`) Bridge Daemon.

Cybersecurity Architecture (Defense-in-Depth):
  1. Network Isolation: Never binds 0.0.0.0. Binds strictly to private interfaces
     (loopback + Tailscale WireGuard + local Docker bridge) and enforces source IP
     allowlist {127.0.0.0/8, ::1/128, 100.64.0.0/10, 172.16.0.0/12}.
  2. Cryptographic Auth: 256-bit high-entropy token (`secrets.token_urlsafe(32)`)
     stored at ~/.config/3dich/agy_bridge_token with chmod 0600 (owner-only),
     checked via constant-time `hmac.compare_digest` on EVERY endpoint including /health.
  3. Brute-Force & DoS Protection: Per-IP 5-strike 15-minute lockout, sliding-window
     rate limit (20 req / 5 min), strict max concurrent subprocess semaphore (2),
     8 MB request cap, 32 KB prompt cap, 110s execution timeout.
  4. Strict CORS Allowlist (NO `*`!): Rejects untrusted browser Origins with 403.
  5. Sandboxed Least-Privilege Subprocess: Runs `agy --print --disable-slash-commands
     --sandbox` inside an isolated empty 0700 scratch dir with `shell=False` and
     strict model regex allowlist. Never grants auto-edit or workspace access.
"""

from __future__ import annotations

import argparse
import base64
import hmac
import ipaddress
import json
import os
import re
import secrets
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
from collections import defaultdict, deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

sys.dont_write_bytecode = True

ALLOWED_NETS = [
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("100.64.0.0/10"),   # Tailscale CGNAT WireGuard mesh ONLY
    ipaddress.ip_network("172.16.0.0/12"),   # Local Docker bridge (3dich container -> host)
]

ALLOWED_ORIGINS = {
    "https://meucak.github.io",
    "http://127.0.0.1:8099",
    "http://localhost:8099",
    "http://192.168.1.100:8099",
    "http://100.69.155.110:8099",
}

MODEL_RE = re.compile(r"^[a-z0-9][a-z0-9._-]{2,63}$")
PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
JPEG_MAGIC = b"\xff\xd8\xff"
MAX_BODY_BYTES = 8 * 1024 * 1024
MAX_PROMPT_CHARS = 32_000
RATE_WINDOW_SEC = 300
RATE_MAX_REQ = 20
AUTH_MAX_FAILS = 5
AUTH_LOCKOUT_SEC = 900


def ensure_token(token_path: Path) -> str:
    token_path.parent.mkdir(parents=True, exist_ok=True)
    os.chmod(token_path.parent, 0o700)
    if token_path.exists():
        tok = token_path.read_text(encoding="utf-8").strip()
        if len(tok) >= 32:
            os.chmod(token_path, 0o600)
            return tok
    tok = secrets.token_urlsafe(32)
    fd = os.open(str(token_path), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(tok + "\n")
    return tok


def is_ip_allowed(ip_str: str, extra_nets: list | None = None) -> bool:
    try:
        ip = ipaddress.ip_address(ip_str)
        if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
            ip = ip.ipv4_mapped
        nets = ALLOWED_NETS if not extra_nets else (ALLOWED_NETS + extra_nets)
        return any(ip in net for net in nets)
    except ValueError:
        return False


def find_agy_bin() -> str | None:
    for cand in [
        shutil.which("agy"),
        str(Path.home() / ".local/bin/agy"),
        "/usr/local/bin/agy",
    ]:
        if cand and os.path.isfile(cand) and os.access(cand, os.X_OK):
            return cand
    return None


class SecurityGate:
    def __init__(self, expected_token: str, log_path: Path, extra_nets: list | None = None) -> None:
        self._token = expected_token
        self._log_path = log_path
        self._extra_nets = extra_nets or []
        self._lock = threading.Lock()
        self._fails: dict[str, int] = defaultdict(int)
        self._locked_until: dict[str, float] = {}
        self._req_times: dict[str, deque[float]] = defaultdict(deque)
        self.concurrency = threading.BoundedSemaphore(2)

    def audit(self, msg: str) -> None:
        ts = time.strftime("%Y-%m-%d %H:%M:%S")
        line = f"[{ts}] {msg}\n"
        try:
            self._log_path.parent.mkdir(parents=True, exist_ok=True)
            fd = os.open(str(self._log_path), os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
            with os.fdopen(fd, "a", encoding="utf-8") as f:
                f.write(line)
        except OSError:
            pass

    def check_ip_and_lockout(self, ip: str) -> tuple[bool, int, str]:
        if not is_ip_allowed(ip, self._extra_nets):
            self.audit(f"BLOCKED_IP ip={ip}")
            return False, 403, "Forbidden: source IP not in private loopback/Tailscale allowlist"
        now = time.time()
        with self._lock:
            until = self._locked_until.get(ip, 0.0)
            if now < until:
                rem = int(until - now)
                return False, 429, f"Locked out due to repeated auth failures ({rem}s remaining)"
        return True, 200, "ok"

    def verify_token(self, ip: str, provided: str) -> tuple[bool, int, str]:
        clean = (provided or "").strip()
        if clean.lower().startswith("bearer "):
            clean = clean[7:].strip()
        if clean and hmac.compare_digest(clean, self._token):
            with self._lock:
                self._fails[ip] = 0
                dq = self._req_times[ip]
                now = time.time()
                while dq and now - dq[0] > RATE_WINDOW_SEC:
                    dq.popleft()
                if len(dq) >= RATE_MAX_REQ:
                    self.audit(f"RATE_LIMIT ip={ip}")
                    return False, 429, "Rate limit exceeded (max 20 requests per 5 minutes)"
                dq.append(now)
            return True, 200, "ok"

        with self._lock:
            self._fails[ip] += 1
            count = self._fails[ip]
            if count >= AUTH_MAX_FAILS:
                self._locked_until[ip] = time.time() + AUTH_LOCKOUT_SEC
                self._fails[ip] = 0
                self.audit(f"LOCKOUT ip={ip} duration={AUTH_LOCKOUT_SEC}s")
                return False, 429, "Too many invalid token attempts — IP locked for 15 minutes"
        self.audit(f"AUTH_FAIL ip={ip} attempt={count}/{AUTH_MAX_FAILS}")
        return False, 401, "Unauthorized: invalid or missing X-3dich-Token"


def run_sandboxed_agy(
    *,
    prompt: str,
    system_prompt: str = "",
    model: str = "gemini-3.8-flash-high",
    image_data_url: str | None = None,
    mode: str = "audit",
    timeout_sec: int = 110,
) -> dict[str, Any]:
    agy_bin = find_agy_bin()
    if not agy_bin:
        return {"ok": False, "error": "agy CLI binary not found on host"}

    safe_model = (model or "gemini-3.8-flash-high").strip().lower()
    if not MODEL_RE.match(safe_model):
        return {"ok": False, "error": "Invalid model name format"}

    scratch_dir = tempfile.mkdtemp(prefix="3dich_agy_sandbox_")
    os.chmod(scratch_dir, 0o700)
    try:
        img_path: str | None = None
        if image_data_url:
            raw_b64 = image_data_url.split(",", 1)[-1].strip()
            img_bytes = base64.b64decode(raw_b64, validate=True)
            if len(img_bytes) > 6 * 1024 * 1024:
                return {"ok": False, "error": "Snapshot image exceeds 6MB limit"}
            if img_bytes.startswith(PNG_MAGIC):
                ext = ".png"
            elif img_bytes.startswith(JPEG_MAGIC):
                ext = ".jpg"
            else:
                return {"ok": False, "error": "Invalid image magic header (PNG/JPEG only)"}
            img_path = os.path.join(scratch_dir, f"viewport{ext}")
            fd = os.open(img_path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
            with os.fdopen(fd, "wb") as f:
                f.write(img_bytes)

        parts: list[str] = [
            "[SECURITY CONTEXT] You are answering a read-only 3D printer engineering request from 3dich. "
            "Do NOT read or modify any files outside the current temporary directory. Do NOT execute shell commands."
        ]
        if system_prompt:
            parts.append(f"[SYSTEM]\n{system_prompt[:4000]}")
        if img_path:
            parts.append(f"[3D VIEWPORT SNAPSHOT]\nRead and visually inspect `{img_path}` before answering.")
        if mode == "image":
            out_img = os.path.join(scratch_dir, "render_out.png")
            parts.append(
                f"[3D IMAGE RENDER TASK]\nUse your image-generator capability to generate the requested studio 3D render "
                f"and save or report the generated PNG path (prefer `{out_img}` if saving)."
            )
        parts.append(prompt[:MAX_PROMPT_CHARS])
        full_prompt = "\n\n".join(parts)

        cmd = [
            agy_bin,
            "--print",
            "--disable-slash-commands",
            "--sandbox",
            "--model",
            safe_model,
            full_prompt,
        ]
        proc = subprocess.run(
            cmd,
            cwd=scratch_dir,
            capture_output=True,
            text=True,
            timeout=timeout_sec,
            shell=False,
        )
        stdout = (proc.stdout or "").strip()
        stderr = (proc.stderr or "").strip()
        if proc.returncode != 0:
            return {"ok": False, "error": f"agy exited {proc.returncode}: {(stderr or stdout)[:300]}"}

        # Check if image generation produced a PNG/JPG inside scratch_dir
        out_image_data_url: str | None = None
        if mode == "image":
            for fname in sorted(os.listdir(scratch_dir)):
                if fname.startswith("viewport."):
                    continue
                if fname.lower().endswith((".png", ".jpg", ".jpeg", ".webp")):
                    fpath = os.path.join(scratch_dir, fname)
                    if os.path.getsize(fpath) < 10 * 1024 * 1024:
                        raw = Path(fpath).read_bytes()
                        mime = "image/jpeg" if fname.lower().endswith((".jpg", ".jpeg")) else "image/png"
                        out_image_data_url = f"data:{mime};base64,{base64.b64encode(raw).decode('ascii')}"
                        break

        return {
            "ok": True,
            "text": stdout,
            "model": safe_model,
            "imageDataUrl": out_image_data_url,
        }
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": f"agy timed out after {timeout_sec}s"}
    except Exception as exc:
        return {"ok": False, "error": str(exc)[:300]}
    finally:
        shutil.rmtree(scratch_dir, ignore_errors=True)


def make_handler(gate: SecurityGate, node_name: str):
    class SecureAgyHandler(BaseHTTPRequestHandler):
        server_version = "3dichSecureAgyBridge/1.0"

        def log_message(self, fmt: str, *args: Any) -> None:
            pass  # Avoid logging tokens/URLs to journalctl stdout

        def _origin_check(self) -> tuple[bool, str | None]:
            origin = self.headers.get("Origin")
            if not origin:
                return True, None
            if origin in ALLOWED_ORIGINS:
                return True, origin
            gate.audit(f"BLOCKED_ORIGIN ip={self.client_address[0]} origin={origin}")
            return False, None

        def _send_json(self, status: int, obj: dict[str, Any], origin: str | None = None) -> None:
            body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("X-Frame-Options", "DENY")
            if origin:
                self.send_header("Access-Control-Allow-Origin", origin)
                self.send_header("Vary", "Origin")
                self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
                self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-3dich-Token")
                if self.headers.get("Access-Control-Request-Private-Network") == "true":
                    self.send_header("Access-Control-Allow-Private-Network", "true")
            self.end_headers()
            self.wfile.write(body)

        def _preflight_and_auth(self) -> tuple[bool, str | None]:
            ip = self.client_address[0]
            ok_ip, st_ip, msg_ip = gate.check_ip_and_lockout(ip)
            if not ok_ip:
                self._send_json(st_ip, {"ok": False, "error": msg_ip})
                return False, None
            ok_orig, origin = self._origin_check()
            if not ok_orig:
                self._send_json(403, {"ok": False, "error": "Forbidden: untrusted browser Origin"})
                return False, None
            tok = self.headers.get("X-3dich-Token") or self.headers.get("Authorization") or ""
            ok_tok, st_tok, msg_tok = gate.verify_token(ip, tok)
            if not ok_tok:
                self._send_json(st_tok, {"ok": False, "error": msg_tok}, origin)
                return False, origin
            return True, origin

        def do_OPTIONS(self) -> None:
            ip = self.client_address[0]
            ok_ip, st_ip, msg_ip = gate.check_ip_and_lockout(ip)
            if not ok_ip:
                self._send_json(st_ip, {"ok": False, "error": msg_ip})
                return
            ok_orig, origin = self._origin_check()
            if not ok_orig:
                self._send_json(403, {"ok": False, "error": "Forbidden Origin"})
                return
            self.send_response(204)
            if origin:
                self.send_header("Access-Control-Allow-Origin", origin)
                self.send_header("Vary", "Origin")
                self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
                self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-3dich-Token")
                self.send_header("Access-Control-Max-Age", "600")
                if self.headers.get("Access-Control-Request-Private-Network") == "true":
                    self.send_header("Access-Control-Allow-Private-Network", "true")
            self.end_headers()

        def do_GET(self) -> None:
            ok, origin = self._preflight_and_auth()
            if not ok:
                return
            if self.path.rstrip("/") == "/health":
                agy = find_agy_bin()
                self._send_json(
                    200 if agy else 503,
                    {
                        "ok": bool(agy),
                        "node": node_name,
                        "sandbox": True,
                        "auth": "256-bit-bearer",
                    },
                    origin,
                )
                return
            self._send_json(404, {"ok": False, "error": "Not Found"}, origin)

        def do_POST(self) -> None:
            ok, origin = self._preflight_and_auth()
            if not ok:
                return
            if self.path.rstrip("/") != "/complete":
                self._send_json(404, {"ok": False, "error": "Not Found"}, origin)
                return

            try:
                length = int(self.headers.get("Content-Length") or "0")
            except ValueError:
                self._send_json(400, {"ok": False, "error": "Invalid Content-Length"}, origin)
                return
            if length <= 0 or length > MAX_BODY_BYTES:
                self._send_json(413, {"ok": False, "error": "Payload size out of bounds (max 8MB)"}, origin)
                return

            try:
                payload = json.loads(self.rfile.read(length).decode("utf-8"))
            except Exception:
                self._send_json(400, {"ok": False, "error": "Malformed JSON payload"}, origin)
                return

            prompt = str(payload.get("prompt") or "").strip()
            if not prompt:
                self._send_json(400, {"ok": False, "error": "Empty prompt"}, origin)
                return

            if not gate.concurrency.acquire(blocking=False):
                self._send_json(429, {"ok": False, "error": "Bridge busy (max 2 concurrent requests)"}, origin)
                return
            try:
                gate.audit(f"COMPLETE_START node={node_name} ip={self.client_address[0]} model={payload.get('model')}")
                result = run_sandboxed_agy(
                    prompt=prompt,
                    system_prompt=str(payload.get("systemPrompt") or ""),
                    model=str(payload.get("model") or "gemini-3.8-flash-high"),
                    image_data_url=payload.get("imageDataUrl"),
                    mode=str(payload.get("mode") or "audit"),
                )
                self._send_json(200 if result.get("ok") else 502, result, origin)
            finally:
                gate.concurrency.release()

    return SecureAgyHandler


def main() -> None:
    parser = argparse.ArgumentParser(description="3dich Zero-Trust Hardened AGY Bridge")
    parser.add_argument("--node", default=socket.gethostname(), help="Node label (kasa / toshi)")
    parser.add_argument("--port", type=int, default=8766, help="Listen port")
    parser.add_argument("--bind", action="append", default=[], help="Explicit private IP(s) to bind (never 0.0.0.0)")
    parser.add_argument("--allow-cidr", action="append", default=[], help="Optional extra private bridge CIDR to allow")
    parser.add_argument("--token-file", default=str(Path.home() / ".config/3dich/agy_bridge_token"))
    parser.add_argument("--print-token", action="store_true", help="Print token and exit")
    args = parser.parse_args()

    token_path = Path(args.token_file)
    token = ensure_token(token_path)
    if args.print_token:
        print(token)
        return

    binds = args.bind or ["127.0.0.1"]
    for b in binds:
        if b in ("0.0.0.0", "::", ""):
            print("FATAL: Refusing to bind 0.0.0.0 — Zero-Trust private interfaces only!", file=sys.stderr)
            sys.exit(2)

    extra_nets = [ipaddress.ip_network(c, strict=False) for c in args.allow_cidr]
    gate = SecurityGate(token, token_path.parent / "agy_bridge.log", extra_nets=extra_nets)
    handler_cls = make_handler(gate, args.node)
    servers: list[ThreadingHTTPServer] = []
    threads: list[threading.Thread] = []

    for host in binds:
        try:
            srv = ThreadingHTTPServer((host, args.port), handler_cls)
            servers.append(srv)
            t = threading.Thread(target=srv.serve_forever, daemon=True)
            t.start()
            threads.append(t)
            print(f"[3dich-agy-bridge] node={args.node} listening on {host}:{args.port} (Zero-Trust ON)", flush=True)
        except OSError as exc:
            print(f"[3dich-agy-bridge] skip bind {host}:{args.port}: {exc}", file=sys.stderr, flush=True)

    if not servers:
        print("FATAL: Could not bind any private interface", file=sys.stderr)
        sys.exit(1)

    try:
        while True:
            time.sleep(3600)
    except KeyboardInterrupt:
        for s in servers:
            s.shutdown()


if __name__ == "__main__":
    main()
