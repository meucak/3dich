#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/home/kasa/apps/3dich"
COMPOSE_FILE="$APP_DIR/docker-compose.yml"
LOCAL_URL="${THREEDICH_URL:-http://127.0.0.1:8099}"
LAN_URL="http://192.168.1.100:8099"
TS_URL="http://100.69.155.110:8099"
GLOBAL_URL="https://meucak.github.io/3dich/"
HEALTH_URL="http://127.0.0.1:8099/api/health"
TOKEN_FILE="$HOME/.config/3dich/agy_bridge_token"

ensure_running() {
  if curl -sf --max-time 1.2 "$HEALTH_URL" >/dev/null 2>&1; then
    return 0
  fi
  echo "3dich konteyneri başlatılıyor..."
  docker compose -f "$COMPOSE_FILE" up -d >/dev/null
  for _ in $(seq 1 20); do
    if curl -sf --max-time 1.2 "$HEALTH_URL" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "Uyarı: 3dich henüz sağlık kontrolüne yanıt vermedi." >&2
  return 1
}

open_studio() {
  ensure_running
  if [ -n "${DISPLAY:-}" ] || [ -n "${WAYLAND_DISPLAY:-}" ]; then
    for browser in chromium chromium-browser google-chrome brave-browser microsoft-edge firefox xdg-open; do
      if command -v "$browser" >/dev/null 2>&1; then
        if [ "$browser" = "firefox" ] || [ "$browser" = "xdg-open" ]; then
          nohup "$browser" "$LOCAL_URL" >/dev/null 2>&1 </dev/null &
        else
          nohup "$browser" --app="$LOCAL_URL" >/dev/null 2>&1 </dev/null &
        fi
        echo "3dich açıldı: $LOCAL_URL"
        return 0
      fi
    done
  fi

  # Headless Kasa: if Toshi desktop is reachable over SSH, open 3dich window directly on Toshi!
  if ssh -o BatchMode=yes -o ConnectTimeout=2 toshi@100.79.246.19 \
    'export DISPLAY=:0 XAUTHORITY=/home/toshi/.Xauthority DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$(id -u)/bus";
     URL="http://100.69.155.110:8099";
     curl -sf --max-time 0.7 "http://192.168.1.100:8099/api/health" >/dev/null 2>&1 && URL="http://192.168.1.100:8099";
     for b in chromium chromium-browser google-chrome brave-browser firefox xdg-open; do
       if command -v "$b" >/dev/null 2>&1; then
         if [ "$b" = "firefox" ] || [ "$b" = "xdg-open" ]; then
           nohup "$b" "$URL" >/dev/null 2>&1 </dev/null &
         else
           nohup "$b" --app="$URL" >/dev/null 2>&1 </dev/null &
         fi
         exit 0
       fi
     done; exit 1' 2>/dev/null; then
    echo "3dich Toshi masaüstünde açıldı ($LAN_URL | $TS_URL)"
    return 0
  fi

  echo "3dich hazır:"
  echo "  Yerel     : $LOCAL_URL"
  echo "  LAN       : $LAN_URL"
  echo "  Tailscale : $TS_URL"
  echo "  GitHub Web: $GLOBAL_URL"
}

case "${1:-}" in
  ""|open)
    open_studio
    ;;
  status|--status)
    docker ps --filter "name=^/3dich$" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
    curl -s "$HEALTH_URL" || true
    echo ""
    systemctl --user is-active 3dich-agy-bridge.service 2>/dev/null | sed 's/^/AGY Kasa Zero-Trust Bridge: /' || true
    echo "Yerel: $LOCAL_URL | LAN: $LAN_URL | Tailscale: $TS_URL | Web: $GLOBAL_URL"
    ;;
  token|--token)
    if [ -f "$TOKEN_FILE" ]; then
      echo "AGY Kasa Zero-Trust Token (chmod 600 — gizli tut):"
      cat "$TOKEN_FILE"
    else
      python3 "$APP_DIR/scripts/agy_secure_bridge.py" --print-token
    fi
    ;;
  logs)
    shift
    exec docker compose -f "$COMPOSE_FILE" logs -f "${@:-}"
    ;;
  up|start)
    docker compose -f "$COMPOSE_FILE" up -d
    ensure_running
    ;;
  down|stop)
    docker compose -f "$COMPOSE_FILE" down
    ;;
  restart)
    docker compose -f "$COMPOSE_FILE" restart
    ensure_running
    ;;
  url)
    echo "$LOCAL_URL"
    ;;
  --help|-h|help)
    echo "Kullanım: 3dich [open|status|token|logs|start|stop|restart|url]"
    ;;
  *)
    echo "Bilinmeyen seçenek: $1 (Kullanım: 3dich [open|status|token|logs|start|stop|restart|url])" >&2
    exit 1
    ;;
esac
