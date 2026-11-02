/* One ultrasonic sensor on the player's LEFT node. Upload Node 2 to the right board. */
#include <WiFi.h>
#include <WiFiUdp.h>
#include <esp_now.h>
#include <esp_wifi.h>
#include <math.h>
#include "RangeProtocol.h"

// Set these to this board's actual wiring before uploading.
constexpr int TRIG_PIN = 10;
constexpr int ECHO_PIN = 3;
constexpr uint8_t NODE_ID = 1;
const char *AP_SSID = "Wacker5";
const char *AP_PASSWORD = "PasswordWacker123456!";
const IPAddress LOCAL_IP(192, 168, 4, 100 + NODE_ID);
const IPAddress AP_IP(192, 168, 4, 1), SUBNET(255, 255, 255, 0);
constexpr uint32_t RECONNECT_MS = 5000;
WiFiUDP udp;
wam::TriggerGate triggerGate;
wam::MeasureGate measureGate;
bool socketReady = false, attemptedConnection = false, hasFired = false;
uint32_t lastConnectAttempt = 0, lastFire = 0;

// The ESP-NOW callback runs in the WiFi task: copy the request, measure in loop().
portMUX_TYPE requestLock = portMUX_INITIALIZER_UNLOCKED;
wam::ControlPacket espNowRequest;
uint8_t espNowSender[6];
volatile bool espNowWaiting = false;

float readUltrasonicMetres() {
  digitalWrite(TRIG_PIN, LOW); delayMicroseconds(3);
  digitalWrite(TRIG_PIN, HIGH); delayMicroseconds(10); digitalWrite(TRIG_PIN, LOW);
  const uint32_t duration = pulseIn(ECHO_PIN, HIGH, wam::ECHO_TIMEOUT_US);
  const float metres = duration * 0.000343f * 0.5f;
  return duration && metres >= 0.02f && metres <= 4.50f ? metres : NAN;
}
void connectToAccessPoint() {
  if (WiFi.status() == WL_CONNECTED) {
    if (!socketReady) {
      socketReady = udp.begin(wam::NODE_UDP_PORT);
      if (socketReady) Serial.println("Node ready for AP measurement requests.");
    }
    return;
  }
  if (socketReady) { udp.stop(); socketReady = false; }
  triggerGate.armed = false;
  // Reconnection never blocks the main loop indefinitely. The fixed channel
  // keeps ESP-NOW reachable while (re)connecting.
  const uint32_t now = millis();
  if (!attemptedConnection || now - lastConnectAttempt >= RECONNECT_MS) {
    attemptedConnection = true; lastConnectAttempt = now;
    WiFi.disconnect(); WiFi.begin(AP_SSID, AP_PASSWORD, wam::ESPNOW_CHANNEL);
    Serial.println("Connecting to Wacker5...");
  }
}
bool readyToFire(uint32_t now) { return !hasFired || now - lastFire >= wam::QUIET_MS; }
wam::RangePacket measure(const wam::ControlPacket &request) {
  hasFired = true; lastFire = millis();
  const float range = readUltrasonicMetres();
  wam::RangePacket p = {};
  p.magic = wam::PACKET_MAGIC; p.version = wam::PROTOCOL_VERSION;
  p.type = wam::RANGES; p.nodeId = NODE_ID; p.session = request.session; p.sequence = request.sequence;
  if (isfinite(range)) { p.validMask = 1; p.distanceMm = static_cast<uint16_t>(lroundf(range * 1000)); }
  p.crc = wam::packetCrc(p);
  Serial.printf("RANGE,%lu,%.3f\n", static_cast<unsigned long>(p.sequence), range);
  return p;
}
bool validRequest(const wam::ControlPacket &p) {
  return p.magic == wam::PACKET_MAGIC && p.version == wam::PROTOCOL_VERSION &&
    p.nodeId == NODE_ID && p.reserved == 0 && p.crc == wam::packetCrc(p);
}

