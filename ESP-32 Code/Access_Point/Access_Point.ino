/*
  Centre ESP32: one ultrasonic sensor, two wireless sensor nodes.
  See ../CHECKLIST.md for geometry, upload steps and API details.
*/
#include <WiFi.h>
#include <WebServer.h>
#include <esp_now.h>
#include <esp_wifi.h>
#include <esp_system.h>
#include "Positioning.h"
#include "SensorMounting.h"
#include "RangeProtocol.h"
#include "Tracking.h"
#include "Dashboard.h"

// --------------------- EDIT YOUR SETUP HERE -------------------------
// Preserve the GPIOs already configured for the centre board.
constexpr int TFT_MOSI = 8;
constexpr int TFT_SCLK = 9;
constexpr int TFT_MISO = -1;
constexpr int TFT_CS = -1;
constexpr int TFT_DC = 14;
constexpr int TFT_RST = 21;
constexpr int TRIG_PIN = 10;
constexpr int ECHO_PIN = 3;
constexpr int BATTERY_PIN = 4;
constexpr int RGB_RED_PIN = 25;
constexpr int RGB_GREEN_PIN = 15;
constexpr int RGB_BLUE_PIN = 16;
constexpr bool RGB_ENABLED = false;
constexpr int BUTTON_PIN = 40;
constexpr int BUZZER_PIN = 18;       // Active buzzer; -1 disables output.
constexpr int WARNING_LED_PIN = 7; // -1 disables output.

constexpr float PLAY_AREA_WIDTH_M = 1.50f;
constexpr float PLAY_AREA_DEPTH_M = 1.40f;
// Measured room layout (sensors 30 cm apart, 68 cm high, side boxes angled in):
// sensor line tape 10 cm in front of the boxes, 10 cm hatched dead-zone strip,
// play area ends 1.5 m past the sensor line. Boxes sit at y = 0.30 m, so the
// dead zone ends at y = 0.50 m and play ends at y = 1.90 m.
constexpr float DEAD_ZONE_M = 0.50f; // Buzzer zone: within 20 cm of the boxes.
constexpr float SENSOR_GAP_LEFT_M = 0.30f;
constexpr float SENSOR_GAP_RIGHT_M = 0.30f;
constexpr float SENSOR_DISTANCE_FROM_SCREEN_M = 0.30f;
constexpr float AP_X_M = PLAY_AREA_WIDTH_M / 2;
// Order: Node 1, centre AP, Node 2. If gaps/screen distance are measured at the
// horn mouths, enter the actual axial recess of the fitted metal sensor faces.
// Leave zero when those measurements already refer to the metal sensor faces.
// The CAD reference planes are 70 mm apart; that is NOT a verified fitted recess.
constexpr float SENSOR_FACE_SETBACK_M[3] = {0.055f, 0.055f, 0.055f};
// Add measured mounting yaw to the nominal inward aim, positive towards +x.
constexpr float SENSOR_BEARING_TRIM_DEG[3] = {0.0f, 0.0f, 0.0f};
static_assert(SENSOR_FACE_SETBACK_M[0] >= 0 && SENSOR_FACE_SETBACK_M[1] >= 0 &&
  SENSOR_FACE_SETBACK_M[2] >= 0, "Sensor face setbacks must be non-negative.");
