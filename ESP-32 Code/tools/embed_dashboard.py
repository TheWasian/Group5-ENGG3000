"""Embed the single AP dashboard in flash. No separate cone firmware is built."""
from pathlib import Path
import argparse

parser = argparse.ArgumentParser()
parser.add_argument('--check', action='store_true')
args = parser.parse_args()
ap = Path(__file__).resolve().parents[1] / 'Access_Point'
html = (ap / 'cones.html').read_text(encoding='utf-8-sig')
assert ')HTML"' not in html
text = '#pragma once\n// Generated from cones.html by tools/embed_dashboard.py.\n'
text += 'const char DASHBOARD_HTML[] PROGMEM = R"HTML(\n' + html + '\n)HTML";\n'
target = ap / 'Dashboard.h'
if args.check:
    assert target.read_text(encoding='utf-8-sig') == text, 'Dashboard.h is stale; run embed_dashboard.py'
else:
    target.write_text(text, encoding='utf-8')
print('Unified AP dashboard ' + ('verified.' if args.check else 'embedded.'))
