#!/usr/bin/env bash
# =====================================================================
# تثبيت الخادم المركزي v2 — حاسوب البطولة (Linux/WSL) أو Raspberry Pi
# يثبت: بايثون + مكتبات الرؤية + نماذج ONNX + صفحة الأدمن + خدمات systemd
# الاستخدام: bash scripts/setup_server.sh
# =====================================================================
set -e
BLUE='\033[0;34m'; GREEN='\033[1;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
say() { echo -e "${BLUE}▸${NC} $1"; }
ok()  { echo -e "${GREEN}✓${NC} $1"; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo ""
echo "══════════════════════════════════════════════════"
echo "   Live Chess Vision v2 — تثبيت الخادم المركزي"
echo "══════════════════════════════════════════════════"
echo ""

# ---------------------------------------------------------------- python
say "فحص بايثون 3..."
if command -v python3 >/dev/null; then
  PY=python3
else
  echo "✗ بايثون 3 مطلوب — ثبته أولاً (sudo apt install python3 python3-venv python3-pip)"
  exit 1
fi
ok "بايثون: $($PY --version)"

# ---------------------------------------------------------------- venv
say "إنشاء بيئة بايثون افتراضية..."
cd vision-service
[ -d .venv ] || $PY -m venv .venv
source .venv/bin/activate
ok "البيئة جاهزة"

say "تثبيت مكتبات الرؤية (قد يستغرق دقائق)..."
pip install --upgrade pip --quiet
pip install -r requirements.txt --quiet
ok "المكتبات مثبتة"

say "تحميل نماذج ONNX (قطع + آزوايا — 8MB)..."
$PY download_models.py || {
  echo -e "${YELLOW}⚠ تعذر التحميل التلقائي — حمّل يدوياً الروابط في download_models.py${NC}"
}
cd "$ROOT"

# ---------------------------------------------------------------- node
say "فحص Node.js لصفحة الأدمن..."
if ! command -v node >/dev/null; then
  echo "ثبّت Node.js 20+ من https://nodejs.org ثم أعد تشغيل السكربت"
  exit 1
fi
ok "Node: $(node --version)"

say "تثبيت مكتبات صفحة الأدمن..."
cd admin-app
[ -d node_modules ] || npm install --silent
ok "أدمن جاهزة"

# قاعدة البيانات
if [ ! -f prisma/dev.db ]; then
  say "إنشاء قاعدة البيانات..."
  npx prisma db push --skip-generate >/dev/null
  ok "قاعدة البيانات"
fi
npx prisma generate >/dev/null
cd "$ROOT"

# ---------------------------------------------------------------- systemd
if command -v systemctl >/dev/null && [ -d /etc/systemd/system ]; then
  say "تثبيت خدمات systemd (تشغيل تلقائي عند الإقلاع)..."
  VISION_UNIT=vision-service/systemd/vision-server.service
  ADMIN_UNIT=vision-service/systemd/admin-app.service

  # توليد وحدة الأدمن مع المسار الصحيح
  mkdir -p /tmp/lcv
  sed "s|/home/pi/live-chess-vision|$ROOT|g; s|User=pi|User=$USER|" "$VISION_UNIT" > /tmp/lcv/vision-server.service
  cat > /tmp/lcv/admin-app.service <<EOF
[Unit]
Description=Live Chess Vision — صفحة الأدمن (Next.js)
After=network-online.target vision-server.service
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$ROOT/admin-app
ExecStart=$(command -v npm) run start
Environment="PORT=3000"
Restart=always
RestartSec=5
User=$USER

[Install]
WantedBy=multi-user.target
EOF

  sudo cp /tmp/lcv/*.service /etc/systemd/system/
  sudo systemctl daemon-reload
  sudo systemctl enable --now vision-server admin-app
  ok "الخدمتان تعملان وتبدآن مع الإقلاع"
  echo "   sudo systemctl status vision-server admin-app"
else
  echo -e "${YELLOW}▸ systemd غير متاح — شغّل يدوياً في طرفيتين:${NC}"
  echo "  1) cd vision-service && source .venv/bin/activate && python server.py"
  echo "  2) cd admin-app && npm run dev"
fi

IP=$(hostname -I 2>/dev/null | awk '{print $1}')
echo ""
echo "══════════════════════════════════════════════════"
ok "التثبيت اكتمل!"
echo ""
echo "   صفحة الأدمن:      http://${IP:-localhost}:3000"
echo "   حالة الرؤية:      http://${IP:-localhost}:8000/health"
echo "   بث عقدة ESP32:    http://chesscam-1.local/stream"
echo ""
echo "   الخطوة التالية: أضف عقد الكاميرات من تبويب «الكاميرات»"
echo "══════════════════════════════════════════════════"
