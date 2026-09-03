# لوحة عقدة ESP32 — القطع والبرمجة 📦

## القطع لكل عقدة (قائمة مختصرة)

| القطعة | الكمية | ملاحظات |
|--------|-------:|---------|
| ESP32-CAM (AI-Thinker) | 1 | البديل: ESP32-WROOM-32U + وحدة OV2640 (لحام يدوي حسب مخطط ESP32-CAM) |
| ESP32-CAM-MB أو USB-TTL | 1 | للبرمجة |
| بطارية (انظر power-battery.md) | — | بنك USB أو حزمة 18650 |
| عدسة M12 عريضة (اختياري) | 1 | 2.1mm / 160° لتغطية 3–4 رقع |

## توصيل ESP32-WROOM-32U يدوياً (إن لم تستخدم لوحة جاهزة)

اتبع خريطة أرجل ESP32-CAM الرسمية (نفسها في الفيرموير `chesscam_node.ino`):

| إشارة OV2640 | GPIO ESP32 |
|--------------|-----------:|
| PWDN | 32 |
| XCLK | 0 |
| SIOD (SDA) | 26 |
| SIOC (SCL) | 27 |
| D7..D0 | 39, 36, 23, 18, 19, 21, 34, 35 |
| VSYNC | 25 |
| HREF | 23* |
| PCLK | 22 |

\* انتبه: في AI-Thinker HREF=23 وD7=39 — انسخ القيم من تعريف `BOARD_AI_THINKER`
في الفيرموير حرفياً. موصل U.FL للهوائي الخارجي على موديول 32U (فك الجسر على
اللوحة إن وجد لتفعيل الهوائي الخارجي بدل المدمج).

## البرمجة خطوة بخطوة

1. **حمّل Arduino IDE** (أو PlatformIO) وأضف دعم ESP32:
   - File → Preferences → Additional Boards URLs:
     `https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json`
   - Boards Manager → ابحث "esp32" → ثبّت Espressif Systems.
2. **افتح** `esp32-firmware/chesscam_node/chesscam_node.ino`.
3. اختر اللوحة: **AI Thinker ESP32-CAM** (أو ESP32 Dev Module لعقدة 32U).
4. ضع `BOARD_WROOM_32U 1` إذا كانت عقدة 32U يدوية.
5. **اربط**: ESP32-CAM-MB بالـ USB (أو USB-TTL: 5V→5V، GND→GND، U0R→U0T، U0T→U0R،
   IO0→GND أثناء التشغيل لوضع البرمجة).
6. Upload (انتظر مئات الثواني أولاً مرة).
7. **Monitor Serial 115200** — ستظهر:
   - إن لم تُضبط الشبكة بعد: شبكة `ChessCam-XXXX` بكلمة `12345678`
     - اتصل بها من هاتفك → افتح `http://192.168.4.1` → أدخل اسم شبكة النادي وكلمة سرها → حفظ.
   - بعد الاتصال: `جاهز: http://chesscam-1.local/stream`
8. افتح الرابط في متصفح — سترى البث الحي وزر الإعدادات.
9. في صفحة الأدمن أضف العقدة برابط البث نفسه.

## تعدد العقد

- غيّر رقم العقدة من بوابة الإعداد (اسم العقدة: 1، 2، 3...) —
  كل عقدة تأخذ `chesscam-N.local` مختلفاً.
- اربط كل العقد بشبكة WiFi نفسها التي يتصل بها خادم الرؤية.
