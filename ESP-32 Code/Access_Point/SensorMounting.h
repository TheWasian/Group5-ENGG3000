#pragma once
#include "Positioning.h"

namespace wam {
// Reference is the measured centre of the housing's front opening, with its
// actual forward bearing. Setback is measured along that axis to the effective
// sensor face (midpoint of transmitter/receiver faces in this 2D approximation).
// Use zero if the reference coordinates already describe the metal sensor faces.
// Keep echo ranges referenced to the sensor: do not also subtract the setback.
inline Sensor sensorBehindReference(const Sensor &reference, float setbackM) {
  const float bearing = reference.bearingDeg * PI_F / 180.0f;
  Sensor sensor = reference;
  sensor.x -= setbackM * sinf(bearing);
  sensor.y -= setbackM * cosf(bearing);
  return sensor;
}
} // namespace wam
