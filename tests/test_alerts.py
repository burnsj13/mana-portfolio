import json,os,sys,tempfile,unittest
from pathlib import Path
from unittest.mock import patch,MagicMock
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import check_alerts as alerts
from update_prices import save,save_history

class AlertTests(unittest.TestCase):
    def setUp(self):
        self.rule=dict(enabled=True,percent=10,dollars=.5,period='day',direction='both',dailySummary=False)
        self.card=dict(id='a',n='Card',f='normal',q=2,proxy='false')
        self.history=[dict(date='2026-10-18',timestamp='2026-10-18T22:00:00+00:00',source='Scryfall USD',value=4,covered=2,quantity=2,items=[['a','normal',2,'',2]])]
        self.latest=dict(cards=[self.card],prices={'a':{'usd':'3'}},source='Scryfall USD',lastUpdated='2026-10-19T22:00:00+00:00')
    def test_thresholds_sources_zero_and_direction(self):
        events=alerts.evaluate(self.latest,self.history,self.rule,'collection')
        self.assertEqual(events[0]['percent'],50)
        self.assertEqual(events[0]['dollars'],1)
        self.assertFalse(alerts.evaluate(self.latest,self.history,{**self.rule,'direction':'down'},'collection'))
        self.history[0]['source']='MTGJSON / TCGplayer retail'
        self.assertFalse(alerts.evaluate(self.latest,self.history,self.rule,'collection'))
        self.history[0]['source']='Scryfall USD';self.history[0]['items'][0][4]=0
        self.assertFalse(alerts.evaluate(self.latest,self.history,self.rule,'collection'))
    def test_new_york_date_boundary(self):
        self.assertEqual(alerts.day(dict(date='2026-10-19',timestamp='2026-10-19T01:00:00Z')),'2026-10-18')
    def test_sends_once_and_rearms_without_network(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);save(root/'settings/main.json',dict(version=1,alerts=self.rule,watchlist=[]));save(root/'data/latest.json',self.latest)
            current=dict(date='2026-10-19',timestamp=self.latest['lastUpdated'],source='Scryfall USD',value=6,covered=2,quantity=2,items=[['a','normal',2,'',3]])
            save_history(root/'data',self.history+[current])
            with patch.object(alerts,'ROOT',root),patch.object(sys,'argv',['check_alerts.py']),patch.dict(os.environ,{'DISCORD_WEBHOOK_MAIN':'https://discord.com/api/webhooks/123/mock'}),patch.object(alerts,'graph_png',return_value=b'PNG'),patch.object(alerts,'post_discord') as post:
                alerts.main();alerts.main();self.assertEqual(post.call_count,1)
                self.latest['prices']['a']['usd']='2';save(root/'data/latest.json',self.latest);alerts.main()
                self.latest['prices']['a']['usd']='3';save(root/'data/latest.json',self.latest);alerts.main();self.assertEqual(post.call_count,2)
    def test_multipart_upload_and_no_mentions(self):
        response=MagicMock();response.__enter__.return_value.status=200
        with patch.object(alerts,'urlopen',return_value=response) as send:
            alerts.post_discord('https://discord.com/api/webhooks/123/mock','Test',b'PNGDATA')
            request=send.call_args.args[0]
            self.assertIn('wait=true',request.full_url)
            self.assertIn(b'files[0]',request.data);self.assertIn(b'PNGDATA',request.data)
            self.assertIn(b'"allowed_mentions": {"parse": []}',request.data)
if __name__=='__main__':unittest.main()
