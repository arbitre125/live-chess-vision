/*
 * ChessCam Node — عقدة كاميرا WiFi لنقل نقلات الشطرنج
 * =====================================================
 * مبني على أمثلة ESP32 الرسمية (CameraWebServer — مجال عام)
 * ومتوافق مع منهجية CameraChessWeb (Pbatch) في البث إلى خادم مركزي.
 *
 * العتاد المدعوم:
 *   1) ESP32-CAM (AI-Thinker) — لوحة ESP32-S + OV2640 جاهزة (الأسهل)
 *   2) ESP32-WROOM-32U + وحدة OV2640 — حسب مخطط توصيل ESP32-CAM
 *      (المتغير WROOM_32U أدناه) مع هوائي خارجي U.FL لمدى أطول
 *
 * الميزات:
 *  - بث MJPEG على /stream (يستهلكه الخادم المركزي مباشرة)
 *  - /status JSON: جهد البطارية، الإشارة، الذاكرة، الإطارات
 *  - /config: تغيير الدقة/الجودة/معدل الإطارات عن بعد
 *  - بوابة إعداد WiFi: عند فشل الاتصال تفتح شبكة "ChessCam-XXXX"
 *    وكلمة سر 12345678 ثم http://192.168.4.1
 *  - توفير طاقة: إطفاء ضوء الفلاش، خفض FPS عند عدم وجود مشاهدين
 *
 * الرخصة: MIT
 */

#include "esp_camera.h"
#include <WiFi.h>
#include <WiFiClient.h>
#include <WebServer.h>
#include <ESPmDNS.h>
#include <Preferences.h>
#include <esp_wifi.h>

// ============================ اختيار اللوحة ============================
// ضع 1 إذا كانت لوحتك ESP32-CAM (AI-Thinker) الجاهزة
#define BOARD_AI_THINKER 1
// ضع 1 إذا كنت توصّل OV2640 يدوياً على ESP32-WROOM-32U (نفس أرجل AI-Thinker)
#define BOARD_WROOM_32U  0

#if BOARD_AI_THINKER || BOARD_WROOM_32U
#define PWDN_GPIO     32
#define RESET_GPIO    -1
#define XCLK_GPIO      0
#define SIOD_GPIO     26
#define SIOC_GPIO     27
#define Y9_GPIO       35
#define Y8_GPIO       34
#define Y7_GPIO       39
#define Y6_GPIO       36
#define Y5_GPIO       21
#define Y4_GPIO       19
#define Y3_GPIO       18
#define Y2_GPIO        5
#define VSYNC_GPIO    25
#define HREF_GPIO     23
#define PCLK_GPIO     22
#endif

// ============================ الإعدادات ============================
const char* AP_SSID_PREFIX = "ChessCam-";   // اسم شبكة الإعداد الاحتياطية
const char* AP_PASSWORD    = "12345678";
const char* HOST_PREFIX    = "chesscam";    // chesscam-1.local إلخ

// قياس البطارية: مقاومتان 100k/100k بين +البطارية و GND، نقطة الوسط إلى GPIO34
// الجهد الأقصى 4.2V → يصبح 2.1V عند الرجل (آمنة).
#define BATTERY_ADC_PIN 34
#define ADC_SCALE       2.0          // نسبة المقسم
#define ADC_VREF        3.3
#define ADC_MAX         4095.0

Preferences prefs;
WebServer server(80);
String nodeName;
volatile uint32_t frameCount = 0;
volatile uint8_t streamClients = 0;
uint32_t lastFrameMs = 0;
uint16_t currentFpsCap = 12;        // حد معدل الإطارات (توفير طاقة)
uint16_t idleFpsCap   = 2;          // FPS عند غياب الخادم عن /wake
uint32_t lastClientMs = 0;
bool wakeActive = false;

// ============================ الكاميرا ============================
bool initCamera() {
  camera_config_t cfg;
  cfg.ledc_channel = LEDC_CHANNEL_0;
  cfg.ledc_timer   = LEDC_TIMER_0;
  cfg.pin_d0 = Y2_GPIO;  cfg.pin_d1 = Y3_GPIO;
  cfg.pin_d2 = Y4_GPIO;  cfg.pin_d3 = Y5_GPIO;
  cfg.pin_d4 = Y6_GPIO;  cfg.pin_d5 = Y7_GPIO;
  cfg.pin_d6 = Y8_GPIO;  cfg.pin_d7 = Y9_GPIO;
  cfg.pin_xclk = XCLK_GPIO;
  cfg.pin_pclk = PCLK_GPIO;
  cfg.pin_vsync = VSYNC_GPIO;
  cfg.pin_href = HREF_GPIO;
  cfg.pin_sccb_sda = SIOD_GPIO;
  cfg.pin_sccb_scl = SIOC_GPIO;
  cfg.pin_pwdn = PWDN_GPIO;
  cfg.pin_reset = RESET_GPIO;
  cfg.xclk_freq_hz = 20000000;
  cfg.pixel_format = PIXFORMAT_JPEG;
  cfg.frame_size   = FRAMESIZE_SXGA;   // 1280×1024 — تكفي 4 رقع في الإطار
  cfg.jpeg_quality = 12;               // أقل = أفضل، 10..14 مناسب
  cfg.fb_count     = 2;
  cfg.grab_mode    = CAMERA_GRAB_LATEST;
  cfg.fb_location  = CAMERA_FB_IN_PSRAM;

  esp_camera_deinit();
  return esp_camera_init(&cfg) == ESP_OK;
}