// Six hit zones inside the overlapping beams. x is from the left edge;
// y is from the screen. Change these independently of sensor spacing.
constexpr float GAME_AREA_X_MIN_M = AP_X_M - 0.30f;
constexpr float GAME_AREA_X_MAX_M = AP_X_M + 0.30f;
// Holes start 50 cm in front of the boxes: closer than that, the narrow beams
// cannot all see the player, so the front row would keep dropping out.
constexpr float GAME_AREA_START_Y_M = 0.80f;
constexpr float GAME_AREA_END_Y_M = DEAD_ZONE_M + PLAY_AREA_DEPTH_M;
// Aim both side sensors at this point. Physically rotate them to match.
constexpr float AIM_X_M = AP_X_M;
constexpr float AIM_Y_M = (GAME_AREA_START_Y_M + GAME_AREA_END_Y_M) / 2; // Middle of the holes.
// Estimated beam half-width, NOT an angle measured by the sensor or CAD flare.
// 25 deg keeps every hole inside at least two beams; a torso at close range
// echoes well off-axis. Lower it if far-off reflections are accepted.
constexpr float CONE_HALF_ANGLE_DEG = 25.0f;
constexpr float MIN_RANGE_M = 0.02f;
constexpr float MAX_RANGE_M = 4.50f; // Slant range, not playing-area depth.
// Large rooms: each sensor ignores echoes farther than the play area's farthest
// corner plus this margin (walls, passers-by, other people's reflections).
constexpr float RANGE_MARGIN_M = 0.20f;
// A sensor that misses one echo reuses its previous range for at most this long
// (about one frame). The solver's age and frame-span checks still apply.
constexpr uint32_t MISSED_ECHO_HOLD_MS = 200;
constexpr float SENSOR_SCALE[3] = {1, 1, 1};
constexpr float SENSOR_OFFSET_M[3] = {0, 0, 0};
constexpr float MAX_FIT_RMS_M = 0.10f;
constexpr float MAX_FIT_RESIDUAL_M = 0.18f;
constexpr float HUBER_LIMIT_M = 0.06f;
constexpr float ASSUMED_RANGE_NOISE_M = 0.025f;
constexpr float MAX_POSITION_UNCERTAINTY_M = 0.20f;
// All three agreeing ranges are preferred; any unique valid pair can track.
constexpr float PAIR_AGREEMENT_M = 0.10f;
constexpr float PAIR_PREVIOUS_RADIUS_M = 0.25f;
constexpr float RANGE_SPIKE_LIMIT_M = 0.16f;
constexpr float RANGE_CONFIRM_TOLERANCE_M = 0.10f;
constexpr float POSITION_JUMP_LIMIT_M = 0.14f;
constexpr float POSITION_CONFIRM_RADIUS_M = 0.08f;
constexpr uint8_t POSITION_MODE_WINDOW = 3; // Latest valid positions, from 1 to 9.
constexpr float POSITION_MODE_BIN_M = 0.05f; // 5 cm cells for mode voting.
constexpr uint32_t POSITION_MODE_HISTORY_MS = 500; // Expire older votes.
static_assert(POSITION_MODE_WINDOW >= 1 && POSITION_MODE_WINDOW <= wam::PositionMode::CAPACITY,
  "Position mode window must be between 1 and 9.");
