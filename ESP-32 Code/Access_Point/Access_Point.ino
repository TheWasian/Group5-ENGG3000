/*
  Centre ESP32: one ultrasonic sensor, two wireless sensor nodes.
  See ../CHECKLIST.md for geometry, upload steps and API details.
*/
#include <WiFi.h>
#include <WiFiUdp.h>
#include <WebServer.h>
#include <esp_system.h>
#include "Positioning.h"
#include "RangeProtocol.h"
#include "Tracking.h"
#include "Dashboard.h"

// --------------------- EDIT YOUR SETUP HERE -------------------------
// Preserve the GPIOs already configured for the centre board.
constexpr int TRIG_PIN = 27;
constexpr int ECHO_PIN = 26;
constexpr int BUZZER_PIN = 4;       // Active buzzer; -1 disables output.
constexpr int WARNING_LED_PIN = 5; // -1 disables output.

constexpr float PLAY_AREA_WIDTH_M = 1.50f;
constexpr float PLAY_AREA_DEPTH_M = 1.40f;
constexpr float DEAD_ZONE_M = 0.60f; // y=0 is the screen; play ends at y=2 m.
constexpr float SENSOR_GAP_LEFT_M = 0.35f;
constexpr float SENSOR_GAP_RIGHT_M = 0.35f;
constexpr float SENSOR_DISTANCE_FROM_SCREEN_M = 0.30f;
constexpr float AP_X_M = PLAY_AREA_WIDTH_M / 2;
// Six hit zones inside the overlapping beams. x is from the left edge;
// y is from the screen. Change these independently of sensor spacing.
constexpr float GAME_AREA_X_MIN_M = AP_X_M - 0.30f;
constexpr float GAME_AREA_X_MAX_M = AP_X_M + 0.30f;
constexpr float GAME_AREA_START_Y_M = 1.00f;
constexpr float GAME_AREA_END_Y_M = DEAD_ZONE_M + PLAY_AREA_DEPTH_M;
// Aim both side sensors at this point. Physically rotate them to match.
constexpr float AIM_X_M = AP_X_M;
constexpr float AIM_Y_M = DEAD_ZONE_M + PLAY_AREA_DEPTH_M / 2;
// Estimated beam half-width, NOT an angle measured by the sensor.
constexpr float CONE_HALF_ANGLE_DEG = 15.0f;
constexpr float MIN_RANGE_M = 0.02f;
constexpr float MAX_RANGE_M = 4.50f; // Slant range, not playing-area depth.
constexpr float SENSOR_SCALE[3] = {1, 1, 1};
constexpr float SENSOR_OFFSET_M[3] = {0, 0, 0};
constexpr float MAX_FIT_RMS_M = 0.10f;
constexpr float MAX_FIT_RESIDUAL_M = 0.18f;
constexpr float HUBER_LIMIT_M = 0.06f;
constexpr float ASSUMED_RANGE_NOISE_M = 0.025f;
constexpr float MAX_POSITION_UNCERTAINTY_M = 0.20f;
constexpr float RANGE_SPIKE_LIMIT_M = 0.16f;
constexpr float RANGE_CONFIRM_TOLERANCE_M = 0.10f;
constexpr float POSITION_JUMP_LIMIT_M = 0.14f;
constexpr float POSITION_CONFIRM_RADIUS_M = 0.08f;
constexpr float POSITION_STATIONARY_TAU_S = 0.35f;
constexpr float POSITION_MOVING_TAU_S = 0.12f;
constexpr uint32_t POSITION_HOLD_MS = 350; // Display only; held fixes cannot score.
constexpr uint32_t RANGE_STALE_MS = 500;
constexpr uint32_t MAX_FRAME_SPAN_MS = 300;
constexpr float HOLE_HYSTERESIS_M = 0.05f;
constexpr uint8_t STABLE_FRAMES = 2;
constexpr uint32_t HIT_COOLDOWN_MS = 250;