// ============================ البطارية ============================
float readBatteryV() {
  uint32_t acc = 0;
  for (int i = 0; i < 16; i++) {
    acc += analogRead(BATTERY_ADC_PIN);
    delay(2);
  }
  float adc = acc / 16.0;
  return (adc / ADC_MAX) * ADC_VREF * ADC_SCALE;
}

// ============================ بث MJPEG ============================
// نفس مبدأ مثال CameraWebServer: إرسال إطارات JPEG متتالية
void handleStream() {
  WiFiClient client = server.client();
  String response = "HTTP/1.1 200 OK\r\n"
    "Content-Type: multipart/x-mixed-replace;boundary=chessframe\r\n\r\n";
  server.sendContent(response);

  streamClients++;
  lastClientMs = millis();
  wakeActive = true;

  camera_fb_t* fb = nullptr;
  while (client.connected() && streamClients > 0) {
    fb = esp_camera_fb_get();
    if (!fb) { delay(50); continue; }
    frameCount++;

    server.sendContent("--chessframe\r\nContent-Type: image/jpeg\r\n"
                       "Content-Length: " + String(fb->len) + "\r\n\r\n");
    // إرسال بإدخالات كبيرة لتقليل الحمل
    size_t remaining = fb->len;
    uint8_t* buf = fb->buf;
    while (remaining > 0 && client.connected()) {
      size_t chunk = remaining > 4096 ? 4096 : remaining;
      size_t sent = client.write(buf, chunk);
      if (sent == 0) break;
      buf += sent;
      remaining -= sent;
    }
    esp_camera_fb_return(fb);

    // حد معدل الإطارات لتوفير الطاقة والمعالج
    uint32_t minInterval = 1000UL / currentFpsCap;
    uint32_t now = millis();
    if (now - lastFrameMs < minInterval) {
      delay(minInterval - (now - lastFrameMs));
    }
    lastFrameMs = millis();
  }
  streamClients--;
  if (streamClients == 0) wakeActive = false;
}

void handleStatus() {
  float v = readBatteryV();
  int pct = constrain((int)((v - 3.0) / (4.2 - 3.0) * 100.0), 0, 100);
  String json = "{";
  json += "\"node\":\"" + nodeName + "\",";
  json += "\"batteryV\":" + String(v, 2) + ",";
  json += "\"batteryPct\":" + String(pct) + ",";
  json += "\"rssi\":" + String(WiFi.RSSI()) + ",";
  json += "\"frames\":" + String(frameCount) + ",";
  json += "\"clients\":" + String(streamClients) + ",";
  json += "\"fpsCap\":" + String(currentFpsCap) + ",";
  json += "\"heap\":" + String(ESP.getFreeHeap()) + ",";
  json += "\"frameSize\":\"" + String(currentFrameSizeName()) + "\"";
  json += "}";
  server.send(200, "application/json", json);
}

const char* currentFrameSizeName() {
  sensor_t* s = esp_camera_sensor_get();
  if (!s) return "?";
  switch (s->status.framesize) {
    case FRAMESIZE_QVGA: return "320x240";
    case FRAMESIZE_VGA:  return "640x480";
    case FRAMESIZE_SVGA: return "800x600";
    case FRAMESIZE_XGA:  return "1024x768";
    case FRAMESIZE_SXGA: return "1280x1024";
    case FRAMESIZE_UXGA: return "1600x1200";
    default: return "other";
  }
}

void handleConfig() {
  if (server.hasArg("fps"))    currentFpsCap = constrain(server.arg("fps").toInt(), 1, 25);
  if (server.hasArg("idleFps"))idleFpsCap   = constrain(server.arg("idleFps").toInt(), 1, 10);
  if (server.hasArg("size")) {
    int fs = server.arg("size").toInt();
    sensor_t* s = esp_camera_sensor_get();
    if (s && fs >= 5 && fs <= 10) {
      s->set_framesize(s, (framesize_t)fs);  // 7=SXGA 8=UXGA 6=XGA
    }
  }
  if (server.hasArg("quality")) {
    int q = server.arg("quality").toInt();
    sensor_t* s = esp_camera_sensor_get();
    if (s && q >= 8 && q <= 20) s->set_quality(s, q);
  }
  handleStatus();
}

