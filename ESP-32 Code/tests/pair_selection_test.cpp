#include <cassert>
#include <cstdio>
#include <cstring>
#include <initializer_list>
#include "../Access_Point/Tracking.h"

int main() {
  const wam::Area area{1.5f,.6f,1.4f};
  const wam::Sensor sensors[3] = {
    {.4f,.3f,atan2f(.35f,1)*180/wam::PI_F,15,4.5f},
    {.75f,.3f,0,15,4.5f},
    {1.1f,.3f,-atan2f(.35f,1)*180/wam::PI_F,15,4.5f}
  };
  // The two edges of the game rectangle each have only two modelled beams.
  for(float x : {.47f,1.03f}) {
    const float y=1.6f;float r[3];int available=0;
    for(int i=0;i<3;++i){
      r[i]=wam::inCone(x,y,sensors[i]) ? wam::distance(x,y,sensors[i]) : NAN;
      if(isfinite(r[i]))++available;
    }
    assert(available==2);
    auto p=wam::solveBestAvailable(sensors,r,area);
    assert(p.valid && p.count==2 && hypotf(p.x-x,p.y-y)<.002f);
    assert(p.usedMask==(x<.75f ? 6 : 3));
    // A third sensor sees the wall instead: the useful pair must still work.
    for(int i=0;i<3;++i)if(!isfinite(r[i]))r[i]=3;
    p=wam::solveBestAvailable(sensors,r,area);
    assert(p.valid && p.count==2 && p.availableMask==7);
    assert(strcmp(p.reason,"two_ranges_fallback")==0 && hypotf(p.x-x,p.y-y)<.002f);
  }
  for(int missing=0;missing<3;++missing){
    float r[3];for(int i=0;i<3;++i)r[i]=wam::distance(.75f,1.3f,sensors[i]);
    auto p=wam::solveBestAvailable(sensors,r,area);
    assert(p.valid && p.count==3 && p.usedMask==7);
    r[missing]=NAN;p=wam::solveBestAvailable(sensors,r,area);
    assert(p.valid && p.count==2 && p.usedMask==(7^(1<<missing)));
    r[missing]=3;p=wam::solveBestAvailable(sensors,r,area);
    assert(p.valid && p.count==2 && p.usedMask==(7^(1<<missing)));
    // An untrusted spike removes only its sensor, not the other pair's fix.
    wam::RangeGate gate;gate.update(1,100,.16f,.1f,500);
    r[missing]=gate.update(3,300,.16f,.1f,500);
    assert(gate.rejected);
    p=wam::solveBestAvailable(sensors,r,area);assert(p.valid && p.count==2);
    r[(missing+1)%3]=NAN;p=wam::solveBestAvailable(sensors,r,area);
    assert(!p.valid && p.count==1 && p.usedMask==0);
  }
  // Multiple contradictory but individually plausible pairs cannot be chosen
  // arbitrarily. This fixture has broad beams to isolate the ambiguity rule.
  const wam::Sensor broad[3]={{.2f,.3f,0,89,4.5f},{.75f,.3f,0,89,4.5f},{1.3f,.3f,0,89,4.5f}};
  float r[3];for(int i=0;i<3;++i)r[i]=wam::distance(.75f,1.3f,broad[i]);
  r[1]+=.22f;
  auto ambiguous=wam::solveBestAvailable(broad,r,area,nullptr,.03f,.06f);
  assert(!ambiguous.valid && strcmp(ambiguous.reason,"ambiguous_pairs")==0);
  wam::Fix previous;previous.valid=true;previous.x=.75f;previous.y=1.3f;
  auto continued=wam::solveBestAvailable(broad,r,area,&previous,.03f,.06f,.06f,.025f,.20f,.10f,.10f);
  assert(continued.valid && continued.count==2 && continued.usedMask==5);
  const float impossible[3]={.03f,.04f,NAN};
  assert(!wam::solveBestAvailable(sensors,impossible,area).valid);
  for(int i=0;i<3;++i)r[i]=wam::distance(.75f,1.3f,sensors[i]);
  const uint32_t ages[3]={450,100,0};
  auto timely=wam::solveBestAvailable(sensors,r,area,nullptr,.1f,.18f,.06f,.025f,.2f,.1f,.25f,ages,300);
  assert(timely.valid && timely.usedMask==6 && strcmp(timely.reason,"two_ranges_timing")==0);
  r[1]=NAN;
  timely=wam::solveBestAvailable(sensors,r,area,nullptr,.1f,.18f,.06f,.025f,.2f,.1f,.25f,ages,300);
  assert(!timely.valid && strcmp(timely.reason,"frame_too_slow")==0);
  printf("PASS: two-beam edge regions, every pair, third-background/spike fallback, three-sensor preference, ambiguity and one-sensor rejection.\n");
}
