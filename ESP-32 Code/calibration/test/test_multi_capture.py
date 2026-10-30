import csv
import math
from pathlib import Path
import sys
import tempfile
import unittest
import io
import types
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import multi_capture as m


def wire(frame=1,boot=42,left='100.123',master='110.000',right='nan',
         status=('ok','ok','no_ready'),quiet=100,pause=0):
    return f'DATA,2,{boot},{frame},1000,1300,{quiet},{pause},{left},{master},{right},{",".join(status)},1200,1010,0,6414,POS,0,-1,-1,-1,0,disabled'


class FakeSerial:
    def __init__(self,lines):self.lines=list(lines);self.written=[]
    def write(self,b):self.written.append(b)
    def readline(self):return ((self.lines.pop(0)+'\n') if self.lines else '').encode()


class EmulatedMaster(FakeSerial):
    def __init__(self,*args,**kwargs):
        super().__init__([]);self.quiet=100;self.counter=0
    def __enter__(self):return self
    def __exit__(self,*args):return False
    def write(self,b):
        super().write(b);words=b.decode().strip().split()
        if words[0]=='HELLO':self.lines.append('LOGGER_READY,2,Wacker5,42,1')
        elif words[0]=='STOP':self.lines.append('MODE:IDLE')
        elif words[0]=='CONFIG_TIMING':
            self.quiet=int(words[1]);self.lines.append(f'TIMING,{self.quiet}')
        elif words[0]=='POSITION':self.lines.append('POSITION,'+words[1])
        elif words[0]=='MULTI_TEST':
            for i in range(int(words[1])):
                self.counter+=1
                self.lines.append(wire(self.counter,left=str(100+i),quiet=self.quiet,pause=int(words[2])))
            self.lines.append(f'MULTI_DONE,42,{self.counter}')