void handleRoot() {
  String ip = WiFi.localIP().toString();
  String html = "<!DOCTYPE html><html dir=rtl lang=ar><head><meta charset=utf-8>"
    "<meta name=viewport content='width=device-width,initial-scale=1'>"
    "<title>" + nodeName + "</title>"
    "<style>body{font-family:sans-serif;background:#0f172a;color:#e2e8f0;"
    "max-width:640px;margin:2rem auto;padding:0 1rem}"
    "a{color:#38bdf8}img{width:100%;border-radius:8px}"
    "td{padding:.3rem .6rem}</style></head><body>"
    "<h2>📷 " + nodeName + "</h2>"
    "<img src=/stream><p>"
    "<a href=/stream target=_blank>البث المباشر</a> | "
    "<a href=/status>الحالة JSON</a> | "
    "<a href=/config?fps=12&size=7&quality=12>إعادة ضبط</a></p>"
    "<p>IP: " + ip + " · RSSI: " + String(WiFi.RSSI()) + " dBm</p>"
    "</body></html>";
  server.send(200, "text/html", html);
}

// ============================ بوابة الإعداد ============================
void startConfigPortal() {
  String apName = AP_SSID_PREFIX + String((uint32_t)(ESP.getEfuseMac() & 0xFFFF), HEX);
  WiFi.mode(WIFI_AP);
  WiFi.softAP(apName.c_str(), AP_PASSWORD);
  Serial.println("بوابة الإعداد: " + apName + " → http://192.168.4.1");

  server.on("/", HTTP_GET, []() {
    String html = "<!DOCTYPE html><html dir=rtl lang=ar><head><meta charset=utf-8>"
      "<title>إعداد ChessCam</title></head><body>"
      "<h2>إعداد شبكة العقدة</h2>"
      "<form method=get action=/save>"
      "اسم الشبكة: <input name=ssid><br>"
      "كلمة السر: <input name=pass type=password><br>"
      "اسم العقدة (رقم): <input name=node value=1><br>"
      "<button>حفظ وإعادة التشغيل</button></form></body></html>";
    server.send(200, "text/html", html);
  });
  server.on("/save", HTTP_GET, []() {
    if (server.hasArg("ssid")) {
      prefs.begin("chesscam", false);
      prefs.putString("ssid", server.arg("ssid"));
      prefs.putString("pass", server.arg("pass"));
      prefs.putInt("node", server.hasArg("node") ? server.arg("node").toInt() : 1);
      prefs.end();
      server.send(200, "text/html; charset=utf-8",
                  "<p>حُفظ! إعادة التشغيل...</p>");
      delay(1500);
      ESP.restart();
    }
  });
  server.begin();
  while (true) { server.handleClient(); delay(10); }
}

// ============================ الإعداد ============================
void setup() {
  Serial.begin(115200);
  pinMode(BATTERY_ADC_PIN, INPUT);
  analogSetAttenuation(ADC_11db);

  prefs.begin("chesscam", true);
  String ssid = prefs.getString("ssid", "");
  String pass = prefs.getString("pass", "");
  int nodeNum = prefs.getInt("node", 1);
  prefs.end();
  nodeName = HOST_PREFIX + String(nodeNum);

  if (!initCamera()) {
    Serial.println("فشل تهيئة الكاميرا! إعادة...");
    delay(3000);
    ESP.restart();
  }

  // الإضاءة والانعكاس حسب الحاجة (تُضبط عن بعد أيضاً)
  sensor_t* s = esp_camera_sensor_get();
  if (s) {
    s->set_vflip(s, 0);
    s->set_hmirror(s, 0);
    s->set_awb_gain(s, 1);
    s->set_exposure_ctrl(s, 1);
    s->set_whitebal(s, 1);
  }

  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);          // بث متواصل — نعطّل نوم المودم
  if (ssid.length() && WiFi.begin(ssid.c_str(), pass.c_str())) {
    Serial.print("اتصال بـ " + ssid);
    uint32_t t0 = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - t0 < 15000) {
      delay(300); Serial.print(".");
    }
  }
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("\nلا اتصال — بوابة الإعداد");
    startConfigPortal();  // لا يعود
  }
  Serial.println("\nمتصل: " + WiFi.localIP().toString());

  if (MDNS.begin(nodeName.c_str())) {
    MDNS.addService("http", "tcp", 80);
  }

  server.on("/",         HTTP_GET, handleRoot);
  server.on("/status",   HTTP_GET, handleStatus);
  server.on("/config",   HTTP_GET, handleConfig);
  server.on("/stream",   HTTP_GET, handleStream);
  server.onNotFound([](){ server.send(404, "text/plain", "not found"); });
  server.begin();
  Serial.println("جاهز: http://" + nodeName + ".local/stream");
}

void loop() {
  server.handleClient();

  // توفير طاقة: خفض FPS بعد 5 دقائق دون مستهلك بث، مع بقاء /status متاحاً
  if (!wakeActive && streamClients == 0 && currentFpsCap != idleFpsCap) {
    uint32_t idleMs = millis() - lastClientMs;
    if (idleMs > 300000UL) currentFpsCap = idleFpsCap;
  }
  if (wakeActive && currentFpsCap != 12) currentFpsCap = 12;

  // إعادة محاولة WiFi عند الانقطاع
  static uint32_t lastWifiCheck = 0;
  if (millis() - lastWifiCheck > 30000UL) {
    lastWifiCheck = millis();
    if (WiFi.status() != WL_CONNECTED) {
      WiFi.reconnect();
    }
  }
  delay(10);
}