static_assert(POSITION_MODE_BIN_M > 0, "Position mode cell size must be positive.");
constexpr uint32_t POSITION_HOLD_MS = 350; // Display only; held fixes cannot score.
constexpr uint32_t RANGE_STALE_MS = 500;
constexpr uint32_t MAX_FRAME_SPAN_MS = 300;
constexpr float HOLE_HYSTERESIS_M = 0.05f;
constexpr uint8_t STABLE_FRAMES = 2;
constexpr uint32_t HIT_COOLDOWN_MS = 250;
// Sensors fire one at a time; each gets a fixed slot measured from its trigger
// so the previous ping has died away before the next fires. One frame is three
// slots (150 ms, ~6.7 Hz). Raise SLOT_MS if ranges jump between sensors (cross-talk).
constexpr uint32_t SLOT_MS = 50;
constexpr uint32_t NODE_REPLY_TIMEOUT_MS = 40; // Node echo wait plus ESP-NOW delivery.
constexpr uint8_t NODE_MISSES_BEFORE_BROADCAST = 3;
static_assert(SLOT_MS * 1000 > wam::ECHO_TIMEOUT_US, "A slot must outlast the echo timeout.");
static_assert(NODE_REPLY_TIMEOUT_MS <= SLOT_MS, "Node replies must arrive within their slot.");

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
wam::Sensor limitToPlayArea(wam::Sensor s) {
  float farthest = 0;
  for (float x : {0.0f, PLAY_AREA_WIDTH_M})
    for (float y : {DEAD_ZONE_M, DEAD_ZONE_M + PLAY_AREA_DEPTH_M}) farthest = fmaxf(farthest, hypotf(x - s.x, y - s.y));
  s.maxRange = fminf(MAX_RANGE_M, farthest + RANGE_MARGIN_M);
  return s;
}
// Order throughout the API: Node 1 (player's left), AP (centre), Node 2.
const wam::Sensor SENSORS[3] = {
  limitToPlayArea(wam::sensorBehindReference(
    {AP_X_M - SENSOR_GAP_LEFT_M, SENSOR_DISTANCE_FROM_SCREEN_M,
     aimBearing(AP_X_M - SENSOR_GAP_LEFT_M) + SENSOR_BEARING_TRIM_DEG[0], CONE_HALF_ANGLE_DEG, MAX_RANGE_M},
    SENSOR_FACE_SETBACK_M[0])),
  limitToPlayArea(wam::sensorBehindReference(
    {AP_X_M, SENSOR_DISTANCE_FROM_SCREEN_M, SENSOR_BEARING_TRIM_DEG[1], CONE_HALF_ANGLE_DEG, MAX_RANGE_M},
    SENSOR_FACE_SETBACK_M[1])),
  limitToPlayArea(wam::sensorBehindReference(
    {AP_X_M + SENSOR_GAP_RIGHT_M, SENSOR_DISTANCE_FROM_SCREEN_M,
     aimBearing(AP_X_M + SENSOR_GAP_RIGHT_M) + SENSOR_BEARING_TRIM_DEG[2], CONE_HALF_ANGLE_DEG, MAX_RANGE_M},
    SENSOR_FACE_SETBACK_M[2]))
};

WebServer server(80);
struct RangeSample { float raw = NAN, metres = NAN; uint32_t time = 0; bool seen = false; };
RangeSample pending[3], ranges[3];
bool rangeHeld[3] = {};
uint32_t echoHistory[3] = {}; // One bit per frame, newest in bit 0.
uint32_t nodeTimeouts[2] = {};
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

enum Phase { LOCAL, QUIET, WAIT_RANGE };
Phase phase = LOCAL;
uint8_t activeNode = 0, nextNode = 1;
uint32_t sequence = 0, deadline = 0, slotStart = 0, framePeriodMs = 0;

// ESP-NOW replies arrive in the WiFi task; keep the latest per node and handle
// them in loop(). The arrival time lets a slow HTTP request not cause a false timeout.
struct NodeReply { wam::RangePacket packet; uint8_t mac[6]; uint32_t arrivedMs; bool waiting; };
portMUX_TYPE replyLock = portMUX_INITIALIZER_UNLOCKED;
NodeReply replies[2] = {};
const uint8_t BROADCAST_MAC[6] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};
uint8_t nodeMac[2][6] = {};
bool nodeMacKnown[2] = {};
uint8_t nodeMisses[2] = {};

