#include <cassert>
#include <cstdio>
#include <cstring>
#include <random>
#include "../Access_Point/Tracking.h"

wam::Fix fixAt(float x, float y) {
  wam::Fix p; p.x=x;p.y=y;p.valid=true;p.count=3;p.reason="three_ranges";return p;
}
int main() {
  // Current measured layout: centre .75 m, both gaps .35 m.
  const wam::Sensor sensors[3] = {
    {.4f,.3f,atan2f(.35f,1)*180/wam::PI_F,15,4.5f},
    {.75f,.3f,0,15,4.5f},
    {1.1f,.3f,-atan2f(.35f,1)*180/wam::PI_F,15,4.5f}
  };
  const wam::Area area{1.5f,.6f,1.4f}, game{.6f,1,1};
  for(int row=0;row<3;++row)for(int col=0;col<2;++col){
    const float x=.6f+.3f*col,y=1+(row+.5f)/3;float ranges[3];
    for(int i=0;i<3;++i){
      assert(wam::inCone(x,y,sensors[i])); // All six centres have THREE beams.
      ranges[i]=wam::distance(x,y,sensors[i]);
    }
    const auto p=wam::solveBestAvailable(sensors,ranges,area);
    assert(p.valid && hypotf(p.x-x,p.y-y)<.002f);
    assert(wam::holeForPosition(p.x-.45f,p.y,-1,game)==row*2+col);
    // Any one missing sensor still permits these target centres.
    for(int missing=0;missing<3;++missing){
      const float saved=ranges[missing];ranges[missing]=NAN;
      const auto partial=wam::solveBestAvailable(sensors,ranges,area);ranges[missing]=saved;
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
  // A mode keeps a repeated cluster instead of averaging it towards an outlier.
  wam::PositionMode mode;
  mode.update(fixAt(.601f,1.201f),100,options);
  mode.update(fixAt(.603f,1.204f),200,options);
  auto modal=mode.update(fixAt(.69f,1.2f),300,options);
  assert(modal.x==.601f && modal.y==1.201f);
  // Equal frequency goes to the newest cell; its representative is a real fix.
  modal=mode.update(fixAt(.691f,1.201f),400,options);
  assert(modal.x==.691f && modal.y==1.201f);
  auto pair=fixAt(.602f,1.202f);pair.count=2;pair.usedMask=5;
  modal=mode.update(pair,500,options);
  assert(modal.x==.601f && modal.count==2 && modal.usedMask==5);
  // Evict the oldest vote when the window fills; sustained smaller moves follow.
  modal=mode.update(fixAt(.692f,1.202f),600,options);
  assert(modal.x==.692f && mode.size==5);
  // Never fabricate a coordinate by mixing independent x and y modes.
  mode.clear();
  mode.update(fixAt(.6f,1.2f),100,options);
  mode.update(fixAt(.6f,1.3f),200,options);
  mode.update(fixAt(.7f,1.4f),300,options);
  modal=mode.update(fixAt(.8f,1.4f),400,options);
  assert(modal.x==.8f && modal.y==1.4f); // No repeated cell: newest real pair.
  modal=mode.update(fixAt(.9f,1.5f),1401,options);
  assert(modal.x==.9f && mode.size==1); // Old votes expire.
  mode.clear();
  mode.update(fixAt(.6f,1.2f),UINT32_MAX-100,options);
  mode.update(fixAt(.6f,1.2f),100,options);
  modal=mode.update(fixAt(.7f,1.3f),200,options);
  assert(modal.x==.6f); // History ages correctly across millis wrap.
  modal=mode.update(fixAt(.8f,1.4f),1201,options);
  assert(modal.x==.8f && mode.size==1);
  options.modeWindow=1;
  modal=mode.update(fixAt(.9f,1.5f),1300,options);
  assert(modal.x==.9f && mode.size==1);
  options=wam::TrackingOptions{};
  wam::PositionTracker tracker;
  auto p=tracker.update(fixAt(.6f,1.2f),100,options);assert(p.valid && !p.held);
  p=tracker.update(fixAt(.95f,1.6f),300,options);
  assert(p.valid && p.held && p.x==.6f && tracker.acceptedMs==100);
  p=tracker.update(fixAt(.605f,1.205f),500,options);
  assert(!p.held && hypotf(p.x-.6f,p.y-1.2f)<.01f); // Isolated jump disappears.
  p=tracker.update(fixAt(.95f,1.6f),700,options);assert(p.held);
  p=tracker.update(fixAt(.96f,1.61f),900,options);
  assert(!p.held && p.x==.96f); // Sustained movement follows on second frame.
  assert(tracker.mode.size==1); // Confirmed motion discards the old cluster.
  wam::Fix missing;
  p=tracker.update(missing,1100,options);assert(p.valid && p.held);
  assert(tracker.mode.size==0);
  p=tracker.update(missing,1251,options);assert(!p.valid); // 350 ms visual hold.
  p=tracker.update(fixAt(.6f,1.2f),1501,options);assert(p.valid && !p.held && p.x==.6f);
  tracker=wam::PositionTracker{};
  tracker.update(fixAt(.6f,1.2f),UINT32_MAX-100,options);
  p=tracker.update(missing,100,options);assert(p.valid && p.held);
  p=tracker.update(missing,300,options);assert(!p.valid); // millis wrap.

  // Short dropouts clear votes even before the tracker reset timeout elapses.
  tracker=wam::PositionTracker{};
  tracker.update(fixAt(.6f,1.2f),100,options);
  tracker.update(fixAt(.6f,1.2f),200,options);
  tracker.update(missing,250,options);
  p=tracker.update(fixAt(.7f,1.2f),300,options);
  assert(!p.held && p.x==.7f);

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
    auto raw=wam::solveBestAvailable(sensors,r,area);
    if(rejected){++rejections;assert(raw.valid && raw.count==2);}
    p=tracker.update(raw,now,options);
    if(frame>20 && raw.valid && p.valid && !p.held){
      unfilteredError+=wam::square(raw.x-.75f)+wam::square(raw.y-1.5f);
      trackedError+=wam::square(p.x-.75f)+wam::square(p.y-1.5f);++count;
    }
    if(frame>20 && p.valid && hypotf(p.x-.75f,p.y-1.5f)>=.1f)
      fprintf(stderr,"stationary excursion: frame=%d raw=(%.3f,%.3f) filtered=(%.3f,%.3f) sensors=%d uncertainty=%.3f held=%d\n",frame,raw.x,raw.y,p.x,p.y,raw.count,raw.uncertainty,p.held);
    if(frame>20 && p.valid)assert(hypotf(p.x-.75f,p.y-1.5f)<.1f);
  }
  assert(count>500 && rejections>=15);
  const double rawRms=sqrt(unfilteredError/count),filteredRms=sqrt(trackedError/count);
  assert(filteredRms<rawRms*.75 && filteredRms<.03);
  printf("PASS: mode voting/ties/window/expiry, six targets, partial fixes, spike/motion/dropout/wrap checks; stationary simulation RMS %.2f -> %.2f cm (%d samples, %d spikes rejected).\n",rawRms*100,filteredRms*100,count,rejections);
}
