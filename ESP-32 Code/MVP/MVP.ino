/*
  Whack-a-Mole MVP - two ultrasonic sensor lanes

  The browser connects to this ESP32 access point and polls /api/hits.
  Sensor 1 controls the left lane and sensor 2 controls the right lane.
  Within each lane, the measured distance selects the near, middle or far
  hole. A hit is emitted only after the new position is stable, so a player
  standing still cannot repeatedly score.
*/

#include <WiFi.h>
#include <WebServer.h>
#include <math.h>

// --------------------------- GPIO ----------------------------------
constexpr int TRIG_PINS[2] = {32, 25};
constexpr int ECHO_PINS[2] = {35, 33};

// --------------------------- Wi-Fi ---------------------------------
const char *AP_SSID = "Wacker5";
const char *AP_PASSWORD = "PasswordWacker123456!";

const IPAddress AP_IP(192, 168, 4, 1);
const IPAddress AP_GATEWAY(192, 168, 4, 1);
const IPAddress AP_SUBNET(255, 255, 255, 0);

WebServer server(80);

// ---------------------- Playing-area calibration -------------------
// The permitted two-metre play area is divided into three equal zones.
// Distances are measured outwards from each sensor.
constexpr float MIN_PLAYER_DISTANCE_CM = 2.0f;
constexpr float NEAR_MIDDLE_BOUNDARY_CM = 66.7f;
constexpr float MIDDLE_FAR_BOUNDARY_CM = 133.3f;
constexpr float MAX_PLAYER_DISTANCE_CM = 200.0f;

// Prevents boundary noise from rapidly swapping adjacent holes.
constexpr float ZONE_HYSTERESIS_CM = 7.0f;
constexpr uint8_t REQUIRED_STABLE_SAMPLES = 2;
constexpr uint8_t REQUIRED_ABSENT_SAMPLES = 3;
constexpr uint32_t HIT_COOLDOWN_MS = 250;

constexpr float MIN_SENSOR_RANGE_CM = 2.0f;
constexpr float MAX_SENSOR_RANGE_CM = 200.0f;
constexpr uint32_t ECHO_TIMEOUT_US = 12000;
constexpr uint32_t PING_INTERVAL_MS = 45;
constexpr uint8_t AVERAGE_SAMPLE_COUNT = 3;

// The existing UI is two columns by three rows. Each inner array lists
// near, middle and far for that sensor lane. Reverse an inner array if a
// physical sensor is mounted at the opposite end of its lane.
constexpr uint8_t HOLE_FOR_SENSOR_ZONE[2][3] = {
  {0, 2, 4},  // Sensor 1: left lane
  {1, 3, 5}   // Sensor 2: right lane
};

struct SensorState {
  float distanceCm;
  float distanceSamples[AVERAGE_SAMPLE_COUNT];
  float sampleTotal;
  uint8_t sampleCount;
  uint8_t nextSampleIndex;
  bool valid;
  int8_t stableZone;
  int8_t candidateZone;
  uint8_t candidateSamples;
  uint8_t absentSamples;
  uint32_t lastHitMs;
};

struct HitEvent {
  uint32_t id;
  uint32_t createdMs;
  uint8_t sensor;
  uint8_t zone;
  uint8_t hole;
  float distanceCm;
};

SensorState sensors[2] = {
  {NAN, {0, 0, 0}, 0.0f, 0, 0, false, -1, -1, 0, 0, 0},
  {NAN, {0, 0, 0}, 0.0f, 0, 0, false, -1, -1, 0, 0, 0}
};

HitEvent latestHit = {0, 0, 0, 0, 0, 0.0f};
uint8_t nextSensor = 0;
uint32_t nextPingMs = 0;

