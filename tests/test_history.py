import unittest, tempfile, sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from update_prices import save_history,load_history

class HistoryArchiveTests(unittest.TestCase):
    def test_lossless_multiple_months_and_holdings_changes(self):
        entries=[
            dict(date='2026-09-30',value=0,items=[['a','foil',2,'binder',None]]),
            dict(date='2026-10-01',timestamp='2026-10-01T10:00:00Z',value=2.4,items=[['a','foil',2,'binder','1.20']]),
            dict(date='2026-10-01',timestamp='2026-10-01T22:00:00Z',value=2.6,items=[['a','foil',2,'binder','1.30']]),
            dict(date='2026-10-02',value=4,items=[['a','foil',1,'moved',2],['a','foil',1,'moved',2]]),
            dict(date='2026-10-03',value=7,source='legacy aggregate'),
        ]
        with tempfile.TemporaryDirectory() as name:
            directory=Path(name); save_history(directory,entries)
            self.assertEqual(load_history(directory),entries)
            self.assertEqual(len(list((directory/'history').glob('*.json'))),2)
            new=dict(date='2026-11-01',value=6,items=[['b','normal',2,'new',3]])
            save_history(directory,load_history(directory)+[new])
            self.assertEqual(load_history(directory),entries+[new])

    def test_collection_directories_stay_separate(self):
        with tempfile.TemporaryDirectory() as name:
            original=Path(name)/'original'; jacob=Path(name)/'jacob'
            a=[dict(date='2026-10-06',value=10,items=[['a','normal',1,'a',10]])]
            b=[dict(date='2026-07-21',value=20,items=[['b','foil',2,'b',10]])]
            save_history(original,a);save_history(jacob,b)
            self.assertEqual(load_history(original),a)
            self.assertEqual(load_history(jacob),b)

if __name__=='__main__': unittest.main()
