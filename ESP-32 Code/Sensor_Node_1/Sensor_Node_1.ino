/*
  Whack-a-Mole ultrasonic sensor node 1.
  LEFT ESP32.
*/

#include <WiFi.h>
#include <WiFiUdp.h>
#include <math.h>
#include <stddef.h>

/* Replace with actual values later*/
constexpr int TRIG_PIN_1 = -1;
constexpr int ECHO_PIN_1 = -1;
constexpr int TRIG_PIN_2 = -1;
constexpr int ECHO_PIN_2 = -1;

constexpr uint8_t NODE_ID = 1;
const char *AP_SSID = "Wacker5";
const char *AP_PASSWORD = "PasswordWacker123456!";

const IPAddress LOCAL_IP(192, 168, 4, 101);
const IPAddress AP_IP(192, 168, 4, 1);
const IPAddress GATEWAY(192, 168, 4, 1);
const IPAddress SUBNET(255, 255, 255, 0);

constexpr uint16_t AP_UDP_PORT = 4210;
constexpr uint16_t NODE_UDP_PORT = 4211;
constexpr uint32_t PACKET_MAGIC = 0x57414D35UL;
constexpr uint8_t PROTOCOL_VERSION = 1;
constexpr uint8_t PACKET_POLL = 1;
constexpr uint8_t PACKET_RANGES = 2;
constexpr float MIN_RANGE_M = 0.02f;
constexpr float MAX_RANGE_M = 4.50f;
constexpr uint32_t ECHO_TIMEOUT_US = 27000;
constexpr uint32_t BETWEEN_PINGS_MS = 12;

WiFiUDP udp;

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

bool pinsAreConfigured() {
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
  if (durationUs == 0) return NAN;

  const float distanceM = durationUs * 0.000343f * 0.5f;
  return (distanceM >= MIN_RANGE_M && distanceM <= MAX_RANGE_M)
           ? distanceM
           : NAN;
}

void connectToAccessPoint() {
  if (WiFi.status() == WL_CONNECTED) return;

  WiFi.disconnect();
  WiFi.mode(WIFI_STA);
  WiFi.config(LOCAL_IP, GATEWAY, SUBNET);
  WiFi.begin(AP_SSID, AP_PASSWORD);
  Serial.print("Connecting to access point");
  while (WiFi.status() != WL_CONNECTED) {
    delay(250);
    Serial.print('.');
  }
  Serial.print(" connected as ");
  Serial.println(WiFi.localIP());
  udp.stop();
  udp.begin(NODE_UDP_PORT);
}

void sendRanges(uint32_t sequence) {
  const float measured[2] = {
    readUltrasonicMetres(TRIG_PIN_1, ECHO_PIN_1),
    NAN
  };
  delay(BETWEEN_PINGS_MS);
  const float second = readUltrasonicMetres(TRIG_PIN_2, ECHO_PIN_2);

  RangePacket response = {};
  response.magic = PACKET_MAGIC;
  response.version = PROTOCOL_VERSION;
  response.type = PACKET_RANGES;
  response.nodeId = NODE_ID;
  response.sequence = sequence;

  const float values[2] = {measured[0], second};
  for (uint8_t i = 0; i < 2; ++i) {
    if (!isnan(values[i])) {
      response.validMask |= (1U << i);
      response.distanceMm[i] = static_cast<uint16_t>(lroundf(values[i] * 1000.0f));
    }
  }

  response.crc = crc32(reinterpret_cast<const uint8_t *>(&response),
                       offsetof(RangePacket, crc));
  udp.beginPacket(AP_IP, AP_UDP_PORT);
  udp.write(reinterpret_cast<const uint8_t *>(&response), sizeof(response));
  udp.endPacket();
}

void processPoll() {
  const int packetSize = udp.parsePacket();
  if (packetSize <= 0) return;

  PollPacket poll = {};
  if (packetSize != static_cast<int>(sizeof(poll))) {
    while (udp.available()) udp.read();
    return;
  }

  const int bytesRead = udp.read(reinterpret_cast<uint8_t *>(&poll), sizeof(poll));
  const uint32_t expectedCrc = crc32(reinterpret_cast<const uint8_t *>(&poll),
                                     offsetof(PollPacket, crc));
  if (bytesRead == static_cast<int>(sizeof(poll)) &&
      poll.magic == PACKET_MAGIC && poll.version == PROTOCOL_VERSION &&
      poll.type == PACKET_POLL && poll.nodeId == NODE_ID &&
      poll.crc == expectedCrc) {
    sendRanges(poll.sequence);
  }
}

void setup() {
  Serial.begin(115200);
  delay(300);
  if (!pinsAreConfigured()) {
    Serial.println("ERROR: Set all four ultrasonic GPIO constants at the top of the sketch.");
    while (true) delay(1000);
  }

  pinMode(TRIG_PIN_1, OUTPUT);
  pinMode(ECHO_PIN_1, INPUT);
  pinMode(TRIG_PIN_2, OUTPUT);
  pinMode(ECHO_PIN_2, INPUT);
  digitalWrite(TRIG_PIN_1, LOW);
  digitalWrite(TRIG_PIN_2, LOW);
  connectToAccessPoint();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) connectToAccessPoint();
  processPoll();
  delay(1);
}
