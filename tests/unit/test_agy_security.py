#!/usr/bin/env python3
"""Red-Team Cybersecurity Verification Suite for 3dich Zero-Trust AGY Bridge."""
import json
import os
import stat
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
import agy_secure_bridge as bridge  # noqa: E402

passed = 0


def check(name: str, cond: bool, detail: str = "") -> None:
    global passed
    if not cond:
        raise AssertionError(f"FAIL [{name}]: {detail}")
    passed += 1
    print(f"  [PASS] {name}")


def http_req(url: str, method: str = "GET", headers: dict | None = None, body: bytes | None = None):
    req = urllib.request.Request(url, data=body, headers=headers or {}, method=method)
    try:
        with urllib.request.urlopen(req, timeout=5) as r:
            return r.status, dict(r.headers), r.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read().decode("utf-8", errors="replace")


print("=== 3dich Zero-Trust AGY Bridge Red-Team Security Suite ===")

# 1. Refuses to bind 0.0.0.0
proc0 = subprocess.run(
    [sys.executable, str(Path(__file__).resolve().parents[2] / "scripts/agy_secure_bridge.py"), "--bind", "0.0.0.0"],
    capture_output=True, text=True, timeout=5,
)
check("Refuses fatal 0.0.0.0 wildcard bind", proc0.returncode == 2 and "Refusing to bind 0.0.0.0" in proc0.stderr)

# 2. IP Allowlist checks
check("Blocks public Internet IP (203.0.113.5)", not bridge.is_ip_allowed("203.0.113.5"))
check("Blocks untrusted LAN Wi-Fi IP (192.168.1.55)", not bridge.is_ip_allowed("192.168.1.55"))
check("Allows Loopback (127.0.0.1)", bridge.is_ip_allowed("127.0.0.1"))
check("Allows Tailscale WireGuard IP (100.79.246.19)", bridge.is_ip_allowed("100.79.246.19"))
check("Allows Local Docker Bridge (172.17.0.2)", bridge.is_ip_allowed("172.17.0.2"))

# 3. Token file creation + strict 0600 permissions
tmp_dir = Path(tempfile.mkdtemp(prefix="3dich_sec_test_"))
tok_file = tmp_dir / "agy_bridge_token"
token = bridge.ensure_token(tok_file)
mode = stat.S_IMODE(tok_file.stat().st_mode)
check("Token has >= 43 chars (256-bit entropy) and chmod 0600", len(token) >= 43 and mode == 0o600, f"len={len(token)} mode={oct(mode)}")

# 4. Spin up live isolated bridge server on random loopback port
gate = bridge.SecurityGate(token, tmp_dir / "audit.log")
srv = bridge.ThreadingHTTPServer(("127.0.0.1", 0), bridge.make_handler(gate, "test-node"))
port = srv.server_address[1]
t = threading.Thread(target=srv.serve_forever, daemon=True)
t.start()
base = f"http://127.0.0.1:{port}"

try:
    # Missing token on /health -> 401
    st, _, _ = http_req(f"{base}/health")
    check("Unauthenticated GET /health rejected with 401", st == 401, f"got {st}")

    # Evil Origin -> 403 and NO ACAO header
    st, hdrs, _ = http_req(
        f"{base}/health",
        headers={"Origin": "https://evil-attacker.example", "X-3dich-Token": token},
    )
    check(
        "Malicious browser Origin rejected with 403 and zero CORS headers",
        st == 403 and "Access-Control-Allow-Origin" not in hdrs,
        f"st={st} hdrs={hdrs}",
    )

    # Trusted Origin + Valid 256-bit Token -> 200 + Exact Origin echo
    st, hdrs, body = http_req(
        f"{base}/health",
        headers={"Origin": "https://meucak.github.io", "X-3dich-Token": token},
    )
    check(
        "Trusted Origin + valid 256-bit Bearer Token passes /health",
        st in (200, 503) and hdrs.get("Access-Control-Allow-Origin") == "https://meucak.github.io",
        f"st={st} acao={hdrs.get('Access-Control-Allow-Origin')}",
    )

    # Injection / malformed model name rejected cleanly
    bad_model = bridge.run_sandboxed_agy(prompt="hi", model="gemini; cat /etc/passwd")
    check("Command-injection model name rejected by strict regex", not bad_model["ok"] and "Invalid model" in bad_model["error"])

    # Invalid PNG magic header rejected
    bad_img = bridge.run_sandboxed_agy(prompt="hi", model="gemini-3.8-flash-high", image_data_url="data:image/png;base64,aGVsbG8=")
    check("Non-PNG/JPEG fake image payload rejected by magic header check", not bad_img["ok"] and "magic" in bad_img["error"].lower())

    # CLI flag syntax regression: --disable-slash-commands & --sandbox before --print=<prompt> (never bare --print)
    from unittest import mock

    captured_cmds = []

    def fake_run(cmd, **kwargs):
        captured_cmds.append(cmd)
        return subprocess.CompletedProcess(cmd, 0, stdout="OK", stderr="")

    with mock.patch.object(bridge, "find_agy_bin", return_value="/usr/local/bin/agy"), mock.patch.object(
        bridge.subprocess, "run", side_effect=fake_run
    ):
        for test_model in ("gemini-4-hydrogen-xhigh", "gemini-4-argon-high"):
            res = bridge.run_sandboxed_agy(prompt="--leading-dash prompt test", model=test_model)
            check(f"Sandboxed agy invocation succeeds for {test_model}", res["ok"] and res["model"] == test_model, str(res))

    check(
        "agy CLI uses attached --print=<prompt> after --disable-slash-commands and --sandbox",
        len(captured_cmds) == 2
        and all(
            "--print" not in c
            and c[1:5] == ["--disable-slash-commands", "--sandbox", "--model", m]
            and c[5].startswith("--print=")
            and "--leading-dash prompt test" in c[5]
            for c, m in zip(captured_cmds, ("gemini-4-hydrogen-xhigh", "gemini-4-argon-high"))
        ),
        f"cmds={captured_cmds}",
    )

    # 5-strike Brute-Force Lockout -> 6th request LOCKED (429) even with VALID token!
    for i in range(5):
        st_bad, _, _ = http_req(f"{base}/health", headers={"X-3dich-Token": f"wrong_guess_{i}"})
    check("5th bad token triggers 429 brute-force lockout", st_bad == 429, f"got {st_bad}")
    st_locked, _, _ = http_req(f"{base}/health", headers={"X-3dich-Token": token})
    check("Locked-out IP stays blocked (429) even with valid token", st_locked == 429, f"got {st_locked}")
finally:
    srv.shutdown()
    import shutil
    shutil.rmtree(tmp_dir, ignore_errors=True)

print(f"ALL {passed} ZERO-TRUST SECURITY TESTS PASSED!")
