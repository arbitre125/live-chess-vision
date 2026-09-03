#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════
# إعداد الراسبيري من الصفر — Live Chess Vision
# شغّله على Raspberry Pi OS Bookworm (64-bit):
#   bash setup_pi.sh
# ═══════════════════════════════════════════════════════
set -e

GREEN='\033[0;32m'; RED='\033[0;31m'; NC='\033[0m'
step() { echo -e "${GREEN}==>${NC} $1"; }
fail() { echo -e "${RED}✖ $1${NC}"; exit 1; }

echo "╔══════════════════════════════════════════╗"
echo "║   Live Chess Vision — إعداد الراسبيري    ║"
echo "╚══════════════════════════════════════════╝"

step "تحديث النظام (قد يستغرق دقائق)"
sudo apt update && sudo apt upgrade -y

step "تفعيل الكاميرا وواجهات الاتصال"
sudo raspi-config nonint do_camera 0 || true
sudo raspi-config nonint do_legacy 0 || true   # تفعيل legacy مطلوب لبعض إصدارات libcamera إذا لزم

step "تثبيت الاعتماديات"
sudo apt install -y python3-venv python3-pip git curl \
  libatlas-base-dev libjasper-dev libqt5gui5 libqt5test5 \
  ffmpeg avahi-daemon || fail "فشل تثبيت الحزم"

step "تثبيت Node.js 20 (لتشغيل صفحة الأدمن)"
if ! command -v node >/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt install -y nodejs
fi
node --version || fail "Node.js لم يُثبت"

step "تثبيت bun (مدير الحزم الأسرع لصفحة الأدمن)"
if ! command -v bun >/dev/null; then
  curl -fsSL https://bun.sh/install | bash
  export PATH="$HOME/.bun/bin:$PATH"
fi
bun --version || fail "bun لم يثبت"

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"

step "تجهيز بيئة بايثون لخدمة الرؤية"
python3 -m venv "$REPO_DIR/venv"
"$REPO_DIR/venv/bin/pip" install --upgrade pip
"$REPO_DIR/venv/bin/pip" install -r "$REPO_DIR/vision-service/requirements.txt" \
  || fail "فشل تثبيت حزم بايثون — تحقق من الاتصال"

step "تجهيز قاعدة بيانات صفحة الأدمن"
cd "$REPO_DIR/admin-app"
echo 'DATABASE_URL="file:./dev.db"' > .env
bun install || fail "فشل bun install"
bun run db:push || fail "فشل db:push"

step "إنشاء ملف إعداد خدمة الرؤية"
if [ ! -f "$REPO_DIR/vision-service/config.json" ]; then
  cp "$REPO_DIR/vision-service/config.example.json" "$REPO_DIR/vision-service/config.json"
fi

step "تثبيت الخدمات لبدء التشغيل التلقائي"
sudo tee /etc/systemd/system/live-chess-vision.service > /dev/null <<EOF
[Unit]
Description=Live Chess Vision - خدمة الكشف
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$REPO_DIR/vision-service
ExecStart=$REPO_DIR/venv/bin/python3 main.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

cat > "$HOME/.config/systemd/user/live-chess-admin.service" <<EOF
[Unit]
Description=Live Chess Vision - صفحة الأدمن
After=network.target

[Service]
Type=simple
WorkingDirectory=$REPO_DIR/admin-app
ExecStart=$HOME/.bun/bin/bun run start
Restart=always
RestartSec=5
Environment=DATABASE_URL=file:$REPO_DIR/admin-app/prisma/dev.db

[Install]
WantedBy=default.target
EOF

sudo systemctl daemon-reload
systemctl --user daemon-reload
sudo systemctl enable live-chess-vision.service
systemctl --user enable live-chess-admin.service

echo ""
echo -e "${GREEN}✓ اكتمل الإعداد!${NC}"
echo ""
echo "الخطوات التالية:"
echo "  1. شغّل صفحة الأدمن:   systemctl --user start live-chess-admin"
echo "  2. شغّل خدمة الرؤية:   sudo systemctl start live-chess-vision"
echo "  3. افتح من أي متصفح:   http://raspberrypi.local:3000"
echo "  4. أضف كاميرا واعرضها معايرة من تبويب الكاميرات"
echo ""
echo "أداة المعايرة التفاعلية (بشاشة أو VNC):"
echo "  cd $REPO_DIR/vision-service && ../venv/bin/python3 calibrate.py --type picamera2 --device 0"