const char *AP_SSID = "Wacker5";
const char *AP_PASSWORD = "PasswordWacker123456!";
const IPAddress AP_IP(192, 168, 4, 1), SUBNET(255, 255, 255, 0);
const IPAddress NODE_IPS[2] = {IPAddress(192, 168, 4, 101), IPAddress(192, 168, 4, 102)};
const wam::Area PLAY_AREA = {PLAY_AREA_WIDTH_M, DEAD_ZONE_M, PLAY_AREA_DEPTH_M};
const wam::Area GAME_AREA = {GAME_AREA_X_MAX_M - GAME_AREA_X_MIN_M,
  GAME_AREA_START_Y_M, GAME_AREA_END_Y_M - GAME_AREA_START_Y_M};
static_assert(GAME_AREA_X_MIN_M >= 0 && GAME_AREA_X_MAX_M <= PLAY_AREA_WIDTH_M &&
  GAME_AREA_X_MAX_M > GAME_AREA_X_MIN_M && GAME_AREA_START_Y_M >= DEAD_ZONE_M &&
  GAME_AREA_END_Y_M > GAME_AREA_START_Y_M && GAME_AREA_END_Y_M <= DEAD_ZONE_M + PLAY_AREA_DEPTH_M,
  "Game zones must fit inside the physical playing area.");
float aimBearing(float x) {
  return atan2f(AIM_X_M - x, AIM_Y_M - SENSOR_DISTANCE_FROM_SCREEN_M) * 180 / wam::PI_F;
}
// Order throughout the API: Node 1 (player's left), AP (centre), Node 2.
const wam::Sensor SENSORS[3] = {
  {AP_X_M - SENSOR_GAP_LEFT_M, SENSOR_DISTANCE_FROM_SCREEN_M,
   aimBearing(AP_X_M - SENSOR_GAP_LEFT_M), CONE_HALF_ANGLE_DEG, MAX_RANGE_M},
  {AP_X_M, SENSOR_DISTANCE_FROM_SCREEN_M, 0, CONE_HALF_ANGLE_DEG, MAX_RANGE_M},
  {AP_X_M + SENSOR_GAP_RIGHT_M, SENSOR_DISTANCE_FROM_SCREEN_M,
   aimBearing(AP_X_M + SENSOR_GAP_RIGHT_M), CONE_HALF_ANGLE_DEG, MAX_RANGE_M}
};

WiFiUDP udp;
WebServer server(80);
struct RangeSample { float raw = NAN, metres = NAN; uint32_t time = 0; bool seen = false; };
RangeSample pending[3], ranges[3];
wam::RangeGate rangeGates[3];
wam::PositionTracker tracker;
wam::TrackingOptions trackingOptions;
bool nodeOnline[2] = {};
uint32_t nodeLastSeen[2] = {};
wam::Fix position, rawPosition;
uint32_t positionTime = 0, frameTime = 0, frameId = 0, bootId = 0;
bool warningActive = false;
int8_t stableHole = -1, candidateHole = -1;
uint8_t candidateCount = 0;
struct HitEvent { uint32_t id = 0, time = 0; int8_t hole = -1; float y = 0; };
HitEvent hit;

enum Phase { LOCAL, QUIET, WAIT_READY, WAIT_RANGE };
Phase phase = LOCAL;
uint8_t activeNode = 0, nextNode = 1;
uint32_t sequence = 0, deadline = 0;

bool rangeFresh(int i, uint32_t now) {
  return ranges[i].seen && isfinite(ranges[i].metres) && now - ranges[i].time <= RANGE_STALE_MS;
}
bool positionFresh(uint32_t now) {
  if (!position.valid || now - positionTime > RANGE_STALE_MS) return false;
  if (position.held) return now - positionTime <= POSITION_HOLD_MS;
  for (int i = 0; i < 3; ++i)
    if (isfinite(ranges[i].metres) && !rangeFresh(i, now)) return false;
  return true;
}

