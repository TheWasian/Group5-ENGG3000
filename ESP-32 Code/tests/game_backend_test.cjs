const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ui = path.join(__dirname, '../../UI-Code');
function harness(modular = false) {
  const elements = new Map(), timers = new Map();
  let nextTimer = 1, data, time = 100, requests = 0;
  function element(id) {
    if (!elements.has(id)) {
      const classes = new Set();
      elements.set(id, {id, textContent:'', style:{}, dataset:{},
        classList:{add:(...vs)=>vs.forEach(v=>classes.add(v)),remove:(...vs)=>vs.forEach(v=>classes.delete(v)),
          contains:v=>classes.has(v),toggle:(v,on)=>on?classes.add(v):classes.delete(v)},
        addEventListener(){}, appendChild(child){child.parent=this;},removeAttribute(){},
        querySelector:s=>element(id+s),getBoundingClientRect(){return {};}});
    }
    return elements.get(id);
  }
  const holes = Array.from({length:6},(_,i)=>Object.assign(element('hole'+i),{dataset:{hole:String(i)}}));
  const sandbox = {
    document:{getElementById:element,querySelectorAll:s=>s==='.hole'?holes:[],addEventListener(){},body:element('body')},
    window:{location:{hostname:'localhost'},addEventListener(){}},performance:{now:()=>time},
    requestAnimationFrame(){},AbortController,console,
    fetch:async()=>{++requests;return {ok:true,json:async()=>data};},
    setInterval:()=>1,clearInterval(){},
    setTimeout:(fn,ms)=>{const id=nextTimer++;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id)
  };
  vm.createContext(sandbox);
  const run = code=>vm.runInContext(code,sandbox);
  const load = file=>run(fs.readFileSync(path.join(ui,'backend',file),'utf8').replace(/SensorService\.start\(\);\s*$/, ''));
  load('GameView.js');load('SensorService.js');
  if (modular) {
    for(const name of ['EnvironmentService','MoleService','StreakService','LevelingService','GameConditionService','HighScoreService','GameService'])load('services/'+name+'.js');
    load('main.js');
    run('GameService.game=GameService.newGame();GameService.game.playing=true;');
  } else load('gameLogic.js');
  return {run,sandbox,element,holes,timers,
    service:sandbox.SensorService,
    poll:async p=>{data=p;await sandbox.SensorService.check();},
    showMole:(hole=0)=>run(modular?`GameService.spawnMole('normal',${hole})`:
      `gameActive=true;activeHole=holes[${hole}];activeMoleType='normal';activeHole.classList.add('active')`),
    score:()=>run(modular?'GameService.game.score':'score'),
    advance:ms=>{time+=ms;},requests:()=>requests
  };
}
function payload(frame=1, mask=7) {
  const count=[0,1,2].filter(i=>mask&(1<<i)).length;
  return {source:'access_point',boot_id:3,frame_id:frame,event_id:1,current_hole:0,
    position:{valid:true,x_m:.6,y_m:1.167,warning:false,in_play_area:true,in_game_area:true,held:false,
      age_ms:10,sensors_used:count,sensors_used_mask:mask,reason:count===3?'three_ranges':'two_ranges'},
    game_area:{x_min_m:.45,x_max_m:1.05,start_y_m:1,end_y_m:2},
    sensors:[{valid:true,hole:0,distance_cm:117},{valid:false,hole:-1}],
    ranges_m:[1,.9,1.1].map((v,i)=>mask&(1<<i)?v:null),node_online:[true,true]};
}
(async()=>{
  const html=fs.readFileSync(path.join(ui,'index.html'),'utf8');
  assert(html.indexOf('backend/SensorService.js')<html.indexOf('backend/gameLogic.js') && html.includes('backend/SensorService.js'));
  const h=harness();let expected=0,frame=0;
  for(const mask of [7,3,5,6]){
    const p=payload(++frame,mask);h.showMole();await h.poll(p);expected+=50;
    assert.equal(h.score(),expected,'three sensors and each pair score through the current game');
    assert.equal(h.element('player-marker').parent,h.holes[0]);
    h.showMole();await h.poll(p);assert.equal(h.score(),expected,'a duplicate frame cannot score');
  }
  const fallback=payload(++frame,6);fallback.position.reason='two_ranges_fallback';fallback.ranges_m[0]=3;
  h.showMole();await h.poll(fallback);expected+=50;assert.equal(h.score(),expected,'background echo does not block selected pair');
  assert.match(h.element('debug-sensor-1').textContent,/Using AP \+ N2/);
  assert.match(h.holes[0].title,/60 cm.*117 cm/);
  const held=payload(++frame,3);held.position.held=true;h.showMole();await h.poll(held);
  assert.equal(h.score(),expected);assert(!h.element('player-marker').classList.contains('hidden'));
  for(const change of [p=>p.position.valid=false,p=>p.position.age_ms=501,p=>p.position.warning=true,
    p=>p.position.in_game_area=false,p=>p.position.in_play_area=false,p=>p.current_hole=null,
    p=>p.position.x_m=null,p=>p.current_hole=6,p=>p.position.sensors_used=1,p=>p.position.age_ms=-1]){
    const p=payload(++frame);change(p);h.showMole();await h.poll(p);
    assert.equal(h.score(),expected,'invalid AP data cannot fall back to lane zero');
    assert(h.element('player-marker').classList.contains('hidden'));
  }
  const warning=payload(++frame);warning.position.valid=false;warning.position.warning=true;
  await h.poll(warning);assert.match(h.element('sensor-status').textContent,/WARNING/);
  const restart=payload(1,5);restart.boot_id=4;h.showMole();await h.poll(restart);expected+=50;assert.equal(h.score(),expected);
  h.advance(501);h.service.expireDisplay();assert(h.element('player-marker').classList.contains('hidden'),'stale marker expires even with a hanging HTTP request');
  h.sandbox.fetch=(_,o)=>new Promise((resolve,reject)=>o.signal.addEventListener('abort',()=>reject(Error('timeout'))));
  const pending=h.service.check();assert.equal(h.service.busy,true);
  await h.service.check();assert.equal(h.service.busy,true,'overlapping poll does not start');
  const timeout=[...h.timers.values()].find(t=>t.ms===1200);assert(timeout);timeout.fn();await pending;
  assert.equal(h.service.busy,false);assert.match(h.element('sensor-status').textContent,/disconnected/);
  h.sandbox.fetch=async()=>({ok:true,json:async()=>restart});h.showMole();await h.service.check();
  assert.equal(h.score(),expected,'reconnect cannot replay last frame');
  h.sandbox.fetch=async()=>({ok:true,json:async()=>payload(2,3)});await h.service.check();expected+=50;assert.equal(h.score(),expected);
  const mvp={event_id:10,event_age_ms:0,hole:0,sensors:[{valid:true,hole:0,distance_cm:80}]};
  h.service.lastEventId=null;h.sandbox.fetch=async()=>({ok:true,json:async()=>mvp});h.showMole();await h.service.check();
  assert.equal(h.score(),expected);
  for(const change of [p=>p.event_age_ms=null,p=>p.hole=null,p=>p.event_age_ms=-1]){
    const invalid={...mvp,event_id:++mvp.event_id};change(invalid);
    h.sandbox.fetch=async()=>({ok:true,json:async()=>invalid});await h.service.check();assert.equal(h.score(),expected);
  }
  ++mvp.event_id;h.sandbox.fetch=async()=>({ok:true,json:async()=>mvp});await h.service.check();expected+=50;assert.equal(h.score(),expected);
  await h.service.notifyGameStart();assert.equal(h.service.lastFrame,'3:2','game start retains frame cursor');

  // Exercise the actual modular main.js -> GameService route as well.
  const m=harness(true);
  m.showMole();await m.poll(payload(1,5));assert.equal(m.score(),10);
  m.showMole();await m.poll(payload(1,5));assert.equal(m.score(),10);
  await m.poll(payload(2,3));assert.equal(m.score(),20,'stationary player hits a newly spawned mole');
  m.showMole(1);const streak=m.run('GameService.game.streak');await m.poll(payload(3,6));
  assert.equal(m.run('GameService.game.streak'),streak,'occupying another hole does not reset the modular game streak');
  assert.equal(m.score(),20);
  const modularHeld=payload(4,3);modularHeld.current_hole=1;modularHeld.position.held=true;
  await m.poll(modularHeld);assert.equal(m.score(),20);
  console.log('PASS: active website and modular backend, all sensor pairs, fresh-frame scoring, held/stale/null/warning rejection, restart, timeout/reconnect, target hints and MVP compatibility.');
})().catch(error=>{console.error(error);process.exitCode=1;});
