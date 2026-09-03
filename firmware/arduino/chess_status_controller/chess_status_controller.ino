/* ═══════════════════════════════════════════════════════════════
   وحدة تحكم حالة الرقعة — Chess Status Controller
   أردوينو Uno/Nano مساعد للراسبيري في كل طاولة (اختياري):
   - زر أخضر: طلب بدء/إعادة لعبة
   - زر أحمر: طلب إنهاء اللعبة وتسجيل النتيجة
   - LED: أخضر = لعبة مباشرة | أصفر = في انتظار مزامنة | أحمر = خطأ كاميرا
   - بازر: نغمة عند كل نقلة تصل من الكاميرا
   - يرسل الأوامر عبر USB Serial إلى الراسبيري (115200 baud)

   التوصيل:
     زر أخضر  → D2 + GND (INPUT_PULLUP)
     زر أحمر  → D3 + GND (INPUT_PULLUP)
     LED أخضر → D5 عبر مقاومة 220Ω → GND
     LED أصفر → D6 عبر مقاومة 220Ω → GND
     LED أحمر → D7 عبر مقاومة 220Ω → GND
     بازر     → D8 → مقاومة 220Ω → سماعة 8Ω → GND
   ═══════════════════════════════════════════════════════════════ */

const int BTN_GREEN = 2;   // طلب بدء لعبة
const int BTN_RED   = 3;   // طلب إنهاء لعبة
const int LED_GREEN = 5;
const int LED_YELLOW= 6;
const int LED_RED   = 7;
const int BUZZER    = 8;

enum State { IDLE, LIVE, WAIT_SYNC, ERROR_CAM };
State state = IDLE;

unsigned long lastDebounce = 0;
const unsigned long DEBOUNCE_MS = 250;
unsigned long blinkTimer = 0;
bool blinkOn = false;

// عداد النقلات القادمة من الراسبيري (لعرض نبضة على البازر)
int pendingMoveBeeps = 0;

void setup() {
  pinMode(BTN_GREEN, INPUT_PULLUP);
  pinMode(BTN_RED,   INPUT_PULLUP);
  pinMode(LED_GREEN, OUTPUT);
  pinMode(LED_YELLOW,OUTPUT);
  pinMode(LED_RED,   OUTPUT);
  pinMode(BUZZER,    OUTPUT);

  Serial.begin(115200);
  Serial.println(F("READY:ChessStatusController"));
  setState(IDLE);
}

void loop() {
  handleButtons();
  updateLeds();
  handleBuzzer();
  handleSerial();
}

void setState(State s) {
  state = s;
  digitalWrite(LED_GREEN, s == LIVE);
  digitalWrite(LED_YELLOW, s == WAIT_SYNC);
  digitalWrite(LED_RED, s == ERROR_CAM);
}

void handleButtons() {
  unsigned long now = millis();
  if (now - lastDebounce < DEBOUNCE_MS) return;

  if (digitalRead(BTN_GREEN) == LOW) {
    lastDebounce = now;
    Serial.println(F("CMD:START_GAME"));
    beep(1200, 80);
  }
  if (digitalRead(BTN_RED) == LOW) {
    lastDebounce = now;
    Serial.println(F("CMD:FINISH_GAME"));
    beep(600, 150);
  }
}

void updateLeds() {
  // عند الانتظار أو الخطأ: وميض لجذب الانتباه
  if (state == WAIT_SYNC || state == ERROR_CAM) {
    if (millis() - blinkTimer > 300) {
      blinkTimer = millis();
      blinkOn = !blinkOn;
      int pin = (state == WAIT_SYNC) ? LED_YELLOW : LED_RED;
      digitalWrite(pin, blinkOn);
    }
  }
}

void beep(int freq, int dur) {
  tone(BUZZER, freq, dur);
}

void handleBuzzer() {
  if (pendingMoveBeeps > 0) {
    beep(1500, 40);
    pendingMoveBeeps--;
    delay(60);
  }
}

/* الراسبيري ترسل أسطراً:
     EVT:MOVE            → نقلة جديدة (نغمة قصيرة)
     EVT:CHECK           → كش (نغمتان)
     EVT:MATE|1-0        → مات/نهاية (لحن قصير)
     EVT:STATE:LIVE      → تحديث الحالة
     EVT:STATE:WAIT_SYNC → مشكلة مزامنة
     EVT:STATE:ERROR     → مشكلة كاميرا
     EVT:STATE:IDLE      → لا لعبة
*/
void handleSerial() {
  if (!Serial.available()) return;
  String line = Serial.readStringUntil('\n');
  line.trim();

  if (line == "EVT:MOVE") {
    pendingMoveBeeps = 1;
  } else if (line == "EVT:CHECK") {
    pendingMoveBeeps = 2;
  } else if (line.startsWith("EVT:MATE")) {
    melody();
  } else if (line == "EVT:STATE:LIVE") {
    setState(LIVE);
  } else if (line == "EVT:STATE:WAIT_SYNC") {
    setState(WAIT_SYNC);
  } else if (line == "EVT:STATE:ERROR") {
    setState(ERROR_CAM);
  } else if (line == "EVT:STATE:IDLE") {
    setState(IDLE);
  }
}

void melody() {
  int notes[] = {1047, 1319, 1568, 2093};
  for (int i = 0; i < 4; i++) {
    tone(BUZZER, notes[i], 120);
    delay(150);
  }
}
