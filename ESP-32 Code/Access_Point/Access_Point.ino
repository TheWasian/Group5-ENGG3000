/*
  Whack-a-Mole access point

  Hardware Needed:
    - This ESP32: two ultrasonic sensors
    - Sensor node 1: two ultrasonic sensors
    - Sensor node 2: two ultrasonic sensors
*/

#include <WiFi.h>
#include <WiFiUdp.h>
#include <WebServer.h>
#include <math.h>
#include <stddef.h>

// --------------------------- GPIO ----------------------------------
// Replace -1 with your GPIO numbers before uploading.
constexpr int TRIG_PIN_1 = -1;
constexpr int ECHO_PIN_1 = -1;
constexpr int TRIG_PIN_2 = -1;
constexpr int ECHO_PIN_2 = -1;

// Optional warning outputs. Leave at -1 to disable that output.
constexpr int BUZZER_PIN = -1;
constexpr int WARNING_LED_PIN = -1;

// --------------------------- Wi-Fi ---------------------------------
const char *AP_SSID = "Wacker5";
const char *AP_PASSWORD = "PasswordWacker123456!";

const IPAddress AP_IP(192, 168, 4, 1);
const IPAddress AP_GATEWAY(192, 168, 4, 1);
const IPAddress AP_SUBNET(255, 255, 255, 0);
const IPAddress NODE_IPS[2] = {
  IPAddress(192, 168, 4, 101),
  IPAddress(192, 168, 4, 102)
};

constexpr uint16_t AP_UDP_PORT = 4210;
constexpr uint16_t NODE_UDP_PORT = 4211;

WiFiUDP udp;
WebServer server(80);

// ---------------------- Playing-area calibration -------------------
// Coordinate system: screen edge is y = 0; y increases into the playing
// area; x runs left-to-right. Measure and replace these coordinates after
// mounting the boxes. Defaults assume three 100 mm-wide stations across
// the screen edge of a 3 m x 3 m playing area.
constexpr float PLAY_AREA_WIDTH_M = 3.0f;
constexpr float PLAY_AREA_DEPTH_M = 3.0f;
constexpr float WARNING_DISTANCE_M = 0.50f;

struct SensorPosition {
  float x;
  float y;
};

// Order: node 1 pair, access-point pair, node 2 pair.
const SensorPosition SENSOR_POSITIONS[6] = {
  {0.00f, 0.00f}, {0.10f, 0.00f},
  {1.45f, 0.00f}, {1.55f, 0.00f},
  {2.90f, 0.00f}, {3.00f, 0.00f}
};

// Per-sensor calibration: corrected = raw * scale + offset.
const float SENSOR_SCALE[6] = {1, 1, 1, 1, 1, 1};
const float SENSOR_OFFSET_M[6] = {0, 0, 0, 0, 0, 0};

constexpr float MIN_RANGE_M = 0.02f;
constexpr float MAX_RANGE_M = 4.50f;
constexpr uint32_t ECHO_TIMEOUT_US = 27000;
constexpr uint32_t BETWEEN_PINGS_MS = 12;
constexpr uint32_t NODE_REPLY_TIMEOUT_MS = 90;
constexpr uint32_t RANGE_STALE_MS = 1200;
constexpr uint32_t CYCLE_GAP_MS = 20;

// -------------------------- Wire protocol --------------------------
constexpr uint32_t PACKET_MAGIC = 0x57414D35UL;  // "WAM5"
constexpr uint8_t PROTOCOL_VERSION = 1;
constexpr uint8_t PACKET_POLL = 1;
constexpr uint8_t PACKET_RANGES = 2;

struct __attribute__((packed)) PollPacket {
  uint32_t magic;
  uint8_t version;
  uint8_t type;
  uint8_t nodeId;
  uint8_t reserved;
  uint32_t sequence;
  uint32_t crc;
};

struct __attribute__((packed)) RangePacket {
  uint32_t magic;
  uint8_t version;
  uint8_t type;
  uint8_t nodeId;
  uint8_t validMask;
  uint32_t sequence;
  uint16_t distanceMm[2];
  uint32_t crc;
};

static_assert(sizeof(PollPacket) == 16, "Unexpected PollPacket padding");
static_assert(sizeof(RangePacket) == 20, "Unexpected RangePacket padding");