float readUltrasonicMetres() {
  digitalWrite(TRIG_PIN, LOW); delayMicroseconds(3);
  digitalWrite(TRIG_PIN, HIGH); delayMicroseconds(10); digitalWrite(TRIG_PIN, LOW);
  const uint32_t duration = pulseIn(ECHO_PIN, HIGH, wam::ECHO_TIMEOUT_US);
  const float r = duration * 0.000343f * 0.5f;
  return duration && r >= MIN_RANGE_M && r <= MAX_RANGE_M ? r : NAN;
}
void storePending(int i, float raw) {
  float r = raw * SENSOR_SCALE[i] + SENSOR_OFFSET_M[i];
  pending[i].raw = isfinite(r) && r >= MIN_RANGE_M && r <= MAX_RANGE_M ? r : NAN;
  pending[i].time = millis(); pending[i].seen = true;
}
int8_t holeForPosition(float x, float y, int8_t current) {
  return wam::holeForPosition(x - GAME_AREA_X_MIN_M, y, current, GAME_AREA, HOLE_HYSTERESIS_M);
}
bool inGameArea(float x, float y) {
  return wam::inPlayArea(x - GAME_AREA_X_MIN_M, y, GAME_AREA);
}
void updateGamePosition(uint32_t now) {
  if (positionFresh(now) && position.held && !warningActive) {
    candidateHole = -1; candidateCount = 0; return;
  }
  int8_t measured = positionFresh(now) && !warningActive
    && rawPosition.valid && inGameArea(rawPosition.x, rawPosition.y)
    ? holeForPosition(position.x, position.y, stableHole) : -1;
  // Smoothing must not keep scoring a previous hole after the current
  // measurement has already crossed into another one.
  if (measured >= 0 && holeForPosition(rawPosition.x, rawPosition.y, stableHole) != measured) measured = -1;
  if (measured < 0) {
    stableHole = candidateHole = -1; candidateCount = 0; return;
  }
  if (candidateHole != measured) { candidateHole = measured; candidateCount = 1; }
  else if (candidateCount < 255) ++candidateCount;
  // Hide the old cell while moving to a different cell; never score it using
  // a newly acquired coordinate from the other side of the board.
  if (stableHole != measured) stableHole = -1;
  if (candidateCount >= STABLE_FRAMES && stableHole != measured &&
      (hit.id == 0 || now - hit.time >= HIT_COOLDOWN_MS)) {
    stableHole = measured;
    ++hit.id; hit.time = now; hit.hole = measured; hit.y = position.y;
  }
}
void updateWarning(uint32_t now) {
  bool warn = (positionFresh(now) && position.y <= DEAD_ZONE_M) ||
    (rawPosition.valid && now - frameTime <= RANGE_STALE_MS && rawPosition.y <= DEAD_ZONE_M);
  // Only declare a direct-range warning when even the farthest possible y
  // of this echo lies inside the dead zone. Use raw data to avoid filter lag.
  for (int i = 0; i < 3; ++i) {
    if (ranges[i].seen && isfinite(ranges[i].raw) && now - ranges[i].time <= RANGE_STALE_MS &&
        SENSORS[i].y + ranges[i].raw <= DEAD_ZONE_M) warn = true;
  }
  warningActive = warn;
  if (BUZZER_PIN >= 0) digitalWrite(BUZZER_PIN, warn ? HIGH : LOW);
  if (WARNING_LED_PIN >= 0) digitalWrite(WARNING_LED_PIN, warn ? HIGH : LOW);
}
void finishFrame() {
  const uint32_t now = millis();
  float input[3];
  uint32_t minAge = UINT32_MAX, maxAge = 0;
  bool rejected = false;
  for (int i = 0; i < 3; ++i) {
    ranges[i] = pending[i];
    const float raw = ranges[i].seen && now - ranges[i].time <= RANGE_STALE_MS ? ranges[i].raw : NAN;
    ranges[i].metres = rangeGates[i].update(raw, now, RANGE_SPIKE_LIMIT_M,
      RANGE_CONFIRM_TOLERANCE_M, RANGE_STALE_MS);
    rejected |= rangeGates[i].rejected;
    if (isfinite(ranges[i].metres)) {
      const uint32_t age = now - ranges[i].time;
      if (age < minAge) minAge = age;
      if (age > maxAge) maxAge = age;
    }
    input[i] = rangeFresh(i, now) ? ranges[i].metres : NAN;
  }
  rawPosition = wam::solve(SENSORS, input, PLAY_AREA, MAX_FIT_RMS_M, MAX_FIT_RESIDUAL_M,
    HUBER_LIMIT_M, ASSUMED_RANGE_NOISE_M, MAX_POSITION_UNCERTAINTY_M);
  // A rejected third reading is not permission to trust the remaining pair.
  if (rejected) { rawPosition.valid = false; rawPosition.reason = "range_spike"; }
  if (rawPosition.count >= 2 && maxAge - minAge > MAX_FRAME_SPAN_MS) {
    rawPosition.valid = false; rawPosition.reason = "frame_too_slow";
  }
  position = tracker.update(rawPosition, now, trackingOptions);
  positionTime = tracker.acceptedMs; frameTime = now; ++frameId;
  updateWarning(now); updateGamePosition(now);
  Serial.printf("POS,%.3f,%.3f,%d,%.3f,%u,%s\n", position.valid ? position.x : -1,
    position.valid ? position.y : -1, warningActive, position.rms, position.count, position.reason);
}

