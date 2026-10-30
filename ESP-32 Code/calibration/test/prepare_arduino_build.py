"""Optional Arduino CLI verification setup; all generated files stay in calibration/.verify.

Uses the existing installed ESP32 core. Downloads the three display-library
dependencies from Adafruit's official repositories into this project's sandbox.
Normal builds/uploads use PlatformIO and platformio.ini.
"""
from io import BytesIO
from pathlib import Path
import json
from urllib.request import urlopen
from zipfile import ZipFile

root=Path(__file__).resolve().parents[1]
work=root/'.verify'
libraries=work/'libraries'
libraries.mkdir(parents=True,exist_ok=True)
for repo in ('Adafruit-GFX-Library','Adafruit-ST7735-Library','Adafruit_BusIO'):
    folder=libraries/(repo+'-master')
    if not folder.exists():
        print('Downloading official Adafruit library:',repo,flush=True)
        with urlopen(f'https://codeload.github.com/adafruit/{repo}/zip/refs/heads/master',timeout=60) as response:
            archive=ZipFile(BytesIO(response.read()))
        for member in archive.infolist():
            destination=(libraries/member.filename).resolve()
            if libraries.resolve() not in destination.parents:raise ValueError('Unexpected archive path')
        archive.extractall(libraries)
sketch=work/'CalibrationLogger'
sketch.mkdir(exist_ok=True)
(sketch/'CalibrationLogger.ino').write_text('#include "'+(root/'src/main.cpp').as_posix()+'"\n',encoding='utf-8')
config={'directories':{'data':str(Path.home()/'AppData/Local/Arduino15'),
                       'downloads':str(work/'downloads'),'user':str(work/'arduino-user')},
        'build_cache':{'path':str(work/'cache')}}
(work/'arduino-cli.yaml').write_text(json.dumps(config),encoding='utf-8')
print('Arduino CLI verification setup ready:',sketch)
