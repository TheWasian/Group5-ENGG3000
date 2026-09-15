#pragma once
#include <math.h>
#include <stdint.h>

// Pure geometry: no Arduino dependencies, so the actual solver can be tested
// on a PC. Bearing is degrees from +y; positive points towards the right.
namespace wam {
constexpr float PI_F = 3.14159265358979323846f;
struct Sensor { float x, y, bearingDeg, halfAngleDeg, maxRange; };
struct Area { float width, startY, depth; };
struct Fix {
  float x = 0, y = 0, rms = NAN;
  float uncertainty = NAN;
  uint8_t count = 0;
  bool valid = false, held = false;
  const char *reason = "insufficient_ranges";
};
inline float square(float x) { return x * x; }
inline float distance(float x, float y, const Sensor &s) {
  return sqrtf(square(x - s.x) + square(y - s.y));
}
inline bool inCone(float x, float y, const Sensor &s) {
  const float r = distance(x, y, s);
  if (!isfinite(r) || r < 0.02f || r > s.maxRange) return false;
  const float a = s.bearingDeg * PI_F / 180.0f;
  return ((x - s.x) * sinf(a) + (y - s.y) * cosf(a)) / r >=
         cosf(s.halfAngleDeg * PI_F / 180.0f) - 0.00001f;
}
inline bool inPlayArea(float x, float y, const Area &a) {
  return isfinite(x) && isfinite(y) && x >= 0 && x <= a.width &&
         y > a.startY && y <= a.startY + a.depth;
}
inline bool inTrackingArea(float x, float y, const Area &a) {
  // Include the dead zone for warning detection. Never clamp an outside fix
  // onto the edge of the game: that would turn a background echo into a hit.
  return isfinite(x) && isfinite(y) && x >= 0 && x <= a.width &&
         y >= 0 && y <= a.startY + a.depth;
}
inline int8_t holeForPosition(float x, float y, int8_t current, const Area &area,
                             float hysteresis = 0.05f) {
  if (!inPlayArea(x, y, area)) return -1;
  int col = x < area.width / 2 ? 0 : 1;
  int row = static_cast<int>((y - area.startY) / (area.depth / 3));
  if (row > 2) row = 2;
  if (current >= 0 && current < 6) {
    const int oldCol = current % 2, oldRow = current / 2;
    if (fabsf(x - area.width / 2) <= hysteresis) col = oldCol;
    const float lo = area.startY + oldRow * area.depth / 3, hi = lo + area.depth / 3;
    if (y >= lo - hysteresis && y <= hi + hysteresis) row = oldRow;
  }
  return row * 2 + col;
}
inline float cost(float x, float y, const Sensor *s, const float *r) {
  float total = 0;
  for (int i = 0; i < 3; ++i) if (isfinite(r[i]))
    total += square(distance(x, y, s[i]) - r[i]);
  return total;
}
inline float robustCost(float x, float y, const Sensor *s, const float *r, float delta) {
  float total = 0;
  for (int i = 0; i < 3; ++i) if (isfinite(r[i])) {
    const float e = fabsf(distance(x, y, s[i]) - r[i]);
    total += e <= delta ? square(e) : 2 * delta * e - square(delta);
  }
  return total;
}
inline void checkUncertainty(Fix &fix, const Sensor *s, const float *r, float noise, float limit) {
  if (!fix.valid) return;
  float xx = 0, xy = 0, yy = 0;
  for (int i = 0; i < 3; ++i) if (isfinite(r[i])) {
    const float d = fmaxf(.001f, distance(fix.x, fix.y, s[i]));
    const float jx = (fix.x - s[i].x) / d, jy = (fix.y - s[i].y) / d;
    xx += jx * jx; xy += jx * jy; yy += jy * jy;
  }
  // Largest axis standard deviation of sigma^2 (J'J)^-1. This is a
  // geometry/noise model, not a claim about measured real-world accuracy.
  const float smallestEigenvalue = .5f * (xx + yy - sqrtf(square(xx - yy) + 4 * xy * xy));
  const float sigma = fmaxf(noise, isfinite(fix.rms) ? fix.rms : noise);
  fix.uncertainty = smallestEigenvalue > 1e-6f ? sigma / sqrtf(smallestEigenvalue) : INFINITY;
  if (fix.uncertainty > limit) { fix.valid = false; fix.reason = "weak_geometry"; }
}
inline bool soundGeometry(float x, float y, const Sensor *s, const float *r) {
  float xx = 0, xy = 0, yy = 0;
  for (int i = 0; i < 3; ++i) if (isfinite(r[i])) {
    const float d = distance(x, y, s[i]);
    if (d < 0.001f) return false;
    const float jx = (x - s[i].x) / d, jy = (y - s[i].y) / d;
    xx += jx * jx; xy += jx * jy; yy += jy * jy;
  }
  return (xx * yy - xy * xy) / square(xx + yy) > 0.002f;
}
inline bool acceptable(float x, float y, const Sensor *s, const float *r,
                       const Area &area) {
  if (!inTrackingArea(x, y, area) || !soundGeometry(x, y, s, r)) return false;
  for (int i = 0; i < 3; ++i)
    if (isfinite(r[i]) && !inCone(x, y, s[i])) return false;
  return true;
}
inline Fix solve(const Sensor *s, const float *input, const Area &area,
                 float maxRms = 0.10f, float maxResidual = 0.18f,
                 float huberLimit = 0.06f, float rangeNoise = 0.025f,
                 float maxUncertainty = 0.20f) {
  Fix result;
  float r[3]; int ids[3];
  for (int i = 0; i < 3; ++i) {
    r[i] = isfinite(input[i]) && input[i] >= 0.02f && input[i] <= s[i].maxRange
             ? input[i] : NAN;
    if (isfinite(r[i])) ids[result.count++] = i;
  }
  if (result.count < 2) return result;

  // Exact two-circle intersections. Bounds and BOTH measured cones must
  // select one unique solution. Two ranges have no third-sensor cross-check.
  if (result.count == 2) {
    const int i = ids[0], j = ids[1];
    const float dx = s[j].x - s[i].x, dy = s[j].y - s[i].y;
    const float base = sqrtf(dx * dx + dy * dy);
    result.reason = "inconsistent_ranges";
    if (base < 0.01f || base > r[i] + r[j] || base < fabsf(r[i] - r[j])) return result;
    const float along = (square(r[i]) - square(r[j]) + square(base)) / (2 * base);
    const float height2 = square(r[i]) - square(along);
    if (height2 <= 0) { result.reason = "weak_geometry"; return result; }
    const float h = sqrtf(height2), cx = s[i].x + along * dx / base;
    const float cy = s[i].y + along * dy / base;
    int accepted = 0;
    for (int sign = -1; sign <= 1; sign += 2) {
      const float x = cx - sign * h * dy / base, y = cy + sign * h * dx / base;
      if (acceptable(x, y, s, r, area)) { result.x = x; result.y = y; ++accepted; }
    }
    result.valid = accepted == 1;
    result.rms = result.valid ? 0 : NAN;
    result.reason = result.valid ? "two_ranges" : (accepted > 1 ? "ambiguous" : "outside_cones_or_area");
    checkUncertainty(result, s, r, rangeNoise, maxUncertainty);
    return result;
  }

  // Huber loss reduces the influence of moderate outliers. Adaptive
  // Levenberg-Marquardt damping accepts only steps that reduce that loss.
  // Multiple starts also handle a straight row and its mirror solutions.
  float bestCost = INFINITY, bestX = 0, bestY = 0;
  for (int seed = 0; seed < 9; ++seed) {
    float x = area.width * (0.2f + 0.3f * (seed % 3));
    float y = (area.startY + area.depth) * (0.2f + 0.3f * (seed / 3));
    float damping = 0.001f;
    for (int iteration = 0; iteration < 35; ++iteration) {
      float xx = 0, xy = 0, yy = 0, bx = 0, by = 0;
      for (int i = 0; i < 3; ++i) {
        const float d = fmaxf(0.001f, distance(x, y, s[i]));
        const float jx = (x - s[i].x) / d, jy = (y - s[i].y) / d, e = d - r[i];
        const float weight = fabsf(e) <= huberLimit ? 1 : huberLimit / fabsf(e);
        xx += weight * jx * jx; xy += weight * jx * jy; yy += weight * jy * jy;
        bx += weight * jx * e; by += weight * jy * e;
      }
      xx += damping; yy += damping;
      const float determinant = xx * yy - xy * xy;
      if (determinant < 1e-8f) break;
      const float stepX = (yy * bx - xy * by) / determinant;
      const float stepY = (xx * by - xy * bx) / determinant;
      if (robustCost(x-stepX, y-stepY, s, r, huberLimit) <= robustCost(x, y, s, r, huberLimit)) {
        x -= stepX; y -= stepY; damping = fmaxf(1e-7f, damping * .3f);
        if (square(stepX) + square(stepY) < 1e-9f) break;
      } else damping = fminf(1e6f, damping * 10);
    }
    const float c = robustCost(x, y, s, r, huberLimit);
    if (acceptable(x, y, s, r, area) && c < bestCost) { bestCost = c; bestX = x; bestY = y; }
  }
  result.reason = "outside_cones_or_area";
  if (!isfinite(bestCost)) return result;
  result.rms = sqrtf(cost(bestX, bestY, s, r) / 3);
  result.reason = "inconsistent_ranges";
  if (result.rms > maxRms) return result;
  for (int i = 0; i < 3; ++i)
    if (fabsf(distance(bestX, bestY, s[i]) - r[i]) > maxResidual) return result;
  result.x = bestX; result.y = bestY; result.valid = true; result.reason = "three_ranges";
  checkUncertainty(result, s, r, rangeNoise, maxUncertainty);
  return result;
}
} // namespace wam