bool rangeFresh(int i, uint32_t now) {
  return ranges[i].seen && isfinite(ranges[i].metres) && now - ranges[i].time <= RANGE_STALE_MS;
}
bool positionFresh(uint32_t now) {
  if (!position.valid || now - positionTime > RANGE_STALE_MS) return false;
  if (position.held) return now - positionTime <= POSITION_HOLD_MS;
  for (int i = 0; i < 3; ++i)
    if ((position.usedMask & (1u << i)) && !rangeFresh(i, now)) return false;
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
  pending[i].raw = isfinite(r) && r >= MIN_RANGE_M && r <= SENSORS[i].maxRange ? r : NAN;
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
  uint32_t ages[3];
  for (int i = 0; i < 3; ++i) {
    const bool echo = pending[i].seen && isfinite(pending[i].raw);
    echoHistory[i] = echoHistory[i] << 1 | echo;
    // Bridge one missed echo with the previous range; its original timestamp
    // keeps it subject to the age checks, so it cannot be reused twice.
    rangeHeld[i] = !echo && isfinite(ranges[i].metres) && now - ranges[i].time <= MISSED_ECHO_HOLD_MS;
    if (!rangeHeld[i]) {
      ranges[i] = pending[i];
      const float raw = ranges[i].seen && now - ranges[i].time <= RANGE_STALE_MS ? ranges[i].raw : NAN;
      ranges[i].metres = rangeGates[i].update(raw, now, RANGE_SPIKE_LIMIT_M,
        RANGE_CONFIRM_TOLERANCE_M, RANGE_STALE_MS);
    }
    ages[i] = now - ranges[i].time;
    input[i] = rangeFresh(i, now) ? ranges[i].metres : NAN;
  }
  const wam::Fix *previous = tracker.accepted.valid && now - tracker.acceptedMs <= POSITION_HOLD_MS
    ? &tracker.accepted : nullptr;
  rawPosition = wam::solveBestAvailable(SENSORS, input, PLAY_AREA, previous, MAX_FIT_RMS_M, MAX_FIT_RESIDUAL_M,
    HUBER_LIMIT_M, ASSUMED_RANGE_NOISE_M, MAX_POSITION_UNCERTAINTY_M, PAIR_AGREEMENT_M, PAIR_PREVIOUS_RADIUS_M,
    ages, MAX_FRAME_SPAN_MS);
  position = tracker.update(rawPosition, now, trackingOptions);
  framePeriodMs = frameId ? now - frameTime : 0;
  positionTime = tracker.acceptedMs; frameTime = now; ++frameId;
  updateWarning(now); updateGamePosition(now);
  Serial.printf("POS,%.3f,%.3f,%d,%.3f,%u,%s,%lu\n", position.valid ? position.x : -1,
    position.valid ? position.y : -1, warningActive, position.rms, position.count, position.reason,
    static_cast<unsigned long>(framePeriodMs));
}