float readUltrasonicCentimetres(uint8_t sensorIndex) {
  const int triggerPin = TRIG_PINS[sensorIndex];
  const int echoPin = ECHO_PINS[sensorIndex];

  digitalWrite(triggerPin, LOW);
  delayMicroseconds(3);
  digitalWrite(triggerPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(triggerPin, LOW);

  const uint32_t durationUs = pulseIn(echoPin, HIGH, ECHO_TIMEOUT_US);
  if (durationUs == 0) return NAN;

  // Distance = round-trip time multiplied by the speed of sound, divided by 2.
  const float distanceCm = durationUs * 0.0343f * 0.5f;
  if (distanceCm < MIN_SENSOR_RANGE_CM || distanceCm > MAX_SENSOR_RANGE_CM) {
    return NAN;
  }
  return distanceCm;
}

void resetDistanceAverage(SensorState &sensor) {
  sensor.distanceCm = NAN;
  sensor.sampleTotal = 0.0f;
  sensor.sampleCount = 0;
  sensor.nextSampleIndex = 0;
}

void addDistanceSample(SensorState &sensor, float distanceCm) {
  if (sensor.sampleCount == AVERAGE_SAMPLE_COUNT) {
    sensor.sampleTotal -= sensor.distanceSamples[sensor.nextSampleIndex];
  } else {
    sensor.sampleCount++;
  }

  sensor.distanceSamples[sensor.nextSampleIndex] = distanceCm;
  sensor.sampleTotal += distanceCm;
  sensor.nextSampleIndex = (sensor.nextSampleIndex + 1) % AVERAGE_SAMPLE_COUNT;
  sensor.distanceCm = sensor.sampleTotal / sensor.sampleCount;
}

int8_t zoneForDistance(float distanceCm, int8_t currentZone) {
  if (isnan(distanceCm) || distanceCm < MIN_PLAYER_DISTANCE_CM ||
      distanceCm > MAX_PLAYER_DISTANCE_CM) {
    return -1;
  }

  // Keep the current zone until the player crosses beyond its hysteresis band.
  if (currentZone == 0 && distanceCm <= NEAR_MIDDLE_BOUNDARY_CM + ZONE_HYSTERESIS_CM) {
    return 0;
  }
  if (currentZone == 1) {
    if (distanceCm < NEAR_MIDDLE_BOUNDARY_CM - ZONE_HYSTERESIS_CM) return 0;
    if (distanceCm <= MIDDLE_FAR_BOUNDARY_CM + ZONE_HYSTERESIS_CM) return 1;
  }
  if (currentZone == 2 && distanceCm >= MIDDLE_FAR_BOUNDARY_CM - ZONE_HYSTERESIS_CM) {
    return 2;
  }

  if (distanceCm <= NEAR_MIDDLE_BOUNDARY_CM) return 0;
  if (distanceCm <= MIDDLE_FAR_BOUNDARY_CM) return 1;
  return 2;
}

void emitHit(uint8_t sensorIndex, uint8_t zone, float distanceCm, uint32_t now) {
  latestHit.id++;
  latestHit.createdMs = now;
  latestHit.sensor = sensorIndex;
  latestHit.zone = zone;
  latestHit.hole = HOLE_FOR_SENSOR_ZONE[sensorIndex][zone];
  latestHit.distanceCm = distanceCm;
  sensors[sensorIndex].lastHitMs = now;

  Serial.print("HIT,");
  Serial.print(latestHit.id);
  Serial.print(',');
  Serial.print(sensorIndex + 1);
  Serial.print(',');
  Serial.print(zone);
  Serial.print(',');
  Serial.print(latestHit.hole);
  Serial.print(',');
  Serial.println(distanceCm, 1);
}

void updateSensor(uint8_t sensorIndex, float rawDistanceCm) {
  SensorState &sensor = sensors[sensorIndex];
  const uint32_t now = millis();

  if (isnan(rawDistanceCm)) {
    sensor.valid = false;
    if (sensor.absentSamples < 255) sensor.absentSamples++;
  } else {
    // Use the average of the three latest readings instead of a raw echo.
    addDistanceSample(sensor, rawDistanceCm);
    sensor.valid = true;

    const int8_t measuredZone = zoneForDistance(sensor.distanceCm, sensor.stableZone);
    if (measuredZone < 0) {
      if (sensor.absentSamples < 255) sensor.absentSamples++;
    } else {
      sensor.absentSamples = 0;

      if (measuredZone != sensor.candidateZone) {
        sensor.candidateZone = measuredZone;
        sensor.candidateSamples = 1;
      } else if (sensor.candidateSamples < 255) {
        sensor.candidateSamples++;
      }

      if (sensor.candidateSamples >= REQUIRED_STABLE_SAMPLES &&
          measuredZone != sensor.stableZone &&
          now - sensor.lastHitMs >= HIT_COOLDOWN_MS) {
        sensor.stableZone = measuredZone;
        emitHit(sensorIndex, measuredZone, sensor.distanceCm, now);
      }
    }
  }

  if (sensor.absentSamples >= REQUIRED_ABSENT_SAMPLES) {
    // Re-arm this lane only after the player has genuinely left its range.
    sensor.stableZone = -1;
    sensor.candidateZone = -1;
    sensor.candidateSamples = 0;
    resetDistanceAverage(sensor);
  }
}

void runSensors() {
  const uint32_t now = millis();
  if (static_cast<int32_t>(now - nextPingMs) < 0) return;

  updateSensor(nextSensor, readUltrasonicCentimetres(nextSensor));
  nextSensor = (nextSensor + 1) % 2;
  nextPingMs = millis() + PING_INTERVAL_MS;
}

String boolJson(bool value) {
  return value ? "true" : "false";
}

void addCorsHeaders() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "Content-Type");
  server.sendHeader("Access-Control-Allow-Private-Network", "true");
  server.sendHeader("Cache-Control", "no-store");
}