uint32_t crc32(const uint8_t *data, size_t length) {
  uint32_t crc = 0xFFFFFFFFUL;
  for (size_t i = 0; i < length; ++i) {
    crc ^= data[i];
    for (uint8_t bit = 0; bit < 8; ++bit) {
      crc = (crc >> 1) ^ (0xEDB88320UL & (0UL - (crc & 1UL)));
    }
  }
  return ~crc;
}

template <typename T>
bool packetCrcIsValid(const T &packet) {
  return packet.crc == crc32(reinterpret_cast<const uint8_t *>(&packet),
                            offsetof(T, crc));
}

// ------------------------- Ranging state ---------------------------
struct RangeSample {
  float metres;
  uint32_t updatedMs;
  bool valid;
};

RangeSample ranges[6] = {};
bool nodeOnline[2] = {false, false};
uint32_t nodeLastSeenMs[2] = {0, 0};

struct PositionEstimate {
  float x;
  float y;
  float rmsError;
  uint32_t updatedMs;
  uint8_t sensorsUsed;
  bool valid;
};

PositionEstimate position = {1.5f, 1.5f, 0, 0, 0, false};
bool warningActive = false;

enum PollState : uint8_t {
  START_LOCAL,
  WAIT_NODE_1,
  WAIT_NODE_2,
  FINISH_CYCLE
};

PollState pollState = START_LOCAL;
uint32_t nextCycleMs = 0;
uint32_t replyDeadlineMs = 0;
uint32_t sequenceNumber = 0;
uint32_t expectedSequence = 0;

// ------------------------- Sensor reading --------------------------
bool mandatoryPinsAreConfigured() {
  return TRIG_PIN_1 >= 0 && ECHO_PIN_1 >= 0 &&
         TRIG_PIN_2 >= 0 && ECHO_PIN_2 >= 0;
}

