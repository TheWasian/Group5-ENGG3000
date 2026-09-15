/* One ultrasonic sensor on the player's LEFT node. Upload Node 2 to the right board. */
#include <WiFi.h>
#include <WiFiUdp.h>
#include <math.h>
#include "RangeProtocol.h"

// Set these to this board's actual wiring before uploading.
constexpr int TRIG_PIN = 26;
constexpr int ECHO_PIN = 27;
constexpr uint8_t NODE_ID = 1;
const char *AP_SSID = "Wacker5";
const char *AP_PASSWORD = "PasswordWacker123456!";
const IPAddress LOCAL_IP(192, 168, 4, 100 + NODE_ID);
const IPAddress AP_IP(192, 168, 4, 1), SUBNET(255, 255, 255, 0);
constexpr uint32_t RECONNECT_MS = 5000;
WiFiUDP udp;
wam::TriggerGate triggerGate;
bool socketReady = false, attemptedConnection = false, hasFired = false;
uint32_t lastConnectAttempt = 0, lastFire = 0;

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
  // Reconnection never blocks the main loop indefinitely.
  const uint32_t now = millis();
  if (!attemptedConnection || now - lastConnectAttempt >= RECONNECT_MS) {
    attemptedConnection = true; lastConnectAttempt = now;
    WiFi.disconnect(); WiFi.begin(AP_SSID, AP_PASSWORD);
    Serial.println("Connecting to Wacker5...");
  }
}
void sendReady(const wam::ControlPacket &poll) {
  wam::ControlPacket ready = poll; ready.type = wam::READY; ready.crc = wam::packetCrc(ready);
  udp.beginPacket(AP_IP, wam::AP_UDP_PORT);
  udp.write(reinterpret_cast<const uint8_t *>(&ready), sizeof(ready)); udp.endPacket();
}
void sendRanges(const wam::ControlPacket &poll) {
  hasFired = true; lastFire = millis();
  const float range = readUltrasonicMetres();
  wam::RangePacket p = {};
  p.magic = wam::PACKET_MAGIC; p.version = wam::PROTOCOL_VERSION;
  p.type = wam::RANGES; p.nodeId = NODE_ID; p.session = poll.session; p.sequence = poll.sequence;
  if (isfinite(range)) { p.validMask = 1; p.distanceMm = static_cast<uint16_t>(lroundf(range * 1000)); }
  p.crc = wam::packetCrc(p);
  udp.beginPacket(AP_IP, wam::AP_UDP_PORT);
  udp.write(reinterpret_cast<const uint8_t *>(&p), sizeof(p)); udp.endPacket();
  Serial.printf("RANGE,%lu,%.3f\n", static_cast<unsigned long>(p.sequence), range);
}
void processPoll() {
  const int size = udp.parsePacket();
  if (size <= 0) return;
  if (size != sizeof(wam::ControlPacket) || udp.remoteIP() != AP_IP || udp.remotePort() != wam::AP_UDP_PORT) {
    while (udp.available()) udp.read(); return;
  }
  wam::ControlPacket p = {};
  const int n = udp.read(reinterpret_cast<uint8_t *>(&p), sizeof(p));
  if (n != sizeof(p) || p.magic != wam::PACKET_MAGIC || p.version != wam::PROTOCOL_VERSION ||
      p.nodeId != NODE_ID || p.reserved != 0 || p.crc != wam::packetCrc(p)) return;
  const uint32_t now = millis();
  if (p.type == wam::ARM) {
    if (triggerGate.arm(p.session, p.sequence, now)) sendReady(p);
  } else if (p.type == wam::FIRE && triggerGate.fire(p.session, p.sequence, now)) {
    if (!hasFired || now - lastFire >= wam::QUIET_MS) sendRanges(p);
  }
}
void setup() {
  Serial.begin(115200); delay(300);
  if (TRIG_PIN < 0 || ECHO_PIN < 0 || TRIG_PIN == ECHO_PIN) {
    Serial.println("ERROR: Set distinct TRIG_PIN and ECHO_PIN at the top of this node sketch.");
    while (true) delay(1000);
  }
  pinMode(TRIG_PIN, OUTPUT); digitalWrite(TRIG_PIN, LOW); pinMode(ECHO_PIN, INPUT);
  WiFi.mode(WIFI_STA); WiFi.setSleep(false);
  if (!WiFi.config(LOCAL_IP, AP_IP, SUBNET)) {
    Serial.println("ERROR: static IP configuration failed."); while (true) delay(1000);
  }
  connectToAccessPoint();
}
void loop() {
  connectToAccessPoint();
  if (socketReady) processPoll();
  delay(1);
}
