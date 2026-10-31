#include "SensorProcessing.h"
#include "config.h"

uint32_t duration_us;
float distance_cm;

void initialiseSensor() {
  pinMode(TRIG_PIN, OUTPUT);
  digitalWrite(TRIG_PIN, LOW);
  // configure the echo pin to input mode
  pinMode(ECHO_PIN, INPUT);
}

void updateSensorData() {
  // generate 10-microsecond pulse to TRIG pin
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  // measure duration of pulse from ECHO pin
  duration_us = pulseIn(ECHO_PIN, HIGH, PULSEIN_TIMEOUT);

  // calculate the distance
  distance_cm = SOUND_CONST_CM * duration_us;
}

uint32_t readSensorRaw() {
  updateSensorData();
  return duration_us;
}

float readSensorCM() {
  updateSensorData();
  return distance_cm;
}

float convertToCM(uint32_t duration_us) {
  float distance_cm = SOUND_CONST_CM * duration_us;
  return distance_cm;
}

