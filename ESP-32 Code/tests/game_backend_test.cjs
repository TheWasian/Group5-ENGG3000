const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const elements = new Map();
function element(id) {
  if (!elements.has(id)) {
    const classes = new Set();
    elements.set(id, {id, textContent:'', style:{}, dataset:{},
      classList:{add:v=>classes.add(v),remove:v=>classes.delete(v),contains:v=>classes.has(v),
        toggle:(v,on)=>on?classes.add(v):classes.delete(v)},
      addEventListener(){}, appendChild(child){child.parent=this;}, removeAttribute(){}, getBoundingClientRect(){return {};}});
  }
  return elements.get(id);
}
const holes = Array.from({length:6},(_,i)=>Object.assign(element('hole'+i),{dataset:{hole:String(i)}}));
const timers = new Map();let nextTimer=1;
let responseData;
const sandbox = {
  document:{getElementById:element,querySelectorAll:s=>s==='.hole'?holes:[]},
  window:{location:{hostname:'localhost'}},AbortController,console,
  fetch:async()=>({ok:true,json:async()=>responseData}),
  setInterval:()=>1,clearInterval(){},
  setTimeout:(fn,ms)=>{const id=nextTimer++;timers.set(id,{fn,ms});return id;},
  clearTimeout:id=>timers.delete(id)
};
vm.createContext(sandbox);
const source=fs.readFileSync(path.join(__dirname,'../../UI-Code/backend/gameLogic.js'),'utf8').replace(/startSensorPolling\(\);\s*$/, '');
vm.runInContext(source,sandbox);
const run=code=>vm.runInContext(code,sandbox);
function payload(frame=1){return {source:'access_point',boot_id:3,frame_id:frame,event_id:1,current_hole:0,
  position:{valid:true,x_m:.6,y_m:1.167,warning:false,in_play_area:true,in_game_area:true,held:false,age_ms:10,sensors_used:3,reason:'three_ranges'},
  game_area:{x_min_m:.45,x_max_m:1.05,start_y_m:1,end_y_m:2},
  sensors:[{valid:true,hole:0,distance_cm:85},{valid:false,hole:-1}],ranges_m:[.6,.55,.7],node_online:[true,true]};}
function showMole(){run('gameActive=true; activeHole=holes[0]; activeHole.classList.add("active")');}
async function poll(data){responseData=data;await run('pollSensors()');}
(async()=>{
  showMole(); await poll(payload());assert.equal(run('score'),50,'first fresh frame scores occupancy');
  assert.equal(element('player-marker').parent,holes[0]);
  showMole();await poll(payload());assert.equal(run('score'),50,'duplicate frame cannot score');
  await poll(payload(2));assert.equal(run('score'),100,'new frame hits a newly spawned mole');
  const held=payload(3);held.position.held=true;showMole();await poll(held);
  assert.equal(run('score'),100,'a new held frame cannot score');
  assert(!element('player-marker').classList.contains('hidden'),'held position remains visible');
  assert.match(element('sensor-status').textContent,/held/);
  assert.match(holes[0].title,/60 cm.*117 cm/,'target hint uses physical game rectangle');
  for(const change of [p=>p.position.valid=false,p=>p.position.age_ms=501,p=>p.position.warning=true,
    p=>p.position.in_play_area=false,p=>p.position.in_game_area=false,p=>p.current_hole=null,p=>p.position.x_m=null,p=>p.current_hole=6]){
    const p=payload(nextTimer+10);change(p);showMole();await poll(p);
    assert.equal(run('score'),100,'invalid AP fix cannot fall back to a legacy lane');
    assert(element('player-marker').classList.contains('hidden'));
  }
  const warning=payload(100);warning.position.valid=false;warning.position.warning=true;
  await poll(warning);assert.match(element('sensor-status').textContent,/WARNING/,'warning survives invalid positioning');
  assert.match(element('debug-sensor-2').textContent,/N1 0.60 m.*AP 0.55 m.*N2 0.70 m/);
  const reboot=payload(1);reboot.boot_id=4;showMole();await poll(reboot);assert.equal(run('score'),150);
  sandbox.fetch=(_,options)=>new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(Error('timeout'))));
  const hanging=run('pollSensors()');
  const timeout=[...timers.values()].find(t=>t.ms===1200);assert(timeout);timeout.fn();await hanging;
  assert.equal(run('sensorRequestInProgress'),false);assert.match(element('sensor-status').textContent,/disconnected/);
  sandbox.fetch=async()=>({ok:true,json:async()=>responseData});
  await poll(payload(3));assert.equal(run('sensorRequestInProgress'),false,'poll recovers after network timeout');
  // Original MVP event protocol remains usable, and null event fields cannot hit hole zero.
  showMole();const mvp={event_id:10,event_age_ms:0,hole:0,sensors:[{valid:true,hole:0,distance_cm:80}]};
  run('lastSensorEventId=null');await poll(mvp);assert.equal(run('score'),150);
  await poll({...mvp,event_id:11,event_age_ms:null,hole:null});assert.equal(run('score'),150);
  await poll({...mvp,event_id:12});assert.equal(run('score'),200);
  console.log('PASS: fresh-frame scoring, stale/invalid/dead-zone suppression, restart, timeout recovery, diagnostics and MVP compatibility.');
})().catch(error=>{console.error(error);process.exitCode=1;});
