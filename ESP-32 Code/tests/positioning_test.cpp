#include <cassert>
#include <cstdio>
#include <cstring>
#include "../Access_Point/Positioning.h"
#include "../Access_Point/SensorMounting.h"
#include "../Access_Point/RangeProtocol.h"

void rangesAt(float x, float y, const wam::Sensor *s, float *r) {
  for (int i = 0; i < 3; ++i) r[i] = wam::distance(x, y, s[i]);
}
int main() {
  // Synthetic recess values test geometry, not the fitted housing's calibration.
  const wam::Sensor mouth[3] = {{.4f,.3f,19.29005f,15,4.5f},
    {.75f,.3f,0,15,4.5f},{1.1f,.3f,-19.29005f,15,4.5f}};
  const auto unchanged = wam::sensorBehindReference(mouth[0], 0);
  assert(unchanged.x == mouth[0].x && unchanged.y == mouth[0].y);
  assert(unchanged.bearingDeg == mouth[0].bearingDeg &&
    unchanged.halfAngleDeg == mouth[0].halfAngleDeg && unchanged.maxRange == mouth[0].maxRange);
  const auto centre = wam::sensorBehindReference(mouth[1], .07f);
  assert(fabsf(centre.x-.75f)<1e-6f && fabsf(centre.y-.23f)<1e-6f);
  const wam::Sensor turned{.75f,.3f,90,15,4.5f};
  const auto behindTurned = wam::sensorBehindReference(turned, .07f);
  assert(fabsf(behindTurned.x-.68f)<1e-6f && fabsf(behindTurned.y-.3f)<1e-6f);
  for (int asymmetric=0; asymmetric<2; ++asymmetric) {
    const wam::Sensor mounted[3] = {
      wam::sensorBehindReference(mouth[0], .07f),
      wam::sensorBehindReference(mouth[1], asymmetric ? .05f : .07f),
      wam::sensorBehindReference(mouth[2], asymmetric ? .09f : .07f)};
    assert(mounted[0].x < mouth[0].x && mounted[2].x > mouth[2].x);
    const wam::Area playing{1.5f,.6f,1.4f};
    for (int row=0; row<3; ++row) for (int col=0; col<2; ++col) {
      const float x=.6f+.3f*col, y=1+(row+.5f)/3;
      for (int missing=-1; missing<3; ++missing) {
        float echoes[3]; rangesAt(x,y,mounted,echoes);
        if (missing>=0) echoes[missing]=NAN;
        const auto corrected=wam::solve(mounted,echoes,playing);
        assert(corrected.valid && corrected.count==(missing<0 ? 3 : 2));
        assert(hypotf(corrected.x-x,corrected.y-y)<.003f);
        if (missing<0) {
          const auto ignored=wam::solve(mouth,echoes,playing);
          assert(!ignored.valid || hypotf(ignored.x-x,ignored.y-y)>.02f);
        }
      }
    }
  }
  const wam::Area area{1.5f, .6f, 1.4f};
  const wam::Sensor actual[3] = {{.45f,.3f,16.699f,15,4.5f},{.75f,.3f,0,15,4.5f},{1.05f,.3f,-16.699f,15,4.5f}};
  float r[3];
  rangesAt(.75f,1.3f,actual,r);
  auto p = wam::solve(actual,r,area);
  assert(p.valid && p.count == 3 && fabsf(p.x-.75f)<.001f && fabsf(p.y-1.3f)<.001f);
  r[0]+=.008f; r[1]-=.006f; r[2]+=.003f;
  p=wam::solve(actual,r,area);
  assert(p.valid && hypotf(p.x-.75f,p.y-1.3f)<.05f);
  rangesAt(.75f,1.3f,actual,r); r[1]=NAN;
  p=wam::solve(actual,r,area);
  assert(p.valid && p.count==2 && strcmp(p.reason,"two_ranges")==0 && p.y>.3f);
  r[2]=NAN; assert(!wam::solve(actual,r,area).valid);
  r[0]=INFINITY; assert(!wam::solve(actual,r,area).valid);
  r[0]=.02f; r[1]=NAN; r[2]=3; assert(!wam::solve(actual,r,area).valid);
  rangesAt(.75f,1.3f,actual,r); r[1]+=.8f;
  assert(!wam::solve(actual,r,area).valid); // Cannot discard a conflicting third echo.
  rangesAt(.75f,2.5f,actual,r); assert(!wam::solve(actual,r,area).valid); // No edge clamping.
  rangesAt(0,1.3f,actual,r); assert(!wam::solve(actual,r,area).valid); // Outside actual cones.
  const wam::Sensor coincident[3]={{.75f,.3f,0,90,4.5f},{.75f,.3f,0,90,4.5f},{.75f,.3f,0,90,4.5f}};
  rangesAt(.75f,1.3f,coincident,r); assert(!wam::solve(coincident,r,area).valid);
  const wam::Sensor ambiguous[3]={{.4f,1,90,89,4.5f},{1.1f,1,-90,89,4.5f},{0,0,0,15,4.5f}};
  rangesAt(.75f,1.1f,ambiguous,r);r[2]=NAN;
  assert(!wam::solve(ambiguous,r,area).valid); // Both circle intersections are plausible.

  // Synthetic broad cones isolate the mathematics from physical coverage.
  const wam::Sensor broad[3]={{0,.3f,0,89,4.5f},{.75f,.3f,0,89,4.5f},{1.5f,.3f,0,89,4.5f}};
  int tested=0;
  for(int ix=1;ix<15;++ix)for(int iy=7;iy<=20;++iy){
    const float x=ix*.1f,y=iy*.1f;rangesAt(x,y,broad,r);p=wam::solve(broad,r,area);
    assert(p.valid && hypotf(p.x-x,p.y-y)<.003f);++tested;
  }
  for(int row=0;row<3;++row)for(int col=0;col<2;++col)
    assert(wam::holeForPosition(.375f+.75f*col,.6f+(row+.5f)*1.4f/3,-1,area)==row*2+col);
  assert(wam::holeForPosition(.76f,.85f,0,area)==0);
  assert(wam::holeForPosition(.81f,.85f,0,area)==1);
  assert(wam::holeForPosition(.75f,.6f,-1,area)==-1);
  assert(wam::holeForPosition(.75f,.5f,0,area)==-1);
  assert(wam::holeForPosition(1.6f,1,1,area)==-1);
  assert(wam::holeForPosition(NAN,1,-1,area)==-1);
  assert(wam::holeForPosition(1.5f,2,-1,area)==5);

  const uint8_t crcText[]="123456789";
  assert(wam::crc32(crcText,9)==0xcbf43926UL);
  wam::ControlPacket poll{};poll.magic=wam::PACKET_MAGIC;poll.version=2;poll.type=wam::ARM;
  poll.nodeId=1;poll.session=456;poll.sequence=9;poll.crc=wam::packetCrc(poll);
  assert(poll.crc==wam::packetCrc(poll));++poll.sequence;assert(poll.crc!=wam::packetCrc(poll));
  wam::TriggerGate gate;
  assert(!gate.fire(1,1,10));
  assert(gate.arm(1,1,10));assert(!gate.fire(2,1,11));assert(!gate.fire(1,2,11));
  assert(gate.fire(1,1,12));assert(!gate.fire(1,1,13));assert(!gate.arm(1,1,14));
  assert(gate.arm(1,2,20));assert(!gate.fire(1,2,20+wam::ARM_LIFETIME_MS+1));
  assert(gate.arm(2,1,100));assert(gate.fire(2,1,101)); // AP restart, new session.
  assert(gate.arm(3,UINT32_MAX,UINT32_MAX-10));assert(gate.fire(3,UINT32_MAX,5));
  assert(gate.arm(3,0,6));assert(gate.fire(3,0,7)); // millis and sequence wrap.
  assert(!wam::deadlineReached(UINT32_MAX-5,10));assert(wam::deadlineReached(10,10));
  printf("PASS: housing geometry (48 two/three-range fixes), %d grid points, noisy/partial/ambiguous/invalid fixes, all holes, CRC and trigger timing.\n",tested);
}
