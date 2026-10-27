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
  float modeBinM = .05f; // Nearby x/y pairs vote for the same 5 cm cell.
  uint8_t modeWindow = 5;
  uint32_t modeHistoryMs = 1000;
  uint32_t holdMs = 350, resetMs = 500;
};
// Joint position mode: never combine independent x/y modes into an unobserved
// point. Keep actual solved coordinates, not an average or a snapped cell centre.
struct PositionMode {
  static constexpr uint8_t CAPACITY = 9;
  struct Sample { float x, y; uint32_t time; };
  Sample samples[CAPACITY];
  uint8_t size = 0;
  void clear() { size = 0; }
  Fix update(const Fix &measurement, uint32_t now, const TrackingOptions &options) {
    const uint8_t window = options.modeWindow < 1 ? 1 :
      (options.modeWindow > CAPACITY ? CAPACITY : options.modeWindow);
    const float bin = isfinite(options.modeBinM) && options.modeBinM > 0
      ? options.modeBinM : .05f;
    uint8_t retained = 0;
    for (uint8_t i = 0; i < size; ++i)
      if (now - samples[i].time <= options.modeHistoryMs) samples[retained++] = samples[i];
    size = retained;
    while (size >= window) {
      for (uint8_t i = 1; i < size; ++i) samples[i-1] = samples[i];
      --size;
    }
    samples[size++] = {measurement.x, measurement.y, now};
    int32_t cellX[CAPACITY], cellY[CAPACITY];
    for (uint8_t i = 0; i < size; ++i) {
      cellX[i] = static_cast<int32_t>(roundf(samples[i].x / bin));
      cellY[i] = static_cast<int32_t>(roundf(samples[i].y / bin));
    }
    uint8_t winner = 0, bestVotes = 0;
    for (uint8_t i = 0; i < size; ++i) {
      uint8_t votes = 0;
      for (uint8_t j = 0; j < size; ++j)
        if (cellX[i] == cellX[j] && cellY[i] == cellY[j]) ++votes;
      // Oldest to newest: equal vote counts favour the newest observed cell.
      if (votes >= bestVotes) { bestVotes = votes; winner = i; }
    }
    // When no cell repeats, use the latest measurement instead of inventing a mode.
    uint8_t representative = winner;
    if (bestVotes > 1) {
      float nearest = INFINITY;
      for (uint8_t i = 0; i < size; ++i) {
        if (cellX[i] != cellX[winner] || cellY[i] != cellY[winner]) continue;
        const float d = square(samples[i].x - cellX[winner]*bin) +
                        square(samples[i].y - cellY[winner]*bin);
        if (d <= nearest) { nearest = d; representative = i; }
      }
    }
    Fix result = measurement;
    result.x = samples[representative].x; result.y = samples[representative].y;
    return result;
  }
};
struct PositionTracker {
  Fix accepted;
  PositionMode mode;
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
      mode.clear(); // Reacquisition must not vote against pre-dropout positions.
      return hold(measurement, now, options, measurement.reason);
    }
    if (!accepted.valid || now-acceptedMs > options.resetMs) {
      mode.clear(); mode.update(measurement, now, options);
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
      mode.clear(); mode.update(measurement, now, options);
      accepted = measurement;
    } else {
      accepted = mode.update(measurement, now, options);
    }
    accepted.held = false; acceptedMs = now; hasCandidate = false; return accepted;
  }
};
} // namespace wam
