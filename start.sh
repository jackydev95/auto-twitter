#!/usr/bin/env bash
set -euo pipefail

# Navigate to project root directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

MODE="${1:-dev}"
PORT="${PORT:-8000}"
AUTO_CRON_INTERVAL="${AUTO_CRON_INTERVAL:-60}"

echo "========================================================"
echo "  𝕏 Auto-Follow Studio (Next.js + pnpm + Vercel Redis)  "
echo "========================================================"

# 1. Check pnpm availability
if ! command -v pnpm >/dev/null 2>&1; then
  echo "[!] Không tìm thấy pnpm. Đang kích hoạt qua corepack..."
  corepack enable pnpm || npm install -g pnpm
fi

# 2. Install dependencies if node_modules does not exist
if [ ! -d "node_modules" ]; then
  echo "[*] Đang cài đặt dependencies với pnpm..."
  pnpm install
fi

# 3. Check environment file
if [ -f ".env.local" ]; then
  echo "[✓] Đã tìm thấy cấu hình môi trường .env.local (Vercel Redis)"
elif [ -f ".env" ]; then
  echo "[✓] Đã tìm thấy cấu hình môi trường .env"
else
  echo "[i] Chưa có .env.local — hệ thống sẽ tự động dùng Local Fallback hoặc bạn có thể chạy: vercel env pull .env.local"
fi

# 4. Optional background Auto-Follow API caller loop
start_background_auto_follow_loop() {
  (
    sleep 6
    echo "[⚡] Background Auto-Follow Worker đã khởi động (Gọi POST /api/cron/auto-follow mỗi ${AUTO_CRON_INTERVAL}s)"
    while true; do
      curl -s -X POST "http://localhost:${PORT}/api/cron/auto-follow" \
        -H "Content-Type: application/json" \
        -d '{"trigger":"auto_interval"}' >/dev/null 2>&1 || true
      sleep "${AUTO_CRON_INTERVAL}"
    done
  ) &
  BG_CRON_PID=$!
  trap 'kill "${BG_CRON_PID}" 2>/dev/null || true' EXIT INT TERM
}

echo "[*] User Portal     : http://localhost:${PORT}"
echo "[*] Admin Dashboard : http://localhost:${PORT}/admin"
echo "[*] Follow API      : http://localhost:${PORT}/api/cron/auto-follow"
echo "========================================================"

case "$MODE" in
  prod|production|start)
    echo "[*] Chế độ Production: Building & Starting server trên cổng ${PORT}..."
    pnpm build
    start_background_auto_follow_loop
    PORT="$PORT" pnpm exec next start -p "$PORT"
    ;;
  build)
    echo "[*] Đang build production bundle..."
    pnpm build
    ;;
  cron)
    echo "[*] Đang gọi trực tiếp API Auto-Follow tại http://localhost:${PORT}/api/cron/auto-follow ..."
    curl -i -X POST "http://localhost:${PORT}/api/cron/auto-follow" \
      -H "Content-Type: application/json" \
      -d '{"trigger":"manual"}'
    echo ""
    ;;
  dev|*)
    echo "[*] Chế độ Development: Đang khởi chạy Next.js server trên cổng ${PORT}..."
    start_background_auto_follow_loop
    PORT="$PORT" pnpm exec next dev -p "$PORT"
    ;;
esac

