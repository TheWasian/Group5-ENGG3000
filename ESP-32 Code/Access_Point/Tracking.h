#pragma once
#include "Positioning.h"

namespace wam {
struct RangeGate {
  float last = NAN, candidate = NAN;
  uint32_t acceptedMs = 0;
  bool rejected = false;
  float update(float raw, uint32_t now, float spikeLimit, float confirmationTolerance,
               uint32_t expiryMs) {
    rejected = false;
    if (!isfinite(raw)) { last = candidate = NAN; return NAN; }
    if (!isfinite(last) || now - acceptedMs > expiryMs) {
      last = raw; candidate = NAN; acceptedMs = now; return raw;
    }
    if (fabsf(raw-last) > spikeLimit) {
      if (!isfinite(candidate) || fabsf(raw-candidate) > confirmationTolerance) {
        candidate = raw; rejected = true; return NAN;
      }
    }
    last = raw; candidate = NAN; acceptedMs = now; return raw;
  }
};
struct TrackingOptions {
  float jumpLimit = .14f, confirmationRadius = .08f;
  float stationaryTau = .35f, movingTau = .12f, movingThreshold = .06f;
  uint32_t holdMs = 350, resetMs = 500;
};
struct PositionTracker {
  Fix accepted;
  uint32_t acceptedMs = 0;
  float candidateX = 0, candidateY = 0;
  bool hasCandidate = false;
  Fix hold(const Fix &measurement, uint32_t now, const TrackingOptions &options, const char *reason) {
    Fix result = measurement; result.reason = reason;
    if (accepted.valid && now-acceptedMs <= options.holdMs) {
      result = accepted; result.held = true; result.reason = reason;
    } else result.valid = false;
    return result;
  }
  Fix update(const Fix &measurement, uint32_t now, const TrackingOptions &options) {
    if (!measurement.valid) {
      hasCandidate = false;
      return hold(measurement, now, options, measurement.reason);
    }
    if (!accepted.valid || now-acceptedMs > options.resetMs) {
      accepted = measurement; accepted.held = false; acceptedMs = now; hasCandidate = false; return accepted;
    }
    const float movement = hypotf(measurement.x-accepted.x, measurement.y-accepted.y);
    if (movement > options.jumpLimit) {
      if (!hasCandidate || hypotf(measurement.x-candidateX, measurement.y-candidateY) > options.confirmationRadius) {
        candidateX = measurement.x; candidateY = measurement.y; hasCandidate = true;
        return hold(measurement, now, options, "confirming_movement");
      }
      // A repeated new position is movement, not an isolated spike. Snap to
      // it after confirmation instead of dragging the old position behind.
      accepted = measurement;
    } else {
      const float dt = (now-acceptedMs) * .001f;
      const float tau = movement > options.movingThreshold ? options.movingTau : options.stationaryTau;
      const float alpha = 1-expf(-dt/fmaxf(.001f,tau));
      Fix filtered = measurement;
      filtered.x = accepted.x + alpha*(measurement.x-accepted.x);
      filtered.y = accepted.y + alpha*(measurement.y-accepted.y);
      accepted = filtered;
    }
    accepted.held = false; acceptedMs = now; hasCandidate = false; return accepted;
  }
};
} // namespace wam