void sendControl(uint8_t type) {
  wam::ControlPacket p = {};
  p.magic = wam::PACKET_MAGIC; p.version = wam::PROTOCOL_VERSION; p.type = type;
  p.nodeId = activeNode; p.session = bootId; p.sequence = sequence; p.crc = wam::packetCrc(p);
  udp.beginPacket(NODE_IPS[activeNode - 1], wam::NODE_UDP_PORT);
  udp.write(reinterpret_cast<const uint8_t *>(&p), sizeof(p)); udp.endPacket();
}
void beginQuiet(uint8_t followingNode) {
  nextNode = followingNode; deadline = millis() + wam::QUIET_MS; phase = QUIET;
}
bool receiveReply() {
  const int size = udp.parsePacket();
  if (size <= 0) return false;
  const bool sourceOK = udp.remoteIP() == NODE_IPS[activeNode - 1] && udp.remotePort() == wam::NODE_UDP_PORT;
  if (phase == WAIT_READY && size == sizeof(wam::ControlPacket) && sourceOK) {
    wam::ControlPacket p = {};
    const int n = udp.read(reinterpret_cast<uint8_t *>(&p), sizeof(p));
    if (n == sizeof(p) && p.magic == wam::PACKET_MAGIC && p.version == wam::PROTOCOL_VERSION &&
        p.type == wam::READY && p.nodeId == activeNode && p.session == bootId &&
        p.sequence == sequence && p.reserved == 0 && p.crc == wam::packetCrc(p)) {
      sendControl(wam::FIRE); deadline = millis() + wam::REPLY_TIMEOUT_MS; phase = WAIT_RANGE;
    }
  } else if (phase == WAIT_RANGE && size == sizeof(wam::RangePacket) && sourceOK) {
    wam::RangePacket p = {};
    const int n = udp.read(reinterpret_cast<uint8_t *>(&p), sizeof(p));
    if (n == sizeof(p) && p.magic == wam::PACKET_MAGIC && p.version == wam::PROTOCOL_VERSION &&
        p.type == wam::RANGES && p.nodeId == activeNode && p.session == bootId &&
        p.sequence == sequence && p.validMask <= 1 && p.reserved == 0 && p.crc == wam::packetCrc(p)) {
      storePending(activeNode == 1 ? 0 : 2, p.validMask ? p.distanceMm / 1000.0f : NAN);
      nodeOnline[activeNode - 1] = true; nodeLastSeen[activeNode - 1] = millis();
      return true;
    }
  } else { while (udp.available()) udp.read(); }
  return false;
}
void runMeasurementStateMachine() {
  const uint32_t now = millis();
  switch (phase) {
    case LOCAL:
      storePending(1, readUltrasonicMetres()); beginQuiet(1); break;
    case QUIET:
      if (!wam::deadlineReached(now, deadline)) break;
      if (nextNode == 0) { phase = LOCAL; break; }
      activeNode = nextNode; ++sequence; sendControl(wam::ARM);
      deadline = millis() + wam::REPLY_TIMEOUT_MS; phase = WAIT_READY; break;
    case WAIT_READY:
    case WAIT_RANGE:
      // Check timeout before consuming buffered replies; late packets cannot
      // extend a slot or introduce old ranges into a completed frame.
      if (wam::deadlineReached(now, deadline)) {
        storePending(activeNode == 1 ? 0 : 2, NAN); nodeOnline[activeNode - 1] = false;
      } else if (!receiveReply()) break;
      if (activeNode == 2) finishFrame();
      beginQuiet(activeNode == 1 ? 2 : 0); break;
  }
}

