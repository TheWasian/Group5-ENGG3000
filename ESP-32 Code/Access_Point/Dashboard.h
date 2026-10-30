#pragma once
// Generated from cones.html by tools/embed_dashboard.py.
const char DASHBOARD_HTML[] PROGMEM = R"HTML(
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Whack-a-Mole · Controller</title>
<style>
:root{font:16px system-ui,sans-serif;color:#e7edf6;background:#0b1420;color-scheme:dark}
*{box-sizing:border-box}body{margin:0;padding:24px;max-width:1440px;margin-inline:auto}
header{display:flex;justify-content:space-between;align-items:center;gap:20px;margin-bottom:22px}
h1{font-size:26px;margin:0 0 6px}p{margin:6px 0;color:#aabace;line-height:1.5}
.badge{padding:9px 14px;border:1px solid #516580;border-radius:24px;white-space:nowrap;font-size:14px}
.layout{display:grid;grid-template-columns:minmax(0,1fr) 330px;gap:20px}
.panel{background:#121f30;border:1px solid #293d55;border-radius:12px;overflow:hidden}
.toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:15px 20px;border-bottom:1px solid #293d55}
label,select{font:14px system-ui}select{padding:8px;border-radius:6px;background:#182b40;border:1px solid #516580}
#map{display:block;width:100%;height:610px}.legend{display:flex;flex-wrap:wrap;gap:18px;padding:0 20px 18px;font-size:14px;color:#b6c6d9}
.legend span:before{content:'';display:inline-block;width:18px;height:3px;vertical-align:middle;margin-right:7px;background:var(--c)}
.sidebar{display:grid;gap:14px;align-content:start}.reading{padding:18px;border-left:3px solid var(--c)}
.reading h2{font-size:17px;margin:0;display:flex;justify-content:space-between;align-items:center}
.state{font-size:12px;font-weight:500;color:#aabace}.range{font:600 30px ui-monospace,monospace;margin:12px 0 5px}
.detail{font-size:14px;color:#aabace;line-height:1.6}.position{padding:18px}.position h2{font-size:16px;margin:0 0 8px}
.targets{grid-column:1/-1;padding:18px}.targets h2{font-size:16px;margin:0 0 8px}table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:5px 4px;border-bottom:1px solid #293d55}
#fix{font:500 21px ui-monospace,monospace;line-height:1.5}#warning{color:#ffb4ac;margin-top:8px;font-weight:600}
footer{margin-top:18px;max-width:1000px;font-size:14px;color:#9fafc3;line-height:1.6}
.calibration{grid-column:1/-1;padding:20px}.calibration h2{margin:0;font-size:20px}.calibration .intro{max-width:940px}
.cal-head,.cal-controls{display:flex;flex-wrap:wrap;align-items:center;gap:12px;justify-content:space-between}.cal-controls{justify-content:flex-start;margin-top:16px}
.cal-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:16px 0}
.cal-card{padding:14px;border:1px solid #3b526d;border-radius:9px;background:#0e1928}.cal-card.active{border-color:#c5adff;background:#28233f}.cal-card.matched{border-color:#45d9bb;background:#12372f}
.cal-card h3{font-size:16px;margin:0 0 8px}.cal-card p{font-size:13px;min-height:40px}.cal-card button{width:100%}
button{font:600 14px system-ui;color:#edf3ff;background:#294768;border:1px solid #6283a7;border-radius:6px;padding:9px 13px;cursor:pointer}button:hover:not(:disabled){background:#375b82}button:disabled{opacity:.45;cursor:not-allowed}button:focus-visible,select:focus-visible{outline:3px solid #c5adff;outline-offset:3px}
#cal-preview{font-size:20px;color:#8be8cf;font-weight:600;margin-top:14px}#cal-message{min-height:24px;color:#d6c8fa}#cal-storage{font-size:13px}.calibration progress{width:100%;height:12px;accent-color:#a88bec}
@media(max-width:850px){.cal-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:430px){.cal-grid{grid-template-columns:1fr}}
@media(max-width:850px){body{padding:14px}.layout{grid-template-columns:1fr}.sidebar{grid-template-columns:repeat(3,minmax(0,1fr))}.position{grid-column:1/-1}#map{height:520px}.range{font-size:24px}}
@media(max-width:560px){header{align-items:flex-start;flex-direction:column}.sidebar{grid-template-columns:1fr}.position{grid-column:auto}.toolbar{align-items:flex-start;flex-direction:column}#map{height:470px}}
</style>
</head><body>
<header><div><h1>Whack-a-Mole controller</h1><p>Live sensor cones, player tracking and game targets</p></div><span id="connection" class="badge" role="status">Connecting to controller…</span></header>
<main class="layout">
<section class="panel calibration" aria-labelledby="cal-heading">
<div class="cal-head"><h2 id="cal-heading">Stand here to calibrate a hole</h2><span class="badge">Cone-page test only</span></div>
<p class="intro">Choose where each hole should be on the floor. Stand there, press its Calibrate button, then stay still through the 3-second countdown and capture. We collect at least 15 fresh positions, usually in another 3–5 seconds. Ask someone to press the button if needed.</p>
<p class="detail">Use six distinct spots outside the red dead zone. Saved centres are sensor estimates, not surveyed floor coordinates. This preview does not change the game, sensor settings or ESP32 hit events.</p>
<div id="cal-holes" class="cal-grid"></div>
<progress id="cal-progress" max="15" value="0" aria-label="Fresh calibration positions collected"></progress>
<p id="cal-message" role="status" aria-live="polite">Waiting for the controller.</p>
<div class="cal-controls"><label>Test hit radius <select id="cal-radius"><option value="0.10">10 cm</option><option value="0.15" selected>15 cm</option><option value="0.20">20 cm</option></select></label><button id="cal-cancel" disabled>Cancel capture</button><button id="cal-clear" disabled>Clear saved holes</button></div>
<p id="cal-preview" role="status" aria-live="polite">Calibrate a hole to test detection.</p>
<p id="cal-storage">Saved only in this browser on this page address; nothing is written to the ESP32.</p>
</section>
<section class="panel" aria-label="Top-down sensor coverage">
<div class="toolbar"><strong>Top-down view · metres</strong><label>View <select id="extent"><option value="play">Playing area</option><option value="full">Full sensor range</option></select></label></div>
<canvas id="map" aria-label="Sensor cones, measured echo arcs and estimated player position"></canvas>
<div class="legend"><span style="--c:#579ce8">Node 1</span><span style="--c:#45d9bb">Access Point</span><span style="--c:#eca85a">Node 2</span><span style="--c:#fff">Player estimate</span></div>
</section>
<aside class="sidebar">
<section class="panel reading" style="--c:#579ce8"><h2>Node 1 <span id="state0" class="state">Waiting</span></h2><div id="range0" class="range">—</div><div id="detail0" class="detail">Left sensor</div></section>
<section class="panel reading" style="--c:#45d9bb"><h2>Access Point <span id="state1" class="state">Waiting</span></h2><div id="range1" class="range">—</div><div id="detail1" class="detail">Centre sensor</div></section>
<section class="panel reading" style="--c:#eca85a"><h2>Node 2 <span id="state2" class="state">Waiting</span></h2><div id="range2" class="range">—</div><div id="detail2" class="detail">Right sensor</div></section>
<section class="panel position"><h2>Player position</h2><div id="fix">Waiting for data</div><p id="quality" class="detail"></p><div id="warning" role="alert"></div></section>
<section class="panel targets"><h2>Where to stand</h2><p class="detail">Target centres in cm. Left/right is relative to the centre sensor, facing the screen.</p><table><thead><tr><th>Hole</th><th>Side</th><th>From screen</th></tr></thead><tbody id="targets"></tbody></table></section>
</aside>
</main>
<footer>The six outlined zones are the game targets; stand near their marked centres. A solid white dot is the smoothed position, a hollow dot is the latest unsmoothed estimate, and an amber dot is a briefly held position that cannot score. Cones model the configured beam: an echo has no measured angle or identity, and may come from a different part of your body or the room. The model uncertainty is not a measured accuracy guarantee. Run the game website on your PC while connected to this same Access Point.</footer>
<script id="hole-calibration-model">
// Browser-only experiment. No API writes and no changes to the game's hit map.
class HoleCalibration {
 static signature(c) {
  return JSON.stringify([c.width_m,c.depth_m,c.play_start_y_m,c.game_area,
   c.sensors.map(s=>[s.x_m,s.y_m,s.bearing_deg,s.half_angle_deg,s.max_range_m,s.face_setback_m??0])]);
 }
 constructor(c) {
  this.config=c;this.signature=HoleCalibration.signature(c);this.holes=Array(6).fill(null);this.radius=.15;
  this.capture=null;this.sample=null;this.key=null;this.frameAt=-Infinity;this.receivedAt=-Infinity;
  this.message='Stand at a chosen floor spot, then calibrate its hole.';this.revision=0;
 }
 inArea(x,y) {return Number.isFinite(x)&&Number.isFinite(y)&&x>=0&&x<=this.config.width_m&&y>this.config.play_start_y_m&&y<=this.config.play_start_y_m+this.config.depth_m;}
 restore(saved) {
  if(!saved||saved.version!==1||saved.signature!==this.signature) return false;
  if(!Array.isArray(saved.holes)||saved.holes.length!==6||![.10,.15,.20].includes(saved.radius)) return false;
  if(!saved.holes.every(h=>h===null||(h&&this.inArea(h.x,h.y)&&Number.isInteger(h.count)&&h.count>=15&&Number.isFinite(h.spread)&&h.spread>=0&&h.spread<=.10))) return false;
  for(let i=0;i<6;i++)for(let j=i+1;j<6;j++)if(saved.holes[i]&&saved.holes[j]&&Math.hypot(saved.holes[i].x-saved.holes[j].x,saved.holes[i].y-saved.holes[j].y)<.15)return false;
  this.holes=saved.holes.map(h=>h?{x:h.x,y:h.y,count:h.count,spread:h.spread}:null);this.radius=saved.radius;return true;
 }
 snapshot(){return {version:1,signature:this.signature,radius:this.radius,holes:this.holes};}
 point(now) {
  const p=this.sample,stale=this.config.stale_ms||500;
  if(!p||p.valid!==true||p.held||p.warning||![2,3].includes(p.sensors_used)||
   !Number.isInteger(p.boot_id)||!Number.isInteger(p.frame_id)||!Number.isFinite(p.age_ms)||p.age_ms<0||
   p.age_ms+now-this.receivedAt>stale||now-this.frameAt>stale||!this.inArea(p.raw_x_m,p.raw_y_m))return null;
  return {x:p.raw_x_m,y:p.raw_y_m};
 }
 disconnect(){this.sample=null;}
 start(index,now) {
  if(this.capture||!Number.isInteger(index)||index<0||index>5)return;
  if(!this.point(now)){this.message='No fresh usable position. Check the sensor diagnostics below before capturing.';return;}
  this.capture={index,start:now+3000,deadline:now+23000,points:[],firstAt:null,boot:this.sample.boot_id};
 }
 cancel(message='Capture cancelled. Previously saved holes are unchanged.') {this.capture=null;this.message=message;}
 clear(){this.capture=null;this.holes=Array(6).fill(null);this.revision++;this.message='Saved holes cleared. Choose new floor positions to calibrate.';}
 tick(now){if(this.capture&&now>=this.capture.deadline)this.cancel('Capture timed out: not enough fresh, usable positions. Previous calibration kept. Check coverage and try again.');}
 observe(p,now) {
  this.tick(now);
  if(this.capture&&p.boot_id!==this.capture.boot)this.cancel('Controller restarted. Capture cancelled; previous calibration kept.');
  this.sample=p;this.receivedAt=now;
  const key=String(p.boot_id)+':'+String(p.frame_id),changed=key!==this.key;
  if(changed){this.key=key;this.frameAt=now;}
  const cap=this.capture,point=this.point(now);
  if(!cap||now<cap.start||!changed||!point)return;
  if(cap.firstAt===null)cap.firstAt=now;
  cap.points.push(point);
  if(cap.points.length>=15&&now-cap.firstAt>=2500)this.finish();
 }
 finish() {
  const cap=this.capture,points=cap.points;
  // Coordinate medians resist occasional outliers; no historical mode/held points are captured.
  const median=values=>{values.sort((a,b)=>a-b);const m=Math.floor(values.length/2);return values.length%2?values[m]:(values[m-1]+values[m])/2;};
  const x=median(points.map(p=>p.x)),y=median(points.map(p=>p.y));
  const distances=points.map(p=>Math.hypot(p.x-x,p.y-y)).sort((a,b)=>a-b);
  const spread=distances[Math.ceil(points.length*.9)-1];
  if(spread>.10){this.cancel('Position moved too much (90% spread '+Math.round(spread*100)+' cm; maximum 10 cm). Stay still and retry. Previous calibration kept.');return;}
  const other=this.holes.findIndex((h,i)=>i!==cap.index&&h&&Math.hypot(h.x-x,h.y-y)<.15);
  if(other>=0){this.cancel('Too close to saved hole '+(other+1)+'. Choose a different floor spot (centres must be at least 15 cm apart). Previous calibration kept.');return;}
  this.holes[cap.index]={x,y,count:points.length,spread};this.revision++;
  this.cancel('Hole '+(cap.index+1)+' captured. Walk away and return to test it below.');
 }
 match(now) {
  if(this.capture)return {index:-1,text:'Capture in progress · test paused'};
  if(!this.holes.some(Boolean))return {index:-1,text:'Calibrate a hole to test detection.'};
  const p=this.point(now);
  if(!p)return {index:-1,text:'No fresh usable position · no test hit'};
  const candidates=this.holes.map((h,index)=>h?{index,d:Math.hypot(h.x-p.x,h.y-p.y)}:null).filter(Boolean).sort((a,b)=>a.d-b.d);
  if(candidates[0].d>this.radius)return {index:-1,text:'Outside saved targets · no test hit'};
  if(candidates[1]&&(candidates[1].d<=this.radius||candidates[1].d-candidates[0].d<.04))return {index:-1,text:'Between saved targets · ambiguous, no test hit'};
  return {index:candidates[0].index,text:'🔨 Test hole '+(candidates[0].index+1)+' · '+Math.round(candidates[0].d*100)+' cm from saved centre'};
 }
}
</script>
<script>
'use strict';
const $ = id => document.getElementById(id);
const API = location.hostname === '192.168.4.1' ? '' : 'http://192.168.4.1';
const colours = ['#579ce8','#45d9bb','#eca85a'];
const canvas = $('map'), ctx = canvas.getContext('2d');
let config = null, sample = null, receivedAt = 0, connected = false, lastBoot = null;
let calibration=null, savedRevision=0, storageNotice='';
const CAL_STORAGE_KEY='wam-cone-hole-calibration-v1:'+API;
function initCalibration(){
 calibration=new HoleCalibration(config);savedRevision=0;
 try{const text=localStorage.getItem(CAL_STORAGE_KEY);if(text&&!calibration.restore(JSON.parse(text)))calibration.message='Saved calibration does not match this geometry or is invalid. Calibrate the holes again.';}
 catch(e){storageNotice='Browser storage unavailable or unreadable. Captures work for this page session; they may not survive a reload.';}
 $('cal-radius').value=String(calibration.radius);$('cal-holes').replaceChildren();
 const names=['Near left','Near right','Middle left','Middle right','Far left','Far right'];
 names.forEach((name,i)=>{const card=document.createElement('div');card.className='cal-card';card.id='cal-card'+i;
  const title=document.createElement('h3');title.textContent='Hole '+(i+1)+' · '+name;
  const detail=document.createElement('p');detail.id='cal-detail'+i;
  const button=document.createElement('button');button.id='cal-start'+i;button.textContent='Calibrate hole '+(i+1);
  button.addEventListener('click',()=>{calibration.start(i,performance.now());render();});card.append(title,detail,button);$('cal-holes').append(card);
 });
}
function saveCalibration(){
 if(!calibration||savedRevision===calibration.revision)return;
 savedRevision=calibration.revision;
 try{localStorage.setItem(CAL_STORAGE_KEY,JSON.stringify(calibration.snapshot()));storageNotice='';}
 catch(e){storageNotice='Could not save in this browser. Captures are available only until this page closes.';}
}
function renderCalibration(){
 if(!calibration)return;
 const now=performance.now();calibration.tick(now);saveCalibration();
 const cap=calibration.capture,match=calibration.match(now),ready=!!calibration.point(now);
 for(let i=0;i<6;i++){
  const h=calibration.holes[i];$('cal-card'+i).className='cal-card'+(cap?.index===i?' active':'')+(match.index===i?' matched':'');
  $('cal-detail'+i).textContent=h?`Saved estimate: x ${(h.x*100).toFixed(1)} cm, y ${(h.y*100).toFixed(1)} cm · spread ${(h.spread*100).toFixed(1)} cm`:'Not calibrated · choose this hole’s floor spot.';
  $('cal-start'+i).disabled=!!cap||!ready;$('cal-start'+i).textContent=(h?'Recalibrate':'Calibrate')+' hole '+(i+1);
 }
 $('cal-progress').value=cap?Math.min(15,cap.points.length):0;
 $('cal-message').textContent=cap?(now<cap.start?`Hole ${cap.index+1}: stay still · starting in ${Math.ceil((cap.start-now)/1000)}…`:`Hole ${cap.index+1}: ${cap.points.length}/15 fresh positions · ${ready?'keep still':'waiting for a usable position'} · ${Math.max(0,Math.ceil((cap.deadline-now)/1000))} s remaining`):calibration.message;
 $('cal-cancel').disabled=!cap;$('cal-clear').disabled=!!cap||!calibration.holes.some(Boolean);$('cal-radius').disabled=!!cap;
 $('cal-preview').textContent=match.text;
 $('cal-storage').textContent=storageNotice||`${calibration.holes.filter(Boolean).length}/6 holes saved in this browser on this page address. Nothing is written to the ESP32 or game. Recalibrate after moving sensors or changing range settings.`;
}
function metric(v){return typeof v === 'number' && Number.isFinite(v);}
function live(){return connected && sample && performance.now()-receivedAt <= (config?.stale_ms || 500);}
function pointInCone(x,y,s){const dx=x-s.x_m,dy=y-s.y_m,r=Math.hypot(dx,dy),a=s.bearing_deg*Math.PI/180;return r>=.02&&r<=s.max_range_m&&(dx*Math.sin(a)+dy*Math.cos(a))/r>=Math.cos(s.half_angle_deg*Math.PI/180);}
function draw(){
 const rect=canvas.getBoundingClientRect(),dpr=window.devicePixelRatio||1;
 if(canvas.width!==Math.round(rect.width*dpr)||canvas.height!==Math.round(rect.height*dpr)){canvas.width=Math.round(rect.width*dpr);canvas.height=Math.round(rect.height*dpr);}
 ctx.setTransform(dpr,0,0,dpr,0,0);const w=rect.width,h=rect.height;ctx.clearRect(0,0,w,h);
 if(!config){ctx.fillStyle='#aabace';ctx.font='16px system-ui';ctx.fillText('Waiting for sensor geometry…',24,45);return;}
 const maxY=$('extent').value==='full'?Math.max(...config.sensors.map(s=>s.y_m+s.max_range_m)):config.play_start_y_m+config.depth_m+.15;
 const spanX=$('extent').value==='full'?Math.max(config.width_m, maxY*1.2):config.width_m+.7;
 const scale=Math.min((w-70)/spanX,(h-100)/maxY),ox=w/2-config.width_m*scale/2,oy=55;
 const X=x=>ox+x*scale,Y=y=>oy+y*scale, end=config.play_start_y_m+config.depth_m;
 ctx.fillStyle='#4f3038';ctx.fillRect(X(0),Y(0),config.width_m*scale,config.play_start_y_m*scale);
 ctx.fillStyle='#192b40';ctx.fillRect(X(0),Y(config.play_start_y_m),config.width_m*scale,config.depth_m*scale);
 // Show only the coverage actually predicted by the calibrated cone model.
 for(let x=0;x<config.width_m;x+=.025)for(let y=config.play_start_y_m;y<end;y+=.025){
  const n=config.sensors.filter(s=>pointInCone(x+.0125,y+.0125,s)).length;
  if(n>=2){ctx.fillStyle=n===3?'#235646':'#273f53';ctx.fillRect(X(x),Y(y),.026*scale,.026*scale);}
 }
 const g=config.game_area,gw=g.x_max_m-g.x_min_m,gd=g.end_y_m-g.start_y_m;
 ctx.strokeStyle='#b1c4d9';ctx.lineWidth=1;ctx.setLineDash([4,5]);
 for(let r=0;r<=3;r++){const y=g.start_y_m+r*gd/3;ctx.beginPath();ctx.moveTo(X(g.x_min_m),Y(y));ctx.lineTo(X(g.x_max_m),Y(y));ctx.stroke();}
 for(let c=0;c<=2;c++){const x=g.x_min_m+c*gw/2;ctx.beginPath();ctx.moveTo(X(x),Y(g.start_y_m));ctx.lineTo(X(x),Y(g.end_y_m));ctx.stroke();}ctx.setLineDash([]);
 ctx.font='13px system-ui';ctx.fillStyle='#e1eaf4';ctx.textAlign='center';
 for(let r=0;r<3;r++)for(let c=0;c<2;c++){
  const x=X(g.x_min_m+(c+.5)*gw/2),y=Y(g.start_y_m+(r+.5)*gd/3);
  ctx.beginPath();ctx.arc(x,y,3,0,2*Math.PI);ctx.fill();ctx.fillText('Hole '+(r*2+c+1),x,y-10);
 }
 const current=live();
 config.sensors.forEach((s,i)=>{
  const a=(90-s.bearing_deg-s.half_angle_deg)*Math.PI/180,b=(90-s.bearing_deg+s.half_angle_deg)*Math.PI/180;
  const r=Math.min(s.max_range_m,maxY-s.y_m+.1),status=current?sample.sensor_status?.[i]:null;
  ctx.save();ctx.beginPath();ctx.rect(0,Y(0),w,h-Y(0)-22);ctx.clip();
  ctx.beginPath();ctx.moveTo(X(s.x_m),Y(s.y_m));ctx.arc(X(s.x_m),Y(s.y_m),r*scale,a,b);ctx.closePath();
  ctx.fillStyle=colours[i]+(status?.player_in_cone?'36':'13');ctx.fill();ctx.strokeStyle=colours[i]+'80';ctx.lineWidth=1;ctx.stroke();
  for(let d=.5;d<=r;d+=.5){ctx.beginPath();ctx.arc(X(s.x_m),Y(s.y_m),d*scale,a,b);ctx.stroke();}
  if(status?.echo&&metric(status.range_m)){ctx.strokeStyle=colours[i]+(status.excluded_from_position?'70':'');ctx.lineWidth=4;if(status.excluded_from_position)ctx.setLineDash([5,5]);ctx.beginPath();ctx.arc(X(s.x_m),Y(s.y_m),status.range_m*scale,a,b);ctx.stroke();}
  ctx.restore();
  ctx.fillStyle=colours[i];ctx.beginPath();ctx.arc(X(s.x_m),Y(s.y_m),6,0,2*Math.PI);ctx.fill();
  const labelX=[X(0)-8,X(config.width_m/2),X(config.width_m)+8][i], labelY=Y(s.y_m)-22;
  ctx.strokeStyle=colours[i];ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(X(s.x_m),Y(s.y_m)-8);ctx.lineTo(labelX,labelY+5);ctx.stroke();
  ctx.font='bold 14px system-ui';ctx.textAlign=['right','center','left'][i];ctx.fillText(s.name,labelX,labelY);
 });
 ctx.textAlign='center';ctx.strokeStyle='#d2dce9';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(X(0),Y(0));ctx.lineTo(X(config.width_m),Y(0));ctx.stroke();
 ctx.fillStyle='#d2dce9';ctx.font='14px system-ui';ctx.fillText('SCREEN · y = 0',w/2,25);
 ctx.fillStyle='#eab4b7';ctx.font='13px system-ui';ctx.fillText('Dead zone · '+config.play_start_y_m.toFixed(2)+' m',w/2,Y(config.play_start_y_m)-7);
 ctx.textAlign='right';ctx.fillStyle='#90a8c2';for(let y=.5;y<=maxY;y+=.5)ctx.fillText(y.toFixed(1),X(0)-12,Y(y)+4);
 if(current&&metric(sample.raw_x_m)&&metric(sample.raw_y_m)){
  ctx.strokeStyle='#ffffff90';ctx.lineWidth=1;ctx.beginPath();ctx.arc(X(sample.raw_x_m),Y(sample.raw_y_m),6,0,2*Math.PI);ctx.stroke();
 }
 if(current&&sample.valid&&metric(sample.x_m)&&metric(sample.y_m)){
  const x=X(sample.x_m),y=Y(sample.y_m);ctx.fillStyle=sample.held?'#ffd080':'#fff';ctx.strokeStyle='#0b1420';ctx.lineWidth=3;
  ctx.beginPath();ctx.arc(x,y,9,0,2*Math.PI);ctx.fill();ctx.stroke();ctx.textAlign='center';ctx.font='bold 14px system-ui';ctx.fillText(sample.held?'Held · no hit':'Player',x,y-18);
 }
 ctx.textAlign='center';ctx.fillStyle='#aabace';ctx.font='13px system-ui';ctx.fillText('Player’s left ← x → Player’s right',w/2,h-13);
 if(calibration){
  const match=calibration.match(performance.now());
  calibration.holes.forEach((p,i)=>{if(!p)return;const x=X(p.x),y=Y(p.y);
   ctx.strokeStyle=match.index===i?'#45d9bb':'#c5adff';ctx.fillStyle=match.index===i?'#45d9bb25':'#c5adff10';ctx.lineWidth=2;ctx.setLineDash([5,3]);
   ctx.beginPath();ctx.arc(x,y,calibration.radius*scale,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.setLineDash([]);
   ctx.fillStyle=ctx.strokeStyle;ctx.font='bold 13px system-ui';ctx.textAlign='center';ctx.fillText('Test '+(i+1),x,y+20);
  });
 }
}
function render(){
 const current=live();$('connection').textContent=current?'Receiving live measurements':connected?'Waiting for fresh measurements':'Controller disconnected';
 for(let i=0;i<3;i++){
  const s=current?sample.sensor_status?.[i]:null,c=config?.sensors[i];
  $('state'+i).textContent=!current?'No live data':!s?.online?'Offline':s?.rejected?'Spike rejected':s?.used_for_position?'Used for position':s?.excluded_from_position?'Echo excluded':s?.player_in_cone?'Position in cone':s?.echo?'Echo detected':'No echo';
  $('range'+i).textContent=s?.echo&&metric(s.range_m)?s.range_m.toFixed(2)+' m':'—';
  $('detail'+i).textContent=c?`Aim ${c.bearing_deg.toFixed(1)}° · cone ±${c.half_angle_deg.toFixed(0)}° · max ${c.max_range_m.toFixed(1)} m`:'Waiting for geometry';
  if(s?.rejected&&metric(s.raw_m))$('detail'+i).textContent+=` · ignored echo ${s.raw_m.toFixed(2)} m`;
 }
 $('fix').textContent=current&&sample.valid&&metric(sample.x_m)&&metric(sample.y_m)?`${sample.x_m.toFixed(2)}, ${sample.y_m.toFixed(2)} m`:'No player position';
 const reasons={insufficient_ranges:'At least two echoes needed',outside_cones_or_area:'Ranges do not identify a point in the configured cones and area',inconsistent_ranges:'Echo distances disagree',ambiguous:'Two possible positions',ambiguous_pairs:'Different sensor pairs suggest different positions',weak_geometry:'Poor sensor geometry',frame_too_slow:'Measurements too far apart in time',stale:'Measurements expired',range_spike:'Sudden echo change rejected',confirming_movement:'Confirming a sudden position change'};
 $('quality').textContent=!current?'Live detections are hidden until fresh data arrives.':sample.held?'Held · no scoring · '+(reasons[sample.reason]||sample.reason):sample.valid?sample.sensors_used===2?'Two-range estimate · no third-sensor cross-check':`Three-range fit · residual ${metric(sample.rms_error_m)?(sample.rms_error_m*100).toFixed(1):'—'} cm`:reasons[sample.reason]||sample.reason;
 if(current&&sample.valid&&!sample.held&&sample.reason==='two_ranges_fallback')$('quality').textContent='Two-sensor tracking · conflicting third echo excluded';
 if(current&&sample.valid&&!sample.held&&sample.reason==='two_ranges_timing')$('quality').textContent='Two-sensor tracking · older third reading excluded';
 if(current&&sample.valid&&Number.isInteger(sample.sensors_used_mask))$('quality').textContent+=' · '+config.sensors.filter((s,i)=>sample.sensors_used_mask&(1<<i)).map(s=>s.name).join(' + ');
 if(current&&sample.valid&&metric(sample.uncertainty_m))$('quality').textContent+=` · model uncertainty ${(sample.uncertainty_m*100).toFixed(1)} cm`;
 $('warning').textContent=current&&sample.warning?'Move away from the screen.':'';renderCalibration();draw();
}
async function getJson(path){const c=new AbortController(),t=setTimeout(()=>c.abort(),1200);try{const r=await fetch(API+path,{cache:'no-store',signal:c.signal});if(!r.ok)throw Error('HTTP '+r.status);return await r.json();}finally{clearTimeout(t);}}
function showTargets(){
 const g=config.game_area,ap=config.sensors[1];$('targets').replaceChildren();
 for(let r=0;r<3;r++)for(let c=0;c<2;c++){
  const x=g.x_min_m+(c+.5)*(g.x_max_m-g.x_min_m)/2,y=g.start_y_m+(r+.5)*(g.end_y_m-g.start_y_m)/3;
  const row=document.createElement('tr');
  for(const value of [r*2+c+1,`${Math.round(Math.abs(x-ap.x_m)*100)} ${x<ap.x_m?'left':'right'}`,Math.round(y*100)]){const cell=document.createElement('td');cell.textContent=value;row.append(cell);}
  $('targets').append(row);
 }
}
async function update(){try{
 if(!config){config=await getJson('/api/config');if(!Array.isArray(config.sensors)||config.sensors.length!==3||!config.game_area){config=null;throw Error('Invalid geometry');}showTargets();initCalibration();}
 const p=await getJson('/api/position');if(!Array.isArray(p.sensor_status)||p.sensor_status.length!==3||typeof p.valid!=='boolean')throw Error('Invalid position data');
 if(lastBoot!==null&&p.boot_id!==lastBoot){calibration?.cancel('Controller restarted. Capture cancelled; geometry will be reloaded.');calibration?.disconnect();lastBoot=null;config=null;sample=null;connected=false;return;}
 lastBoot=p.boot_id;sample=p;receivedAt=performance.now();connected=true;calibration.observe(p,receivedAt);
}catch(e){connected=false;sample=null;calibration?.disconnect();}finally{render();setTimeout(update,150);}}
$('cal-cancel').addEventListener('click',()=>{calibration?.cancel();render();});
$('cal-clear').addEventListener('click',()=>{calibration?.clear();render();});
$('cal-radius').addEventListener('change',()=>{if(calibration){calibration.radius=Number($('cal-radius').value);calibration.revision++;render();}});
$('extent').addEventListener('change',draw);window.addEventListener('resize',draw);setInterval(render,200);draw();update();
</script></body></html>

)HTML";
