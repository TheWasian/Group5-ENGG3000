#include <Arduino.h>

constexpr uint8_t TRIG_PIN = 5;
constexpr uint8_t ECHO_PIN = 18;
constexpr unsigned long ECHO_TIMEOUT_US = 30000;

float readDistanceCm();

void setup() {
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  digitalWrite(TRIG_PIN, LOW);

  Serial.begin(115200);
  delay(500);
  Serial.println("Ultrasonic sensor ready");
}

void loop() {
  const float distanceCm = readDistanceCm();

  if (distanceCm < 0.0f) {
    Serial.println("Distance: out of range");
  } else {
    Serial.print("Distance: ");
    Serial.print(distanceCm, 1);
    Serial.println(" cm");
  }

  delay(500);
}

float readDistanceCm() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  const unsigned long duration = pulseIn(ECHO_PIN, HIGH, ECHO_TIMEOUT_US);
  if (duration == 0) {
    return -1.0f;
  }

  return duration * 0.0343f / 2.0f;
}