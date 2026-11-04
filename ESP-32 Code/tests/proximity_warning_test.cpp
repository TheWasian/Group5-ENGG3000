#include "../Access_Point/ProximityWarning.h"
#include <assert.h>
#include <stdio.h>

int main() {
  using wam::closeEcho;
  assert(closeEcho(.60f, 0, .60f, 500));
  assert(closeEcho(.20f, 500, .60f, 500));
  assert(!closeEcho(.601f, 0, .60f, 500));
  assert(!closeEcho(.20f, 501, .60f, 500));
  assert(!closeEcho(NAN, 0, .60f, 500));
  assert(!closeEcho(INFINITY, 0, .60f, 500));
  assert(!closeEcho(0, 0, .60f, 500));
  assert(!closeEcho(-.1f, 0, .60f, 500));
  // A new warning must start at 60 cm, but an active one can remain at 62 cm.
  assert(!closeEcho(.62f, 0, .60f, 500));
  assert(closeEcho(.62f, 0, .60f + .03f, 500));
  assert(!closeEcho(.64f, 0, .60f + .03f, 500));

  wam::WarningPulse pulse;
  assert(!pulse.update(false, 1000, 250));
  assert(pulse.update(true, 1100, 250)); // Immediate ON at detection.
  assert(pulse.update(true, 1349, 250));
  assert(!pulse.update(true, 1350, 250));
  assert(!pulse.update(true, 1599, 250));
  assert(pulse.update(true, 1600, 250));
  assert(!pulse.update(false, 1610, 250)); // Stop immediately on clear/expiry.
  assert(pulse.update(true, 1620, 250)); // Restart ON, not the old cycle phase.
  assert(!pulse.update(true, 1870, 250));
  assert(!pulse.update(false, 1900, 250));
  // millis wraps after about 49 days; elapsed-time arithmetic still pulses.
  assert(pulse.update(true, UINT32_MAX - 99, 250));
  assert(pulse.update(true, 149, 250));
  assert(!pulse.update(true, 150, 250));
  assert(pulse.update(true, 400, 250));
  assert(!pulse.update(true, 401, 0)); // Defensive zero-period handling.
  puts("Proximity warning tests passed");
}
