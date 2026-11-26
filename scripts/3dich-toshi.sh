#!/usr/bin/env bash
set -euo pipefail

GLOBAL_URL="https://meucak.github.io/3dich/"
TOKEN_FILE="$HOME/.config/3dich/agy_bridge_token"
CANDIDATES=(
  "http://192.168.1.100:8099"
  "http://100.69.155.110:8099"
)

find_kasa() {
  for u in "${CANDIDATES[@]}"; do
    if curl -fsS --max-time 0.9 "${u}/api/health" >/dev/null 2>&1; then
      echo "$u"
      return 0
    fi
  done
  return 1
}

launch_url() {
  local url="$1"
  export DISPLAY="${DISPLAY:-:0}"
  export XAUTHORITY="${XAUTHORITY:-$HOME/.Xauthority}"
  for b in chromium chromium-browser google-chrome brave-browser microsoft-edge firefox xdg-open; do
    if command -v "$b" >/dev/null 2>&1; then
      if [ "$b" = "firefox" ] || [ "$b" = "xdg-open" ]; then
        nohup "$b" "$url" >/dev/null 2>&1 </dev/null &
      else
        nohup "$b" --app="$url" >/dev/null 2>&1 </dev/null &
      fi
      echo "3dich açıldı: $url"
      return 0
    fi
  done
  echo "3dich URL: $url"
}

case "${1:-}" in
  ""|open)
    if KASA="$(find_kasa)"; then
      launch_url "$KASA"
    else
      launch_url "$GLOBAL_URL"
    fi
    ;;
  --global|global)
    launch_url "$GLOBAL_URL"
    ;;
  token|--token)
    if [ -f "$TOKEN_FILE" ]; then
      echo "AGY Toshi Zero-Trust Token (chmod 600 — gizli tut):"
      cat "$TOKEN_FILE"
    else
      echo "AGY Toshi bridge token henüz oluşturulmadı (~/.config/3dich/agy_bridge_token)." >&2
      exit 1
    fi
    ;;
  status|--status)
    if KASA="$(find_kasa)"; then
      echo "3dich Kasa Düğümü : ÇEVRİMİÇİ ($KASA)"
      curl -fsS --max-time 1.5 "${KASA}/api/health" || true
      echo ""
    else
      echo "3dich Kasa Düğümü : KAPALI (Çevrimdışı PWA hazır: $GLOBAL_URL)"
    fi
    systemctl --user is-active 3dich-agy-bridge.service 2>/dev/null | sed 's/^/AGY Toshi Zero-Trust Bridge: /' || true
    ;;
  --help|-h|help)
    echo "Kullanım: 3dich [open|--global|status|token]"
    ;;
  *)
    echo "Bilinmeyen seçenek: $1 (Kullanım: 3dich [open|--global|status|token])" >&2
    exit 1
    ;;
esac
