#include "SensorProcessing.h"
#include "config.h"
#include <CircularBuffer.h>
#include <cmath>

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

Point2D trilaterate(float radius1, float radius2, float x1, float x2,
                    float radius3, float x3) {
  const float radii[3] = {radius1, radius2, radius3};
  const float centreXs[3] = {x1, x2, x3};
  bool available[3];
  for (uint8_t i = 0; i < 3; ++i) {
    available[i] = isfinite(radii[i]) && isfinite(centreXs[i]) && radii[i] >= 0.0f;
  }

  // Subtract each pair of circle equations to eliminate y:
  //   2 * (xj - xi) * x = ri^2 - rj^2 + xj^2 - xi^2
  // A least-squares fit over every usable pair also handles two ranges only.
  float numerator = 0.0f;
  float denominator = 0.0f;
  for (uint8_t i = 0; i < 3; ++i) {
    if (!available[i]) continue;
    for (uint8_t j = i + 1; j < 3; ++j) {
      if (!available[j]) continue;
      const float dx = centreXs[j] - centreXs[i];
      if (fabsf(dx) < 1e-4f) continue; // Coincident centres give no baseline.

      const float slope = 2.0f * dx;
      const float rhs = (radii[i] * radii[i] - radii[j] * radii[j]) +
                        (centreXs[j] * centreXs[j] - centreXs[i] * centreXs[i]);
      numerator += slope * rhs;
      denominator += slope * slope;
    }
  }
  if (denominator < 1e-9f) return Point2D{NAN, NAN};

  Point2D position;
  position.x = numerator / denominator;

  // y is measured from the sensor line (y = 0) towards the play area.
  // Each circle that reaches the solved x contributes a positive height.
  float ySum = 0.0f;
  uint8_t yCount = 0;
  for (uint8_t i = 0; i < 3; ++i) {
    if (!available[i]) continue;
    const float dx = position.x - centreXs[i];
    const float ySquared = radii[i] * radii[i] - dx * dx;
    if (ySquared < 0.0f) continue;
    ySum += sqrtf(ySquared);
    ++yCount;
  }
  if (yCount == 0) return Point2D{NAN, NAN};

  position.y = ySum / yCount;
  return position;
}



// Compute average of a CircularBuffer<uint32_t,...> 
static float bufferAverage(CircularBuffer<uint32_t, 10> &buf) {
  if (buf.isEmpty()) return NAN;
  float sum = 0.0f;
  // Iterate over all elements
  for (size_t i = 0; i < buf.size(); ++i) {
    sum += buf[i];
  }
  return sum / (float)buf.size();
}

float getFilteredX(){
  float radius1 = NAN;
  float radius2 = NAN;
  float radius3 = NAN;
  // If storing durations, convert as needed elsewhere; for now pass as-is if in same units
  float x1 = bufferAverage(buffer1);
  float x2 = bufferAverage(buffer2);
  float x3 = bufferAverage(buffer3);

  Point2D p = trilaterate(radius1, radius2, x1, x2, radius3, x3);
  (void)p;
  return 0.0f;
}

