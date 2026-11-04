#pragma once
#include <math.h>
#include <stdint.h>

namespace wam {
// Distances are measured from the sensor faces, independent of screen origin.
inline bool closeEcho(float metres, uint32_t ageMs, float thresholdM, uint32_t staleMs) {
  return isfinite(metres) && metres >= .02f && metres <= thresholdM && ageMs <= staleMs;
}

struct WarningPulse {
  bool active = true;
  uint32_t startedMs = 0;
  bool update(bool close, uint32_t now, uint32_t halfPeriodMs) {
    if (close && !active) startedMs = now;
    active = close;
    // Start ON immediately and share this phase between the buzzer and LEDs.
    return active && halfPeriodMs && ((now - startedMs) / halfPeriodMs) % 2 == 0;
  }
};
} // namespace wam