// ------------------------ UDP (calibration logger) -------------------
void sendReady(const wam::ControlPacket &poll) {
  wam::ControlPacket ready = poll; ready.type = wam::READY; ready.crc = wam::packetCrc(ready);
  udp.beginPacket(AP_IP, wam::AP_UDP_PORT);
  udp.write(reinterpret_cast<const uint8_t *>(&ready), sizeof(ready)); udp.endPacket();
}
void processPoll() {
  const int size = udp.parsePacket();
  if (size <= 0) return;
  if (size != sizeof(wam::ControlPacket) || udp.remoteIP() != AP_IP || udp.remotePort() != wam::AP_UDP_PORT) {
    while (udp.available()) udp.read(); return;
  }
  wam::ControlPacket p = {};
  const int n = udp.read(reinterpret_cast<uint8_t *>(&p), sizeof(p));
  if (n != sizeof(p) || !validRequest(p)) return;
  const uint32_t now = millis();
  if (p.type == wam::ARM) {
    if (triggerGate.arm(p.session, p.sequence, now)) sendReady(p);
  } else if (p.type == wam::FIRE && triggerGate.fire(p.session, p.sequence, now) && readyToFire(now)) {
    const wam::RangePacket reply = measure(p);
    udp.beginPacket(AP_IP, wam::AP_UDP_PORT);
    udp.write(reinterpret_cast<const uint8_t *>(&reply), sizeof(reply)); udp.endPacket();
  }
}

// ------------------------ ESP-NOW (game AP) --------------------------
#if ESP_IDF_VERSION_MAJOR >= 5
void onEspNowReceive(const esp_now_recv_info_t *info, const uint8_t *data, int len) {
  const uint8_t *mac = info->src_addr;
#else
void onEspNowReceive(const uint8_t *mac, const uint8_t *data, int len) {
#endif
  if (len != sizeof(wam::ControlPacket)) return;
  portENTER_CRITICAL(&requestLock);
  memcpy(&espNowRequest, data, sizeof(espNowRequest)); memcpy(espNowSender, mac, 6);
  espNowWaiting = true;
  portEXIT_CRITICAL(&requestLock);
}
void processEspNow() {
  if (!espNowWaiting) return;
  wam::ControlPacket p; uint8_t sender[6];
  portENTER_CRITICAL(&requestLock);
  p = espNowRequest; memcpy(sender, espNowSender, 6); espNowWaiting = false;
  portEXIT_CRITICAL(&requestLock);
  if (p.type != wam::MEASURE || !validRequest(p) || !readyToFire(millis()) ||
      !measureGate.accept(p.session, p.sequence)) return;
  const wam::RangePacket reply = measure(p);
  if (!esp_now_is_peer_exist(sender)) {
    esp_now_peer_info_t peer = {};
    memcpy(peer.peer_addr, sender, 6); peer.channel = 0; peer.ifidx = WIFI_IF_STA; peer.encrypt = false;
    esp_now_add_peer(&peer);
  }
  esp_now_send(sender, reinterpret_cast<const uint8_t *>(&reply), sizeof(reply));
}

void setup() {
  Serial.begin(115200); delay(300);
  if (TRIG_PIN < 0 || ECHO_PIN < 0 || TRIG_PIN == ECHO_PIN) {
    Serial.println("ERROR: Set distinct TRIG_PIN and ECHO_PIN at the top of this node sketch.");
    while (true) delay(1000);
  }
  pinMode(TRIG_PIN, OUTPUT); digitalWrite(TRIG_PIN, LOW); pinMode(ECHO_PIN, INPUT);
  WiFi.mode(WIFI_STA); WiFi.setSleep(false);
  esp_wifi_set_channel(wam::ESPNOW_CHANNEL, WIFI_SECOND_CHAN_NONE);
  if (!WiFi.config(LOCAL_IP, AP_IP, SUBNET)) {
    Serial.println("ERROR: static IP configuration failed."); while (true) delay(1000);
  }
  if (esp_now_init() != ESP_OK || esp_now_register_recv_cb(onEspNowReceive) != ESP_OK) {
    Serial.println("ERROR: ESP-NOW failed to start."); while (true) delay(1000);
  }
  Serial.printf("Node %u ESP-NOW ready, MAC %s\n", NODE_ID, WiFi.macAddress().c_str());
  connectToAccessPoint();
}
void loop() {
  processEspNow();
  connectToAccessPoint();
  if (socketReady) processPoll();
  delay(1);
}