#if ESP_IDF_VERSION_MAJOR >= 5
void onEspNowReceive(const esp_now_recv_info_t *info, const uint8_t *data, int len) {
  const uint8_t *mac = info->src_addr;
#else
void onEspNowReceive(const uint8_t *mac, const uint8_t *data, int len) {
#endif
  if (len != sizeof(wam::RangePacket)) return;
  const uint8_t nodeId = data[offsetof(wam::RangePacket, nodeId)];
  if (nodeId < 1 || nodeId > 2) return;
  NodeReply &r = replies[nodeId - 1];
  portENTER_CRITICAL(&replyLock);
  memcpy(&r.packet, data, sizeof(r.packet)); memcpy(r.mac, mac, 6);
  r.arrivedMs = millis(); r.waiting = true;
  portEXIT_CRITICAL(&replyLock);
}
void rememberNodeMac(uint8_t node, const uint8_t *mac) {
  if (nodeMacKnown[node] && memcmp(nodeMac[node], mac, 6) == 0) return;
  if (!esp_now_is_peer_exist(mac)) {
    esp_now_peer_info_t peer = {};
    memcpy(peer.peer_addr, mac, 6); peer.channel = 0; peer.ifidx = WIFI_IF_AP; peer.encrypt = false;
    if (esp_now_add_peer(&peer) != ESP_OK) return;
  }
  memcpy(nodeMac[node], mac, 6); nodeMacKnown[node] = true;
}
// Broadcast until a node has answered, then unicast (MAC-level ACK and retries).
void sendMeasure() {
  wam::ControlPacket p = {};
  p.magic = wam::PACKET_MAGIC; p.version = wam::PROTOCOL_VERSION; p.type = wam::MEASURE;
  p.nodeId = activeNode; p.session = bootId; p.sequence = sequence; p.crc = wam::packetCrc(p);
  const uint8_t node = activeNode - 1;
  esp_now_send(nodeMacKnown[node] ? nodeMac[node] : BROADCAST_MAC,
    reinterpret_cast<const uint8_t *>(&p), sizeof(p));
}
bool takeReply() {
  NodeReply r;
  portENTER_CRITICAL(&replyLock);
  r = replies[activeNode - 1]; replies[activeNode - 1].waiting = false;
  portEXIT_CRITICAL(&replyLock);
  const wam::RangePacket &p = r.packet;
  if (!r.waiting || wam::deadlineReached(r.arrivedMs, deadline + 1)) return false;
  if (p.magic != wam::PACKET_MAGIC || p.version != wam::PROTOCOL_VERSION || p.type != wam::RANGES ||
      p.nodeId != activeNode || p.session != bootId || p.sequence != sequence ||
      p.validMask > 1 || p.reserved != 0 || p.crc != wam::packetCrc(p)) return false;
  storePending(activeNode == 1 ? 0 : 2, p.validMask ? p.distanceMm / 1000.0f : NAN);
  rememberNodeMac(activeNode - 1, r.mac); nodeMisses[activeNode - 1] = 0;
  nodeOnline[activeNode - 1] = true; nodeLastSeen[activeNode - 1] = millis();
  return true;
}
void beginQuiet(uint8_t followingNode) {
  nextNode = followingNode; deadline = slotStart + SLOT_MS; phase = QUIET;
}
void runMeasurementStateMachine() {
  const uint32_t now = millis();
  switch (phase) {
    case LOCAL:
      slotStart = now; storePending(1, readUltrasonicMetres()); beginQuiet(1); break;
    case QUIET:
      if (!wam::deadlineReached(now, deadline)) break;
      if (nextNode == 0) { phase = LOCAL; break; }
      activeNode = nextNode; ++sequence; slotStart = now;
      portENTER_CRITICAL(&replyLock); replies[activeNode - 1].waiting = false; portEXIT_CRITICAL(&replyLock);
      sendMeasure(); deadline = slotStart + NODE_REPLY_TIMEOUT_MS; phase = WAIT_RANGE; break;
    case WAIT_RANGE:
      if (!takeReply()) {
        if (!wam::deadlineReached(now, deadline)) break;
        storePending(activeNode == 1 ? 0 : 2, NAN); nodeOnline[activeNode - 1] = false;
        ++nodeTimeouts[activeNode - 1];
        if (++nodeMisses[activeNode - 1] >= NODE_MISSES_BEFORE_BROADCAST) nodeMacKnown[activeNode - 1] = false;
      }
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
  s += ",\"sensors_used_mask\":" + String(valid ? position.usedMask : 0);
  s += ",\"available_mask\":" + String(rawPosition.availableMask);
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
    const bool used = fresh && positionFresh(now) && !position.held && (position.usedMask & (1u << i));
    const bool agrees = used && wam::inCone(position.x, position.y, SENSORS[i]) &&
      fabsf(wam::distance(position.x, position.y, SENSORS[i]) - ranges[i].metres) <= MAX_FIT_RESIDUAL_M;
    s += "{\"online\":" + jsonBool(online) + ",\"echo\":" + jsonBool(rawFresh && isfinite(ranges[i].raw));
    s += ",\"rejected\":" + jsonBool(rawFresh && rangeGates[i].rejected);
    s += ",\"used_for_position\":" + jsonBool(used);
    s += ",\"excluded_from_position\":" + jsonBool(fresh && rawPosition.valid && !(rawPosition.usedMask & (1u << i)));
    s += ",\"raw_m\":" + number(ranges[i].seen && now - ranges[i].time <= RANGE_STALE_MS ? ranges[i].raw : NAN);
    s += ",\"range_m\":" + number(fresh ? ranges[i].metres : NAN);
    s += ",\"age_ms\":" + (ranges[i].seen ? String(now - ranges[i].time) : String("null"));
    s += ",\"range_held\":" + jsonBool(rangeHeld[i]);
    const uint32_t frames = frameId < 32 ? frameId : 32;
    const uint32_t recent = frames == 32 ? echoHistory[i] : echoHistory[i] & ((1UL << frames) - 1);
    s += ",\"echo_rate\":" + number(frames ? __builtin_popcount(recent) / float(frames) : NAN, 2);
    s += ",\"player_in_cone\":" + jsonBool(agrees) + "}";
  }
  return s + "]";
}
void handlePositionJson() {
  const uint32_t now = millis();
  String s = positionJson(now); s.remove(s.length() - 1);
  s += ",\"protocol\":\"wam-position-v2\",\"boot_id\":" + String(bootId);
  s += ",\"frame_id\":" + String(frameId) + ",\"frame_period_ms\":" + String(framePeriodMs);
  // Health counters for long sessions: compare these early and after an hour.
  s += ",\"uptime_s\":" + String(now / 1000) + ",\"free_heap\":" + String(ESP.getFreeHeap());
  s += ",\"min_free_heap\":" + String(ESP.getMinFreeHeap()) + ",\"wifi_clients\":" + String(WiFi.softAPgetStationNum());
  s += ",\"node_timeouts\":[" + String(nodeTimeouts[0]) + "," + String(nodeTimeouts[1]) + "]";
  s += rangeFields(now) + "}";
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
    s += ",\"face_setback_m\":" + number(SENSOR_FACE_SETBACK_M[i]);
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
  trackingOptions.modeWindow = POSITION_MODE_WINDOW;
  trackingOptions.modeBinM = POSITION_MODE_BIN_M;
  trackingOptions.modeHistoryMs = POSITION_MODE_HISTORY_MS;
  trackingOptions.holdMs = POSITION_HOLD_MS;
  trackingOptions.resetMs = RANGE_STALE_MS;
  if (TRIG_PIN < 0 || ECHO_PIN < 0 || TRIG_PIN == ECHO_PIN ||
      (BUZZER_PIN >= 0 && (BUZZER_PIN == TRIG_PIN || BUZZER_PIN == ECHO_PIN)) ||
      (WARNING_LED_PIN >= 0 && (WARNING_LED_PIN == TRIG_PIN || WARNING_LED_PIN == ECHO_PIN || WARNING_LED_PIN == BUZZER_PIN))) {
    Serial.println("ERROR: configure distinct sensor and warning GPIOs."); while (true) delay(1000);
  }
  pinMode(TRIG_PIN, OUTPUT); digitalWrite(TRIG_PIN, LOW); pinMode(ECHO_PIN, INPUT);
  if (RGB_ENABLED) {
    pinMode(RGB_RED_PIN, OUTPUT);
    pinMode(RGB_GREEN_PIN, OUTPUT);
    pinMode(RGB_BLUE_PIN, OUTPUT);
  }
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  analogSetPinAttenuation(BATTERY_PIN, ADC_11db);
  if (BUZZER_PIN >= 0) { pinMode(BUZZER_PIN, OUTPUT); digitalWrite(BUZZER_PIN, LOW); }
  if (WARNING_LED_PIN >= 0) { pinMode(WARNING_LED_PIN, OUTPUT); digitalWrite(WARNING_LED_PIN, LOW); }
  bootId = esp_random(); if (bootId == 0) bootId = 1;

  tone(BUZZER_PIN, 10000,300);
  tone(BUZZER_PIN, 15000,300);

  WiFi.mode(WIFI_AP); WiFi.setSleep(false);
  esp_now_peer_info_t broadcast = {};
  memcpy(broadcast.peer_addr, BROADCAST_MAC, 6); broadcast.channel = 0; broadcast.ifidx = WIFI_IF_AP;
  if (!WiFi.softAPConfig(AP_IP, AP_IP, SUBNET) || !WiFi.softAP(AP_SSID, AP_PASSWORD, wam::ESPNOW_CHANNEL, 0, 8) ||
      esp_now_init() != ESP_OK || esp_now_register_recv_cb(onEspNowReceive) != ESP_OK ||
      esp_now_add_peer(&broadcast) != ESP_OK) {
    Serial.println("ERROR: failed to start AP/ESP-NOW."); while (true) delay(1000);
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