void handleHitsJson() {
  const uint32_t now = millis();
  String json;
  json.reserve(480);
  json += "{\"event_id\":" + String(latestHit.id);
  json += ",\"event_age_ms\":" + String(latestHit.id ? now - latestHit.createdMs : 0);
  json += ",\"hole\":" + String(latestHit.id ? latestHit.hole : -1);
  json += ",\"sensor\":" + String(latestHit.id ? latestHit.sensor + 1 : 0);
  json += ",\"zone\":" + String(latestHit.id ? latestHit.zone : -1);
  json += ",\"distance_cm\":" + String(latestHit.id ? latestHit.distanceCm : -1.0f, 1);
  json += ",\"sensors\":[";

  for (uint8_t i = 0; i < 2; ++i) {
    if (i) json += ',';
    const int8_t zone = sensors[i].valid
                          ? zoneForDistance(sensors[i].distanceCm, sensors[i].stableZone)
                          : -1;
    json += "{\"valid\":" + boolJson(sensors[i].valid && zone >= 0);
    json += ",\"distance_cm\":";
    if (sensors[i].valid) json += String(sensors[i].distanceCm, 1);
    else json += "null";
    json += ",\"hole\":" + String(zone >= 0 ? HOLE_FOR_SENSOR_ZONE[i][zone] : -1);
    json += '}';
  }
  json += "]}";

  addCorsHeaders();
  server.send(200, "application/json", json);
}

void handleGameStart() {
  // A fresh game should accept the player's current position as a new step.
  for (uint8_t i = 0; i < 2; ++i) {
    sensors[i].stableZone = -1;
    sensors[i].candidateZone = -1;
    sensors[i].candidateSamples = 0;
    sensors[i].absentSamples = 0;
    sensors[i].lastHitMs = 0;
  }

  addCorsHeaders();
  server.send(204, "text/plain", "");
}

void handleOptions() {
  addCorsHeaders();
  server.send(204, "text/plain", "");
}

const char STATUS_PAGE[] PROGMEM = R"HTML(
<!doctype html><html><head><meta name="viewport" content="width=device-width">
<title>Whack-a-Mole sensors</title><style>
body{font-family:system-ui;margin:2rem;background:#17351f;color:#fff}
.card{max-width:34rem;padding:1.5rem;border-radius:1rem;background:#214b2c}
code{color:#ffe06a}
</style></head><body><div class="card"><h1>Whack-a-Mole MVP</h1>
<p>The two ultrasonic lanes are running.</p>
<p>Sensor data: <code>/api/hits</code></p>
<pre id="data">Waiting...</pre></div><script>
async function update(){try{const r=await fetch('/api/hits');
document.getElementById('data').textContent=JSON.stringify(await r.json(),null,2)
}catch(e){document.getElementById('data').textContent='Disconnected'}}
setInterval(update,200);update();</script></body></html>
)HTML";

void setup() {
  Serial.begin(115200);
  delay(300);

  for (uint8_t i = 0; i < 2; ++i) {
    pinMode(TRIG_PINS[i], OUTPUT);
    pinMode(ECHO_PINS[i], INPUT);
    digitalWrite(TRIG_PINS[i], LOW);
  }

  WiFi.mode(WIFI_AP);
  WiFi.softAPConfig(AP_IP, AP_GATEWAY, AP_SUBNET);
  if (!WiFi.softAP(AP_SSID, AP_PASSWORD)) {
    Serial.println("ERROR: Failed to start Wi-Fi access point.");
    while (true) delay(1000);
  }

  server.on("/", HTTP_GET, []() {
    server.send_P(200, "text/html", STATUS_PAGE);
  });
  server.on("/api/hits", HTTP_GET, handleHitsJson);
  server.on("/api/hits", HTTP_OPTIONS, handleOptions);
  server.on("/api/game/start", HTTP_POST, handleGameStart);
  server.on("/api/game/start", HTTP_OPTIONS, handleOptions);
  server.onNotFound([]() {
    addCorsHeaders();
    server.send(404, "text/plain", "Not found");
  });
  server.begin();

  Serial.print("Connect the game computer to Wi-Fi: ");
  Serial.println(AP_SSID);
  Serial.print("Sensor status: http://");
  Serial.println(WiFi.softAPIP());
}

void loop() {
  server.handleClient();
  runSensors();
  delay(1);
}
