// Exercise the actual browser model embedded in cones.html without a DOM.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '../Access_Point/cones.html'), 'utf8');
const source = html.match(/<script id="hole-calibration-model">([\s\S]*?)<\/script>/)[1];
const HoleCalibration = vm.runInNewContext(source + '\nHoleCalibration');
const config = {width_m:1.5,depth_m:1.4,play_start_y_m:.6,stale_ms:500,
  game_area:{x_min_m:.45,x_max_m:1.05,start_y_m:1,end_y_m:2},
  sensors:[{x_m:.4,y_m:.3},{x_m:.75,y_m:.3},{x_m:1.1,y_m:.3}]};
const frame=(id,x=.6,y=1.2,extra={})=>({boot_id:1,frame_id:id,valid:true,held:false,warning:false,
  sensors_used:2,age_ms:10,raw_x_m:x,raw_y_m:y,...extra});
function capture(c,index,x,y,start=0,noise=()=>0){
  c.observe(frame(start,x,y),start);c.start(index,start);
  for(let i=0;i<15;i++)c.observe(frame(start+i+1,x+noise(i),y),start+3000+i*200);
}
const c=new HoleCalibration(config);
capture(c,0,.6,1.2);
assert.equal(c.holes[0].x,.6);assert.equal(c.holes[0].count,15);assert.equal(c.capture,null);
assert.equal(c.match(5900).index,0);
assert.equal(c.match(6400).index,-1,'expired positions cannot match');
assert.equal(c.snapshot().version,1);
// All six target centres and both two/three-sensor inputs.
for(let i=1;i<6;i++)capture(c,i,.6+.3*(i%2),1.2+.3*Math.floor(i/2),i*10000);
assert.equal(c.holes.filter(Boolean).length,6);
for(let i=0;i<6;i++){
  c.observe(frame(1000+i,c.holes[i].x,c.holes[i].y,{sensors_used:3}),100000+i*1000);
  assert.equal(c.match(100000+i*1000).index,i);
}
const restored=new HoleCalibration(config);
assert(restored.restore(JSON.parse(JSON.stringify(c.snapshot()))));
assert(Math.abs(restored.holes[5].y-1.8)<1e-9);
assert(!new HoleCalibration({...config,width_m:2}).restore(c.snapshot()),'geometry changes invalidate calibration');
assert(!restored.restore({...c.snapshot(),radius:99}));
const malformed=JSON.parse(JSON.stringify(c.snapshot()));malformed.holes[0].x='0.6';
assert(!restored.restore(malformed));
const duplicate=JSON.parse(JSON.stringify(c.snapshot()));duplicate.holes[1]=duplicate.holes[0];
assert(!restored.restore(duplicate));
// Repeated HTTP responses do not count as new measurements, nor remain live forever.
const repeated=new HoleCalibration(config);repeated.observe(frame(1),0);repeated.start(0,0);
for(let t=3000;t<7000;t+=150)repeated.observe(frame(1),t);
assert.equal(repeated.capture.points.length,0);assert.equal(repeated.point(7000),null);
repeated.tick(23001);assert.equal(repeated.capture,null);assert.match(repeated.message,/timed out/);
for(const bad of [{held:true},{warning:true},{valid:false},{sensors_used:1},{age_ms:501},
  {raw_x_m:null},{raw_y_m:NaN},{frame_id:undefined},{raw_y_m:.5}]){
  const invalid=new HoleCalibration(config);invalid.observe(frame(1,.6,1.2,bad),0);invalid.start(0,0);
  assert.equal(invalid.capture,null,JSON.stringify(bad));
}
// No frames during countdown; invalid/held/new but unusable frames are skipped.
const skip=new HoleCalibration(config);skip.observe(frame(1),0);skip.start(0,0);
skip.observe(frame(2),2000);skip.observe(frame(3,.6,1.2,{held:true}),3100);
skip.observe(frame(4,.6,1.2,{valid:false}),3300);skip.observe(frame(5),3500);
assert.equal(skip.capture.points.length,1);skip.cancel();assert.equal(skip.capture,null);
// Interrupted capture leaves the prior saved centre intact.
capture(c,0,.61,1.2,200000,i=>i%2?.2:-.2);
assert.equal(c.holes[0].x,.6);assert.match(c.message,/moved too much/);
capture(c,1,.62,1.2,210000);
assert(Math.abs(c.holes[1].x-.9)<1e-9);assert.match(c.message,/Too close/);
capture(c,0,.6,1.2,220000,i=>i===3?.2:0);
assert.equal(c.holes[0].x,.6,'one outlier must not move the median');
c.observe(frame(3000),230000);c.start(0,230000);
c.observe(frame(1,.6,1.2,{boot_id:2}),233000);
assert.equal(c.capture,null);assert.match(c.message,/restarted/);assert.equal(c.holes[0].x,.6);
c.disconnect();assert.equal(c.match(233100).index,-1);
// Ambiguity and outside regions never guess a hole.
c.radius=.2;c.observe(frame(4000,.75,1.2),240000);
assert.equal(c.match(240000).index,-1);assert.match(c.match(240000).text,/ambiguous/);
c.observe(frame(4001,.1,1),240200);assert.equal(c.match(240200).index,-1);
c.clear();assert.equal(c.holes.filter(Boolean).length,0);
// Browser code is syntactically valid; calibration must not introduce API writes.
for(const script of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(script[1]);
assert(!/method\s*:\s*['"](?:POST|PUT|PATCH|DELETE)/i.test(html));
console.log('PASS: six saved targets, two/three sensors, countdown, unique frames, stale/held/invalid rejection, spread/outliers, conflicts, restart, storage validation and preview-only detection.');