class CaptureTests(unittest.TestCase):
    def test_early_completion_reports_missing_records(self):
        session=m.Session(FakeSerial([wire(), 'MULTI_DONE,42,2']));session.boot=42
        with self.assertRaisesRegex(RuntimeError, 'only 1/2 records'):
            list(session.frames(2))

    def test_unterminated_serial_garbage_is_bounded(self):
        class Garbage:
            def readline(self):return b'x'*4097
        with self.assertRaisesRegex(RuntimeError, 'without a newline'):
            m.Session(Garbage()).read_line()

    def test_serial_timeout_does_not_split_a_measurement_or_done_marker(self):
        class ChunkSerial(FakeSerial):
            def readline(self):
                return self.lines.pop(0) if self.lines else b''
        frame = (wire() + '\r\n').encode()
        con = ChunkSerial([frame[:30], b'', frame[30:], b'MULTI_DO', b'', b'NE,42,1\r\n'])
        session = m.Session(con);session.boot = 42
        self.assertEqual([r['frame_id'] for r in session.frames(1)], [1])

    def test_serial_reader_returns_only_complete_lines(self):
        class ChunkSerial(FakeSerial):
            def readline(self):
                return self.lines.pop(0) if self.lines else b''
        session = m.Session(ChunkSerial([b'TIM', b'', b'ING,100\r\nPOSITION,OFF\n']))
        self.assertEqual(session.read_line(), '')
        self.assertEqual(session.read_line(), '')
        self.assertEqual(session.read_line(), 'TIMING,100')
        self.assertEqual(session.read_line(), 'POSITION,OFF')

    def test_parser_preserves_three_channels_and_failures(self):
        row=m.parse_frame(wire())
        self.assertEqual(row['left_cm'],100.123)
        self.assertEqual(row['master_cm'],110)
        self.assertIsNone(row['right_cm'])
        self.assertIsNone(row['right_received_ms'])
        self.assertEqual(row['master_echo_us'],6414)
        self.assertFalse(row['position_valid'])
        self.assertIsNone(row['x_m'])
        self.assertEqual(row['position_reason'],'disabled')
        self.assertIsNone(m.parse_frame('MODE:IDLE'))

    def test_malformed_records_fail(self):
        for line in [wire().replace('DATA,2','DATA,1'),wire()+',extra',wire(left='nan'),wire(left='inf'),
                     wire(status=('wat','ok','no_ready')),wire(boot=-1)]:
            with self.assertRaises(ValueError):m.parse_frame(line)

    def test_burst_completes_on_last_data_and_done_without_extra_data(self):
        con=FakeSerial(['MULTI_TEST_READY',wire(),wire(),wire(2),'MULTI_DONE,42,2'])
        session=m.Session(con);session.boot=42
        rows=list(session.frames(2))
        self.assertEqual([r['frame_id'] for r in rows],[1,2])
        self.assertEqual(con.written,[b'MULTI_TEST 2 0\n'])

    def test_no_valid_position_still_logs_and_statuses_stay_separate(self):
        statuses=('no_reply','no_echo','invalid_echo')
        row=m.parse_frame(wire(left='nan',master='nan',status=statuses))
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as tmp:
            p=Path(tmp)/'log.csv';log=m.CsvLog(p);log.write(row);log.close()
            with p.open(newline='',encoding='utf-8') as stream:
                saved=list(csv.DictReader(stream))[0]
            self.assertEqual(saved['left_cm'],'');self.assertEqual(saved['left_status'],'no_reply')
            self.assertEqual(saved['master_status'],'no_echo');self.assertEqual(saved['right_status'],'invalid_echo')
            with self.assertRaises(FileExistsError):m.CsvLog(p)

    def test_statistics_ignore_failed_readings_not_zero_fill(self):
        rows=[m.parse_frame(wire(left='100')),m.parse_frame(wire(2,left='102')),
              m.parse_frame(wire(3,left='nan',status=('no_reply','ok','no_ready')))]
        stats=m.summarise(rows,'left')
        self.assertEqual(stats['valid'],2);self.assertEqual(stats['failed'],1)
        self.assertEqual(stats['mean_cm'],101);self.assertAlmostEqual(stats['stdev_cm'],math.sqrt(2))
        self.assertIsNone(m.summarise(rows,'right')['mean_cm'])

    def test_restart_aborts(self):
        s=m.Session(FakeSerial([wire(boot=43)]));s.boot=42
        with self.assertRaisesRegex(RuntimeError,'session changed'):list(s.frames(1))

    def test_wrap_and_old_frames(self):
        s=m.Session(FakeSerial([wire(0xffffffff),wire(0xfffffffe),wire(0),'MULTI_DONE,42,0']));s.boot=42
        self.assertEqual([r['frame_id'] for r in s.frames(2)],[0xffffffff,0])

    def test_missing_data_and_protocol_errors(self):
        s=m.Session(FakeSerial(['ERROR:BUSY']));s.boot=42
        with self.assertRaises(RuntimeError):list(s.frames(1))
        s=m.Session(FakeSerial([]));s.boot=42
        with patch.object(m.time,'monotonic',side_effect=[0,20]):
            with self.assertRaises(TimeoutError):list(s.frames(1))

    def test_timing_configuration(self):
        con=FakeSerial(['TIMING,100','POSITION,OFF'])
        s=m.Session(con);s.configure(100,250)
        self.assertEqual(con.written,[b'CONFIG_TIMING 100\n',b'POSITION OFF\n'])
        with self.assertRaises(ValueError):s.configure(20,0)
        s=m.Session(FakeSerial([wire(quiet=60)]));s.boot=42
        with self.assertRaisesRegex(RuntimeError,'timing differs'):list(s.frames(1))

    def test_stop_stream_and_ready(self):
        con=FakeSerial(['MODE:IDLE','LOGGER_READY,2,Wacker5,42,1','MODE:IDLE'])
        s=m.Session(con);s.ready();self.assertEqual(s.boot,42)
        stop=m.Event();stop.set();self.assertEqual(list(s.frames(0,stop)),[])
        self.assertEqual(con.written[-1],b'MULTI_STREAM 0\n')

    def test_complete_sweep_writes_all_channels_and_timing(self):
        fake=EmulatedMaster()
        serial_module=types.SimpleNamespace(Serial=lambda *a,**k:fake,SerialException=OSError)
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as tmp:
            output=Path(tmp)/'sweep.csv'
            with patch.dict(sys.modules,serial=serial_module),patch('sys.stdout',io.StringIO()):
                rows=m.run('FAKE',115200,'sweep',count=3,delays=[60,100],csv_path=output,no_plot=True)
            self.assertEqual(len(rows),6)
            self.assertEqual([r['quiet_ms'] for r in rows],[60]*3+[100]*3)
            with output.open(newline='',encoding='utf-8') as stream:saved=list(csv.DictReader(stream))
            self.assertEqual(len(saved),6)
            self.assertEqual(saved[-1]['right_status'],'no_ready')
            self.assertEqual(fake.written[-1],b'STOP\n')

    def test_reference_distances_are_independent_and_nan_reprompted(self):
        serial_module=types.SimpleNamespace(Serial=EmulatedMaster,SerialException=OSError)
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as tmp:
            with patch.dict(sys.modules,serial=serial_module),patch('sys.stdout',io.StringIO()), \
                 patch('builtins.input',side_effect=['Spot A','nan','110','100','','']):
                rows=m.run('FAKE',115200,'calibrate',count=2,csv_path=Path(tmp)/'ref.csv',no_plot=True)
            self.assertEqual(rows[0]['actual_left_cm'],110)
            self.assertEqual(rows[0]['actual_master_cm'],100)
            self.assertIsNone(rows[0]['actual_right_cm'])

    def test_continuous_capture_exceeds_one_hundred_cycles(self):
        con=FakeSerial([wire(i) for i in range(1,103)])
        session=m.Session(con);session.boot=42;stop=m.Event();rows=[]
        for row in session.frames(0,stop):
            rows.append(row)
            if len(rows)==101:stop.set()
        self.assertEqual(len(rows),101)
        self.assertEqual(con.written,[b'MULTI_STREAM 0\n'])

    def test_partial_csv_survives_failure(self):
        class BrokenMaster(EmulatedMaster):
            def write(self,b):
                super().write(b)
                if b.startswith(b'MULTI_TEST'):
                    self.lines=self.lines[:1]+['ERROR:test transport failure']
        serial_module=types.SimpleNamespace(Serial=BrokenMaster,SerialException=OSError)
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as tmp:
            path=Path(tmp)/'partial.csv'
            with patch.dict(sys.modules,serial=serial_module),patch('sys.stdout',io.StringIO()):
                with self.assertRaises(RuntimeError):m.run('FAKE',115200,'burst',count=3,csv_path=path,no_plot=True)
            with path.open(newline='',encoding='utf-8') as stream:
                self.assertEqual(len(list(csv.DictReader(stream))),1)


if __name__=='__main__':unittest.main()