// ------------------------ HTTP API ---------------------------------
String jsonBool(bool value) { return value ? "true" : "false"; }
String number(float value, int decimals = 4) { return isfinite(value) ? String(value, decimals) : "null"; }
void addCorsHeaders() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "Content-Type");
  server.sendHeader("Access-Control-Allow-Private-Network", "true");
  server.sendHeader("Cache-Control", "no-store");
}
String positionJson(uint32_t now) {
  const bool valid = positionFresh(now);
  String s = "{\"valid\":" + jsonBool(valid);
  s += ",\"x_m\":" + number(valid ? position.x : NAN);
  s += ",\"y_m\":" + number(valid ? position.y : NAN);
  s += ",\"held\":" + jsonBool(valid && position.held);
  s += ",\"raw_x_m\":" + number(rawPosition.valid && now - frameTime <= RANGE_STALE_MS ? rawPosition.x : NAN);
  s += ",\"raw_y_m\":" + number(rawPosition.valid && now - frameTime <= RANGE_STALE_MS ? rawPosition.y : NAN);
  s += ",\"uncertainty_m\":" + number(position.uncertainty);
  s += ",\"rms_error_m\":" + number(position.rms);
  s += ",\"sensors_used\":" + String(position.count);
  s += ",\"reason\":\"" + String(position.valid && !valid ? "stale" : position.reason) + "\"";
  s += ",\"in_play_area\":" + jsonBool(valid && wam::inPlayArea(position.x, position.y, PLAY_AREA));
  s += ",\"in_game_area\":" + jsonBool(valid && inGameArea(position.x, position.y));
  s += ",\"warning\":" + jsonBool(warningActive);
  s += ",\"age_ms\":" + String(now - positionTime) + "}";
  return s;
}
String rangeFields(uint32_t now) {
  String s = ",\"node_online\":[" + jsonBool(nodeOnline[0]) + "," + jsonBool(nodeOnline[1]) + "]";
  s += ",\"ranges_m\":[";
  for (int i = 0; i < 3; ++i) { if (i) s += ','; s += number(rangeFresh(i, now) ? ranges[i].metres : NAN); }
  s += "],\"sensor_status\":[";
  for (int i = 0; i < 3; ++i) {
    if (i) s += ',';
    const bool online = i == 1 || nodeOnline[i == 0 ? 0 : 1];
    const bool fresh = rangeFresh(i, now);
    const bool rawFresh = ranges[i].seen && now - ranges[i].time <= RANGE_STALE_MS;
    const bool agrees = fresh && positionFresh(now) && !position.held && wam::inCone(position.x, position.y, SENSORS[i]) &&
      fabsf(wam::distance(position.x, position.y, SENSORS[i]) - ranges[i].metres) <= MAX_FIT_RESIDUAL_M;
    s += "{\"online\":" + jsonBool(online) + ",\"echo\":" + jsonBool(rawFresh && isfinite(ranges[i].raw));
    s += ",\"rejected\":" + jsonBool(rawFresh && rangeGates[i].rejected);
    s += ",\"raw_m\":" + number(ranges[i].seen && now - ranges[i].time <= RANGE_STALE_MS ? ranges[i].raw : NAN);
    s += ",\"range_m\":" + number(fresh ? ranges[i].metres : NAN);
    s += ",\"age_ms\":" + (ranges[i].seen ? String(now - ranges[i].time) : String("null"));
    s += ",\"player_in_cone\":" + jsonBool(agrees) + "}";
  }
  return s + "]";
}
void handlePositionJson() {
  const uint32_t now = millis();
  String s = positionJson(now); s.remove(s.length() - 1);
  s += ",\"protocol\":\"wam-position-v2\",\"boot_id\":" + String(bootId);
  s += ",\"frame_id\":" + String(frameId) + rangeFields(now) + "}";
  addCorsHeaders(); server.send(200, "application/json", s);
}
String gameAreaJson() {
  String s = "{\"x_min_m\":" + number(GAME_AREA_X_MIN_M) + ",\"x_max_m\":" + number(GAME_AREA_X_MAX_M);
  s += ",\"start_y_m\":" + number(GAME_AREA_START_Y_M) + ",\"end_y_m\":" + number(GAME_AREA_END_Y_M);
  return s + "}";
}
void handleHitsJson() {
  const uint32_t now = millis();
  const bool current = positionFresh(now) && !warningActive && stableHole >= 0 &&
    inGameArea(position.x, position.y);
  String s; s.reserve(2000);
  s = "{\"protocol\":\"wam-hits-v1\",\"source\":\"access_point\",\"api_version\":2";
  s += ",\"boot_id\":" + String(bootId) + ",\"frame_id\":" + String(frameId);
  s += ",\"event_id\":" + String(hit.id) + ",\"event_age_ms\":" + String(hit.id ? now - hit.time : 0);
  s += ",\"hole\":" + String(hit.hole) + ",\"sensor\":" + String(hit.hole >= 0 ? hit.hole % 2 + 1 : 0);
  s += ",\"zone\":" + String(hit.hole >= 0 ? hit.hole / 2 : -1);
  s += ",\"distance_cm\":" + number(hit.id ? hit.y * 100 : NAN, 1);
  s += ",\"current_hole\":" + String(current ? stableHole : -1);
  s += ",\"position\":" + positionJson(now);
  s += ",\"game_area\":" + gameAreaJson();
  // Legacy MVP lane fields remain for older clients; these are game columns,
  // NOT the three physical ultrasonic sensors (see sensor_status instead).
  s += ",\"sensors\":[";
  for (int col = 0; col < 2; ++col) {
    if (col) s += ',';
    bool lane = current && !position.held && stableHole % 2 == col;
    s += "{\"valid\":" + jsonBool(lane) + ",\"hole\":" + String(lane ? stableHole : -1);
    s += ",\"distance_cm\":" + number(lane ? position.y * 100 : NAN, 1) + "}";
  }
  s += "]" + rangeFields(now) + "}";
  addCorsHeaders(); server.send(200, "application/json", s);
}
void handleConfigJson() {
  String s = "{\"width_m\":" + number(PLAY_AREA_WIDTH_M) + ",\"depth_m\":" + number(PLAY_AREA_DEPTH_M);
  s += ",\"play_start_y_m\":" + number(DEAD_ZONE_M) + ",\"stale_ms\":" + String(RANGE_STALE_MS);
  s += ",\"game_area\":" + gameAreaJson();
  s += ",\"sensors\":[";
  const char *names[3] = {"Node 1", "Access Point", "Node 2"};
  for (int i = 0; i < 3; ++i) {
    if (i) s += ',';
    s += "{\"name\":\"" + String(names[i]) + "\",\"x_m\":" + number(SENSORS[i].x);
    s += ",\"y_m\":" + number(SENSORS[i].y) + ",\"bearing_deg\":" + number(SENSORS[i].bearingDeg);
    s += ",\"half_angle_deg\":" + number(SENSORS[i].halfAngleDeg) + ",\"max_range_m\":" + number(SENSORS[i].maxRange) + "}";
  }
  addCorsHeaders(); server.send(200, "application/json", s + "]}");
}
void resetGameTracking() {
  stableHole = candidateHole = -1; candidateCount = 0;
  hit.hole = -1; // invalidate the previous event without rewinding its ID.
  addCorsHeaders(); server.send(204, "text/plain", "");
}
void handleOptions() { addCorsHeaders(); server.send(204, "text/plain", ""); }
void setup() {
  Serial.begin(115200); delay(300);
  trackingOptions.jumpLimit = POSITION_JUMP_LIMIT_M;
  trackingOptions.confirmationRadius = POSITION_CONFIRM_RADIUS_M;
  trackingOptions.stationaryTau = POSITION_STATIONARY_TAU_S;
  trackingOptions.movingTau = POSITION_MOVING_TAU_S;
  trackingOptions.holdMs = POSITION_HOLD_MS;
  trackingOptions.resetMs = RANGE_STALE_MS;
  if (TRIG_PIN < 0 || ECHO_PIN < 0 || TRIG_PIN == ECHO_PIN ||
      (BUZZER_PIN >= 0 && (BUZZER_PIN == TRIG_PIN || BUZZER_PIN == ECHO_PIN)) ||
      (WARNING_LED_PIN >= 0 && (WARNING_LED_PIN == TRIG_PIN || WARNING_LED_PIN == ECHO_PIN || WARNING_LED_PIN == BUZZER_PIN))) {
    Serial.println("ERROR: configure distinct sensor and warning GPIOs."); while (true) delay(1000);
  }
  pinMode(TRIG_PIN, OUTPUT); digitalWrite(TRIG_PIN, LOW); pinMode(ECHO_PIN, INPUT);
  if (BUZZER_PIN >= 0) { pinMode(BUZZER_PIN, OUTPUT); digitalWrite(BUZZER_PIN, LOW); }
  if (WARNING_LED_PIN >= 0) { pinMode(WARNING_LED_PIN, OUTPUT); digitalWrite(WARNING_LED_PIN, LOW); }
  bootId = esp_random(); if (bootId == 0) bootId = 1;
  WiFi.mode(WIFI_AP);
  if (!WiFi.softAPConfig(AP_IP, AP_IP, SUBNET) || !WiFi.softAP(AP_SSID, AP_PASSWORD) || !udp.begin(wam::AP_UDP_PORT)) {
    Serial.println("ERROR: failed to start AP/UDP."); while (true) delay(1000);
  }
  server.on("/", HTTP_GET, [](){ server.send_P(200, "text/html", DASHBOARD_HTML); });
  server.on("/cones", HTTP_GET, [](){ server.send_P(200, "text/html", DASHBOARD_HTML); });
  server.on("/api/position", HTTP_GET, handlePositionJson);
  server.on("/api/hits", HTTP_GET, handleHitsJson);
  server.on("/api/config", HTTP_GET, handleConfigJson);
  server.on("/api/game/start", HTTP_POST, resetGameTracking);
  for (const char *path : {"/api/position", "/api/hits", "/api/config", "/api/game/start"}) server.on(path, HTTP_OPTIONS, handleOptions);
  server.onNotFound([](){ addCorsHeaders(); server.send(404, "text/plain", "Not found"); });
  server.begin(); Serial.println("Ready: connect to Wacker5, open http://192.168.4.1/");
}
void loop() {
  runMeasurementStateMachine();
  const uint32_t now = millis();
  for (int i = 0; i < 2; ++i) if (nodeOnline[i] && now - nodeLastSeen[i] > RANGE_STALE_MS) nodeOnline[i] = false;
  updateWarning(now);
  server.handleClient(); delay(1);
}
