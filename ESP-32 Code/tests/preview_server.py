"""Local visual QA only: clearly labelled synthetic API; never used on the ESP.

python tests/preview_server.py; open http://127.0.0.1:8766/
Use ?mode=partial, ?mode=held, ?mode=invalid, ?mode=warning or ?mode=offline.
"""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs
import json
import math

root = Path(__file__).resolve().parents[1]
class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        url = urlparse(self.path)
        mode = parse_qs(url.query).get('mode', ['tracking'])[0]
        sensors = [dict(name=name, x_m=x, y_m=.3, bearing_deg=angle,
                        half_angle_deg=15, max_range_m=4.5)
                   for name, x, angle in [('Node 1', .39, math.degrees(math.atan2(.36, 1))),
                                         ('Access Point', .75, 0),
                                         ('Node 2', 1.23, -math.degrees(math.atan2(.48, 1)))]]
        if url.path == '/api/config':
            body = json.dumps(dict(width_m=1.5, depth_m=1.4, play_start_y_m=.6, stale_ms=500, sensors=sensors,
                game_area=dict(x_min_m=.45,x_max_m=1.05,start_y_m=1,end_y_m=2)))
            content_type = 'application/json'
        elif url.path == '/api/position':
            if mode == 'offline':
                self.send_error(503)
                return
            y = .5 if mode == 'warning' else 1.3
            ranges = [math.hypot(.75-s['x_m'], y-.3) for s in sensors]
            if mode == 'partial': ranges[1] = None
            valid = mode not in ('invalid', 'warning')
            body = json.dumps(dict(valid=valid,x_m=.75 if valid else None,y_m=y if valid else None,
                rms_error_m=.004 if valid else None,sensors_used=2 if mode=='partial' else 3,
                held=mode=='held',raw_x_m=None if mode=='held' else .76 if valid else None,
                raw_y_m=y if valid and mode!='held' else None,uncertainty_m=.05 if valid else None,
                warning=mode=='warning',reason='range_spike' if mode=='held' else 'two_ranges' if mode=='partial' else 'three_ranges' if valid else 'outside_cones_or_area',
                boot_id=1,frame_id=1,ranges_m=ranges,node_online=[True,True],
                sensor_status=[dict(online=True,echo=r is not None,range_m=None if mode=='held' and i==0 else r,
                    raw_m=r+.4 if mode=='held' and i==0 else r,rejected=mode=='held' and i==0,
                    age_ms=15,player_in_cone=valid and mode!='held' and r is not None) for i,r in enumerate(ranges)]))
            content_type = 'application/json'
        elif url.path == '/':
            body = (root/'Access_Point/cones.html').read_text(encoding='utf-8')
            body = body.replace("const API = location.hostname === '192.168.4.1' ? '' : 'http://192.168.4.1';", "const API = '';" )
            body = body.replace('fetch(API+path,', "fetch(API+path+location.search,")
            body = body.replace('Whack-a-Mole controller</h1>', 'Whack-a-Mole · SIMULATED TEST</h1>')
            content_type = 'text/html; charset=utf-8'
        else:
            self.send_error(404)
            return
        payload = body.encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(payload)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(payload)
    def log_message(self, *_): pass

if __name__ == '__main__':
    print('Simulated cone viewer: http://127.0.0.1:8766/', flush=True)
    ThreadingHTTPServer(('127.0.0.1', 8766), Handler).serve_forever()