float readUltrasonicMetres(int triggerPin, int echoPin) {
  digitalWrite(triggerPin, LOW);
  delayMicroseconds(3);
  digitalWrite(triggerPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(triggerPin, LOW);

  const uint32_t durationUs = pulseIn(echoPin, HIGH, ECHO_TIMEOUT_US);
  if (durationUs == 0) {
    return NAN;
  }

  // Distance = round-trip time * speed of sound / 2.
  const float distanceM = durationUs * 0.000343f * 0.5f;
  if (distanceM < MIN_RANGE_M || distanceM > MAX_RANGE_M) {
    return NAN;
  }
  return distanceM;
}

void storeRange(uint8_t sensorIndex, float rawMetres, uint32_t now) {
  if (isnan(rawMetres)) {
    ranges[sensorIndex].valid = false;
    ranges[sensorIndex].updatedMs = now;
    return;
  }

  const float calibrated = rawMetres * SENSOR_SCALE[sensorIndex] +
                           SENSOR_OFFSET_M[sensorIndex];
  if (calibrated < MIN_RANGE_M || calibrated > MAX_RANGE_M) {
    ranges[sensorIndex].valid = false;
    ranges[sensorIndex].updatedMs = now;
    return;
  }

  // A light low-pass filter reduces cursor jitter without adding much lag.
  if (ranges[sensorIndex].valid) {
    ranges[sensorIndex].metres = 0.65f * calibrated +
                                 0.35f * ranges[sensorIndex].metres;
  } else {
    ranges[sensorIndex].metres = calibrated;
  }
  ranges[sensorIndex].valid = true;
  ranges[sensorIndex].updatedMs = now;
}

void measureLocalPair() {
  storeRange(2, readUltrasonicMetres(TRIG_PIN_1, ECHO_PIN_1), millis());
  delay(BETWEEN_PINGS_MS);
  storeRange(3, readUltrasonicMetres(TRIG_PIN_2, ECHO_PIN_2), millis());
}

// ------------------------- UDP scheduling --------------------------
void sendPoll(uint8_t nodeId) {
  PollPacket packet = {};
  packet.magic = PACKET_MAGIC;
  packet.version = PROTOCOL_VERSION;
  packet.type = PACKET_POLL;
  packet.nodeId = nodeId;
  packet.sequence = ++sequenceNumber;
  packet.crc = crc32(reinterpret_cast<const uint8_t *>(&packet),
                     offsetof(PollPacket, crc));

  expectedSequence = packet.sequence;
  udp.beginPacket(NODE_IPS[nodeId - 1], NODE_UDP_PORT);
  udp.write(reinterpret_cast<const uint8_t *>(&packet), sizeof(packet));
  udp.endPacket();
  replyDeadlineMs = millis() + NODE_REPLY_TIMEOUT_MS;
}

bool receiveRangePacket(uint8_t expectedNodeId) {
  const int packetSize = udp.parsePacket();
  if (packetSize <= 0) {
    return false;
  }

  RangePacket packet = {};
  if (packetSize != static_cast<int>(sizeof(packet))) {
    while (udp.available()) udp.read();
    return false;
  }

  const int bytesRead = udp.read(reinterpret_cast<uint8_t *>(&packet),
                                 sizeof(packet));
  if (bytesRead != static_cast<int>(sizeof(packet)) ||
      packet.magic != PACKET_MAGIC ||
      packet.version != PROTOCOL_VERSION ||
      packet.type != PACKET_RANGES ||
      packet.nodeId != expectedNodeId ||
      packet.sequence != expectedSequence ||
      !packetCrcIsValid(packet)) {
    return false;
  }

  const uint8_t baseIndex = (expectedNodeId == 1) ? 0 : 4;
  const uint32_t now = millis();
  for (uint8_t i = 0; i < 2; ++i) {
    const float value = (packet.validMask & (1U << i))
                          ? packet.distanceMm[i] / 1000.0f
                          : NAN;
    storeRange(baseIndex + i, value, now);
  }

  nodeOnline[expectedNodeId - 1] = true;
  nodeLastSeenMs[expectedNodeId - 1] = now;
  return true;
}

void markNodeTimedOut(uint8_t nodeId) {
  const uint8_t baseIndex = (nodeId == 1) ? 0 : 4;
  const uint32_t now = millis();
  nodeOnline[nodeId - 1] = false;
  ranges[baseIndex].valid = false;
  ranges[baseIndex].updatedMs = now;
  ranges[baseIndex + 1].valid = false;
  ranges[baseIndex + 1].updatedMs = now;
}

// ------------------------- Position solver -------------------------
float clampFloat(float value, float minimum, float maximum) {
  return fmaxf(minimum, fminf(maximum, value));
}

bool isFreshAndValid(uint8_t i, uint32_t now) {
  return ranges[i].valid && (now - ranges[i].updatedMs <= RANGE_STALE_MS);
}

void calculatePosition() {
  const uint32_t now = millis();
  uint8_t validCount = 0;
  float nearestRange = 1e9f;
  float initialX = position.valid ? position.x : PLAY_AREA_WIDTH_M * 0.5f;

  for (uint8_t i = 0; i < 6; ++i) {
    if (isFreshAndValid(i, now)) {
      ++validCount;
      if (ranges[i].metres < nearestRange) {
        nearestRange = ranges[i].metres;
        initialX = SENSOR_POSITIONS[i].x;
      }
    }
  }

  if (validCount < 3) {
    position.valid = false;
    position.sensorsUsed = validCount;
    return;
  }

  float x = position.valid ? position.x : initialX;
  float y = position.valid ? position.y :
            clampFloat(nearestRange, 0.10f, PLAY_AREA_DEPTH_M);

  // Iteratively reweighted Gauss-Newton multilateration. Huber weighting
  // limits the influence of an ultrasonic outlier or a background echo.
  for (uint8_t iteration = 0; iteration < 12; ++iteration) {
    float a00 = 0, a01 = 0, a11 = 0;
    float b0 = 0, b1 = 0;

    for (uint8_t i = 0; i < 6; ++i) {
      if (!isFreshAndValid(i, now)) continue;

      const float dx = x - SENSOR_POSITIONS[i].x;
      const float dy = y - SENSOR_POSITIONS[i].y;
      const float predicted = fmaxf(0.001f, sqrtf(dx * dx + dy * dy));
      const float residual = predicted - ranges[i].metres;
      const float absResidual = fabsf(residual);
      const float huberLimit = 0.20f;
      const float weight = absResidual <= huberLimit
                             ? 1.0f
                             : huberLimit / absResidual;
      const float jx = dx / predicted;
      const float jy = dy / predicted;

      a00 += weight * jx * jx;
      a01 += weight * jx * jy;
      a11 += weight * jy * jy;
      b0 += weight * jx * residual;
      b1 += weight * jy * residual;
    }

    const float determinant = a00 * a11 - a01 * a01;
    if (fabsf(determinant) < 1e-7f) {
      position.valid = false;
      position.sensorsUsed = validCount;
      return;
    }

    const float stepX = (a11 * b0 - a01 * b1) / determinant;
    const float stepY = (-a01 * b0 + a00 * b1) / determinant;
    x = clampFloat(x - stepX, 0.0f, PLAY_AREA_WIDTH_M);
    y = clampFloat(y - stepY, 0.0f, PLAY_AREA_DEPTH_M);

    if (stepX * stepX + stepY * stepY < 0.000001f) break;
  }

  float squaredError = 0;
  for (uint8_t i = 0; i < 6; ++i) {
    if (!isFreshAndValid(i, now)) continue;
    const float dx = x - SENSOR_POSITIONS[i].x;
    const float dy = y - SENSOR_POSITIONS[i].y;
    const float residual = sqrtf(dx * dx + dy * dy) - ranges[i].metres;
    squaredError += residual * residual;
  }

  const float rms = sqrtf(squaredError / validCount);
  // Reject a clearly inconsistent set instead of moving the cursor wildly.
  if (rms > 0.75f) {
    position.valid = false;
    position.rmsError = rms;
    position.sensorsUsed = validCount;
    return;
  }

  position.x = x;
  position.y = y;
  position.rmsError = rms;
  position.updatedMs = now;
  position.sensorsUsed = validCount;
  position.valid = true;
}

void updateWarning() {
  bool shouldWarn = position.valid && position.y <= WARNING_DISTANCE_M;

  // This extra conservative check still warns if positioning temporarily
  // fails but any sensor has a direct echo inside 50 cm.
  const uint32_t now = millis();
  for (uint8_t i = 0; i < 6; ++i) {
    if (isFreshAndValid(i, now) && ranges[i].metres <= WARNING_DISTANCE_M) {
      shouldWarn = true;
    }
  }

  warningActive = shouldWarn;
  if (BUZZER_PIN >= 0) digitalWrite(BUZZER_PIN, shouldWarn ? HIGH : LOW);
  if (WARNING_LED_PIN >= 0) digitalWrite(WARNING_LED_PIN, shouldWarn ? HIGH : LOW);
}

void printPositionCsv() {
  Serial.print("POS,");
  Serial.print(position.valid ? position.x : -1.0f, 3);
  Serial.print(',');
  Serial.print(position.valid ? position.y : -1.0f, 3);
  Serial.print(',');
  Serial.print(warningActive ? 1 : 0);
  Serial.print(',');
  Serial.print(position.rmsError, 3);
  Serial.print(',');
  Serial.println(position.sensorsUsed);
}

void finishMeasurementCycle() {
  calculatePosition();
  updateWarning();
  printPositionCsv();
  nextCycleMs = millis() + CYCLE_GAP_MS;
}

void runMeasurementStateMachine() {
  const uint32_t now = millis();
  switch (pollState) {
    case START_LOCAL:
      if (static_cast<int32_t>(now - nextCycleMs) < 0) return;
      measureLocalPair();
      sendPoll(1);
      pollState = WAIT_NODE_1;
      break;

    case WAIT_NODE_1:
      if (receiveRangePacket(1)) {
        sendPoll(2);
        pollState = WAIT_NODE_2;
      } else if (static_cast<int32_t>(now - replyDeadlineMs) >= 0) {
        markNodeTimedOut(1);
        sendPoll(2);
        pollState = WAIT_NODE_2;
      }
      break;

    case WAIT_NODE_2:
      if (receiveRangePacket(2)) {
        pollState = FINISH_CYCLE;
      } else if (static_cast<int32_t>(now - replyDeadlineMs) >= 0) {
        markNodeTimedOut(2);
        pollState = FINISH_CYCLE;
      }
      break;

    case FINISH_CYCLE:
      finishMeasurementCycle();
      pollState = START_LOCAL;
      break;
  }
}

// -------------------------- HTTP interface -------------------------
const char DASHBOARD_HTML[] PROGMEM = R"HTML(
<!doctype html><html><head><meta name="viewport" content="width=device-width">
<title>Whack-a-Mole Position</title><style>
body{font-family:system-ui;margin:2rem;background:#111;color:#eee}
.card{max-width:34rem;padding:1.5rem;border-radius:1rem;background:#222}
#warning{color:#ff5454;font-size:1.4rem;font-weight:bold}
code{color:#6ee7ff}table{border-collapse:collapse}td{padding:.25rem .8rem .25rem 0}
</style></head><body><div class="card"><h1>Player position</h1>
<p id="warning"></p><table><tr><td>Status</td><td id="status">Waiting...</td></tr>
<tr><td>X</td><td id="x">-</td></tr><tr><td>Y from screen</td><td id="y">-</td></tr>
<tr><td>Fit error</td><td id="error">-</td></tr><tr><td>Sensors used</td><td id="used">-</td></tr>
</table><p>Game endpoint: <code>/api/position</code></p></div><script>
const el=id=>document.getElementById(id);async function update(){try{
const r=await fetch('/api/position');const p=await r.json();
el('status').textContent=p.valid?'Tracking':'No valid position';
el('x').textContent=p.valid?p.x_m.toFixed(3)+' m':'-';
el('y').textContent=p.valid?p.y_m.toFixed(3)+' m':'-';
el('error').textContent=p.rms_error_m.toFixed(3)+' m';el('used').textContent=p.sensors_used;
el('warning').textContent=p.warning?'WARNING: player is too close to screen':'';
}catch(e){el('status').textContent='Disconnected'}}setInterval(update,100);update();</script></body></html>
)HTML";

String boolJson(bool value) {
  return value ? "true" : "false";
}

void handlePositionJson() {
  const uint32_t now = millis();
  String json;
  json.reserve(500);
  json += "{\"valid\":" + boolJson(position.valid);
  json += ",\"x_m\":" + String(position.valid ? position.x : -1.0f, 4);
  json += ",\"y_m\":" + String(position.valid ? position.y : -1.0f, 4);
  json += ",\"rms_error_m\":" + String(position.rmsError, 4);
  json += ",\"sensors_used\":" + String(position.sensorsUsed);
  json += ",\"warning\":" + boolJson(warningActive);
  json += ",\"position_age_ms\":" +
          String(position.valid ? now - position.updatedMs : 0);
  json += ",\"node_online\":[" + boolJson(nodeOnline[0]) + "," +
          boolJson(nodeOnline[1]) + "]";
  json += ",\"ranges_m\":[";
  for (uint8_t i = 0; i < 6; ++i) {
    if (i) json += ',';
    if (isFreshAndValid(i, now)) json += String(ranges[i].metres, 4);
    else json += "null";
  }
  json += "]}";

  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Cache-Control", "no-store");
  server.send(200, "application/json", json);
}

// ------------------------------ Setup ------------------------------
void setup() {
  Serial.begin(115200);
  delay(300);

  if (!mandatoryPinsAreConfigured()) {
    Serial.println("ERROR: Set all four ultrasonic GPIO constants at the top of the sketch.");
    while (true) delay(1000);
  }

  pinMode(TRIG_PIN_1, OUTPUT);
  pinMode(ECHO_PIN_1, INPUT);
  pinMode(TRIG_PIN_2, OUTPUT);
  pinMode(ECHO_PIN_2, INPUT);
  digitalWrite(TRIG_PIN_1, LOW);
  digitalWrite(TRIG_PIN_2, LOW);

  if (BUZZER_PIN >= 0) {
    pinMode(BUZZER_PIN, OUTPUT);
    digitalWrite(BUZZER_PIN, LOW);
  }
  if (WARNING_LED_PIN >= 0) {
    pinMode(WARNING_LED_PIN, OUTPUT);
    digitalWrite(WARNING_LED_PIN, LOW);
  }

  WiFi.mode(WIFI_AP);
  WiFi.softAPConfig(AP_IP, AP_GATEWAY, AP_SUBNET);
  if (!WiFi.softAP(AP_SSID, AP_PASSWORD)) {
    Serial.println("ERROR: Failed to start Wi-Fi access point.");
    while (true) delay(1000);
  }

  udp.begin(AP_UDP_PORT);
  server.on("/", HTTP_GET, []() { server.send_P(200, "text/html", DASHBOARD_HTML); });
  server.on("/api/position", HTTP_GET, handlePositionJson);
  server.onNotFound([]() { server.send(404, "text/plain", "Not found"); });
  server.begin();

  Serial.print("Access point ready. Connect to ");
  Serial.println(AP_SSID);
  Serial.print("Dashboard: http://");
  Serial.println(WiFi.softAPIP());
}

void loop() {
  server.handleClient();
  runMeasurementStateMachine();

  const uint32_t now = millis();
  for (uint8_t i = 0; i < 2; ++i) {
    if (nodeOnline[i] && now - nodeLastSeenMs[i] > RANGE_STALE_MS) {
      nodeOnline[i] = false;
    }
  }
  delay(1);
}
