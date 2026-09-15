#include <cassert>
#include <cstdio>
#include <cstring>
#include <random>
#include "../Access_Point/Tracking.h"

wam::Fix fixAt(float x, float y) {
  wam::Fix p; p.x=x;p.y=y;p.valid=true;p.count=3;p.reason="three_ranges";return p;
}
int main() {
  // Current measured layout: centre .75 m, left gap .36 m, right gap .48 m.
  const wam::Sensor sensors[3] = {
    {.39f,.3f,atan2f(.36f,1)*180/wam::PI_F,15,4.5f},
    {.75f,.3f,0,15,4.5f},
    {1.23f,.3f,-atan2f(.48f,1)*180/wam::PI_F,15,4.5f}
  };
  const wam::Area area{1.5f,.6f,1.4f}, game{.6f,1,1};
  for(int row=0;row<3;++row)for(int col=0;col<2;++col){
    const float x=.6f+.3f*col,y=1+(row+.5f)/3;float ranges[3];
    for(int i=0;i<3;++i){
      assert(wam::inCone(x,y,sensors[i])); // All six centres have THREE beams.
      ranges[i]=wam::distance(x,y,sensors[i]);
    }
    const auto p=wam::solve(sensors,ranges,area);
    assert(p.valid && hypotf(p.x-x,p.y-y)<.002f);
    assert(wam::holeForPosition(p.x-.45f,p.y,-1,game)==row*2+col);
    // Any one missing sensor still permits these target centres.
    for(int missing=0;missing<3;++missing){
      const float saved=ranges[missing];ranges[missing]=NAN;
      const auto partial=wam::solve(sensors,ranges,area);ranges[missing]=saved;
      assert(partial.valid && partial.count==2 && hypotf(partial.x-x,partial.y-y)<.002f);
    }
  }
  assert(wam::holeForPosition(.4f-.45f,1.2f,-1,game)==-1);
  assert(wam::holeForPosition(.6f-.45f,.9f,-1,game)==-1);

  wam::RangeGate gate;
  assert(gate.update(1,100,.16f,.1f,500)==1);
  assert(!isfinite(gate.update(1.4f,300,.16f,.1f,500)) && gate.rejected);
  assert(gate.update(1.01f,500,.16f,.1f,500)==1.01f && !gate.rejected);
  assert(!isfinite(gate.update(1.4f,700,.16f,.1f,500)));
  assert(gate.update(1.42f,900,.16f,.1f,500)==1.42f); // Repeated motion accepted.
  assert(!isfinite(gate.update(NAN,1100,.16f,.1f,500)));
  assert(gate.update(.5f,1300,.16f,.1f,500)==.5f); // No old range after loss.

  wam::TrackingOptions options;
  wam::PositionTracker tracker;
  auto p=tracker.update(fixAt(.6f,1.2f),100,options);assert(p.valid && !p.held);
  p=tracker.update(fixAt(.95f,1.6f),300,options);
  assert(p.valid && p.held && p.x==.6f && tracker.acceptedMs==100);
  p=tracker.update(fixAt(.605f,1.205f),500,options);
  assert(!p.held && hypotf(p.x-.6f,p.y-1.2f)<.01f); // Isolated jump disappears.
  p=tracker.update(fixAt(.95f,1.6f),700,options);assert(p.held);
  p=tracker.update(fixAt(.96f,1.61f),900,options);
  assert(!p.held && p.x==.96f); // Sustained movement follows on second frame.
  wam::Fix missing;
  p=tracker.update(missing,1100,options);assert(p.valid && p.held);
  p=tracker.update(missing,1251,options);assert(!p.valid); // 350 ms visual hold.
  p=tracker.update(fixAt(.6f,1.2f),1501,options);assert(p.valid && !p.held && p.x==.6f);
  tracker=wam::PositionTracker{};
  tracker.update(fixAt(.6f,1.2f),UINT32_MAX-100,options);
  p=tracker.update(missing,100,options);assert(p.valid && p.held);
  p=tracker.update(missing,300,options);assert(!p.valid); // millis wrap.

  // Reproducible stationary simulation, 200 ms frames and 1.2 cm range sigma.
  // Compare actual tracker output with the same solver without tracking.
  std::mt19937 random(2300);std::normal_distribution<float> noise(0,.012f);
  tracker=wam::PositionTracker{};wam::RangeGate gates[3];
  double unfilteredError=0,trackedError=0;int count=0,rejections=0;
  for(int frame=0;frame<600;++frame){
    const uint32_t now=100+frame*200;float r[3];bool rejected=false;
    for(int i=0;i<3;++i){
      float raw=wam::distance(.75f,1.5f,sensors[i])+noise(random);
      if(frame>20 && frame%37==0 && i==0)raw+=.4f;
      r[i]=gates[i].update(raw,now,.16f,.1f,500);rejected|=gates[i].rejected;
    }
    auto raw=wam::solve(sensors,r,area);
    if(rejected){raw.valid=false;raw.reason="range_spike";++rejections;}
    p=tracker.update(raw,now,options);
    if(frame>20 && raw.valid && p.valid && !p.held){
      unfilteredError+=wam::square(raw.x-.75f)+wam::square(raw.y-1.5f);
      trackedError+=wam::square(p.x-.75f)+wam::square(p.y-1.5f);++count;
    }
    if(frame>20 && p.valid)assert(hypotf(p.x-.75f,p.y-1.5f)<.1f);
  }
  assert(count>500 && rejections>=15);
  const double rawRms=sqrt(unfilteredError/count),filteredRms=sqrt(trackedError/count);
  assert(filteredRms<rawRms*.75 && filteredRms<.03);
  printf("PASS: six reachable targets, partial fixes, spike/motion/dropout/wrap checks; stationary simulation RMS %.2f -> %.2f cm (%d samples, %d spikes rejected).\n",rawRms*100,filteredRms*100,count,rejections);
}
