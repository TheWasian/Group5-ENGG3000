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
@media(max-width:850px){body{padding:14px}.layout{grid-template-columns:1fr}.sidebar{grid-template-columns:repeat(3,minmax(0,1fr))}.position{grid-column:1/-1}#map{height:520px}.range{font-size:24px}}
@media(max-width:560px){header{align-items:flex-start;flex-direction:column}.sidebar{grid-template-columns:1fr}.position{grid-column:auto}.toolbar{align-items:flex-start;flex-direction:column}#map{height:470px}}
</style>
</head><body>
<header><div><h1>Whack-a-Mole controller</h1><p>Live sensor cones, player tracking and game targets</p></div><span id="connection" class="badge" role="status">Connecting to controller…</span></header>
<main class="layout">
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
<script>
'use strict';
const $ = id => document.getElementById(id);
const API = location.hostname === '192.168.4.1' ? '' : 'http://192.168.4.1';
const colours = ['#579ce8','#45d9bb','#eca85a'];
const canvas = $('map'), ctx = canvas.getContext('2d');
let config = null, sample = null, receivedAt = 0, connected = false, lastBoot = null;
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
  if(status?.echo&&metric(status.range_m)){ctx.strokeStyle=colours[i];ctx.lineWidth=4;ctx.beginPath();ctx.arc(X(s.x_m),Y(s.y_m),status.range_m*scale,a,b);ctx.stroke();}
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
}
function render(){
 const current=live();$('connection').textContent=current?'Receiving live measurements':connected?'Waiting for fresh measurements':'Controller disconnected';
 for(let i=0;i<3;i++){
  const s=current?sample.sensor_status?.[i]:null,c=config?.sensors[i];
  $('state'+i).textContent=!current?'No live data':!s?.online?'Offline':s?.rejected?'Spike rejected':s?.player_in_cone?'Position in cone':s?.echo?'Echo detected':'No echo';
  $('range'+i).textContent=s?.echo&&metric(s.range_m)?s.range_m.toFixed(2)+' m':'—';
  $('detail'+i).textContent=c?`Aim ${c.bearing_deg.toFixed(1)}° · cone ±${c.half_angle_deg.toFixed(0)}° · max ${c.max_range_m.toFixed(1)} m`:'Waiting for geometry';
  if(s?.rejected&&metric(s.raw_m))$('detail'+i).textContent+=` · ignored echo ${s.raw_m.toFixed(2)} m`;
 }
 $('fix').textContent=current&&sample.valid&&metric(sample.x_m)&&metric(sample.y_m)?`${sample.x_m.toFixed(2)}, ${sample.y_m.toFixed(2)} m`:'No player position';
 const reasons={insufficient_ranges:'At least two echoes needed',outside_cones_or_area:'Ranges do not identify a point in the configured cones and area',inconsistent_ranges:'Echo distances disagree',ambiguous:'Two possible positions',weak_geometry:'Poor sensor geometry',frame_too_slow:'Measurements too far apart in time',stale:'Measurements expired',range_spike:'Sudden echo change rejected',confirming_movement:'Confirming a sudden position change'};
 $('quality').textContent=!current?'Live detections are hidden until fresh data arrives.':sample.held?'Held · no scoring · '+(reasons[sample.reason]||sample.reason):sample.valid?sample.sensors_used===2?'Two-range estimate · no third-sensor cross-check':`Three-range fit · residual ${metric(sample.rms_error_m)?(sample.rms_error_m*100).toFixed(1):'—'} cm`:reasons[sample.reason]||sample.reason;
 if(current&&sample.valid&&metric(sample.uncertainty_m))$('quality').textContent+=` · model uncertainty ${(sample.uncertainty_m*100).toFixed(1)} cm`;
 $('warning').textContent=current&&sample.warning?'Move away from the screen.':'';draw();
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
 if(!config){config=await getJson('/api/config');if(!Array.isArray(config.sensors)||config.sensors.length!==3||!config.game_area){config=null;throw Error('Invalid geometry');}showTargets();}
 const p=await getJson('/api/position');if(!Array.isArray(p.sensor_status)||p.sensor_status.length!==3||typeof p.valid!=='boolean')throw Error('Invalid position data');
 if(lastBoot!==null&&p.boot_id!==lastBoot){lastBoot=null;config=null;sample=null;connected=false;return;}
 lastBoot=p.boot_id;sample=p;receivedAt=performance.now();connected=true;
}catch(e){connected=false;sample=null;}finally{render();setTimeout(update,150);}}
$('extent').addEventListener('change',draw);window.addEventListener('resize',draw);setInterval(render,200);draw();update();
</script></body></html>

)HTML";
