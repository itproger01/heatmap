#!/usr/bin/env bash
# ============================================================
# ApexScalp — one-command launcher
# Запускает backend (Flask) + frontend (Vite) одновременно
# Ctrl+C — корректно останавливает оба
# ============================================================
set -e

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

# ---------- цвета ----------
C_R="\033[0m"
C_G="\033[32m"
C_Y="\033[33m"
C_C="\033[36m"
C_B="\033[1m"

echo -e "${C_C}${C_B}"
echo "  ╔══════════════════════════════════════════╗"
echo "  ║         ApexScalp Terminal               ║"
echo "  ║         launcher v1.0                    ║"
echo "  ╚══════════════════════════════════════════╝"
echo -e "${C_R}"

# ---------- 1. Убить старые процессы ----------
echo -e "${C_Y}→ Очищаю порты 5050 / 5173…${C_R}"
lsof -ti :5050 2>/dev/null | xargs kill -9 2>/dev/null || true
lsof -ti :5173 2>/dev/null | xargs kill -9 2>/dev/null || true
sleep 1

# ---------- 2. Backend venv ----------
if [ ! -d ".venv" ]; then
  echo -e "${C_Y}→ .venv не найден, создаю…${C_R}"
  python3.13 -m venv .venv 2>/dev/null || python3 -m venv .venv
fi

# ---------- 3. Backend deps ----------
if ! .venv/bin/python -c "import flask, requests, orjson, aiohttp, websockets, flask_socketio" 2>/dev/null; then
  echo -e "${C_Y}→ Устанавливаю Python-зависимости…${C_R}"
  .venv/bin/pip install --quiet --upgrade pip
  .venv/bin/pip install --quiet -r requirements.txt
fi

# ---------- 4. Frontend deps ----------
if [ ! -d "frontend/node_modules" ]; then
  echo -e "${C_Y}→ Устанавливаю Node-зависимости (первый раз ~30 сек)…${C_R}"
  (cd frontend && npm install --silent)
fi

# ---------- 5. Запуск backend в фоне ----------
echo -e "${C_G}→ Запускаю backend (Flask) на :5050${C_R}"
.venv/bin/python app.py > /tmp/apexscalp-backend.log 2>&1 &
BACKEND_PID=$!

# ---------- 6. Ждём готовности backend ----------
echo -n "  жду backend"
for i in {1..30}; do
  if curl -s -o /dev/null http://localhost:5050/api/health 2>/dev/null; then
    echo -e " ${C_G}✓${C_R}"
    break
  fi
  echo -n "."
  sleep 0.5
done

# ---------- 7. Trap для корректной остановки ----------
cleanup() {
  echo ""
  echo -e "${C_Y}→ Останавливаю…${C_R}"
  kill $BACKEND_PID 2>/dev/null || true
  kill $FRONTEND_PID 2>/dev/null || true
  lsof -ti :5050 2>/dev/null | xargs kill -9 2>/dev/null || true
  lsof -ti :5173 2>/dev/null | xargs kill -9 2>/dev/null || true
  echo -e "${C_G}✓ Остановлено${C_R}"
  exit 0
}
trap cleanup INT TERM

# ---------- 8. Запуск frontend в фоне ----------
echo -e "${C_G}→ Запускаю frontend (Vite) на :5173${C_R}"
(cd frontend && npm run dev --silent) > /tmp/apexscalp-frontend.log 2>&1 &
FRONTEND_PID=$!

# ---------- 9. Ждём Vite ----------
echo -n "  жду frontend"
for i in {1..40}; do
  if curl -s -o /dev/null http://localhost:5173 2>/dev/null; then
    echo -e " ${C_G}✓${C_R}"
    break
  fi
  echo -n "."
  sleep 0.5
done

# ---------- 10. Красивый финал ----------
echo ""
echo -e "${C_G}${C_B}"
echo "  ╔══════════════════════════════════════════╗"
echo "  ║  ✓ Готово! Открой в браузере:            ║"
echo "  ║                                          ║"
echo -e "  ║   ${C_C}http://localhost:5173${C_G}                 ║"
echo "  ║                                          ║"
echo "  ║  С телефона (в той же WiFi):             ║"
IP=$(ipconfig getifaddr en0 2>/dev/null || echo "192.168.x.x")
echo -e "  ║   ${C_C}http://$IP:5173${C_G}"
echo "  ║                                          ║"
echo "  ║  Ctrl+C — остановить всё                  ║"
echo "  ╚══════════════════════════════════════════╝"
echo -e "${C_R}"

# ---------- 11. Показываем логи в реальном времени ----------
echo -e "${C_Y}── Логи (backend | frontend) ──${C_R}"
tail -f /tmp/apexscalp-backend.log /tmp/apexscalp-frontend.log &
TAIL_PID=$!

# ждём любую из задач
wait
