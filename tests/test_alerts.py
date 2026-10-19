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
    def test_discord_collection_links(self):
        self.assertEqual(alerts.collection_link('main'),'https://burnsj13.github.io/mana-portfolio/')
        self.assertEqual(alerts.collection_link('jacob'),'https://burnsj13.github.io/mana-portfolio/jacob.html')
    def test_24h_change_ignores_recent_checks_and_uses_current_quantities(self):
        previous=dict(date='2026-10-18',timestamp='2026-10-18T22:00:00Z',source='Scryfall USD',items=[['a','normal',99,'',2.5],['b','foil',1,'',5]])
        latest={**self.latest,'cards':[self.card,dict(self.card,id='b',n='Loser',f='foil',q=1),dict(self.card,id='new',n='New',q=10)],'prices':{'a':{'usd':3},'b':{'usd_foil':4.5},'new':{'usd':100}}}
        current=dict(previous,timestamp=latest['lastUpdated'])
        recent=dict(previous,date='2026-10-19',timestamp='2026-10-19T10:00:00Z',items=[['a','normal',99,'',100]])
        text=alerts.check_summary(latest,self.history+[previous,recent,current])
        self.assertIn('+0.50 USD (+5.00%)',text)
        self.assertIn('Biggest gainer: Card (normal) — +1.00 USD holdings',text)
        self.assertIn('Biggest loser: Loser (foil) — -0.50 USD holdings',text)
        self.assertIn('Oct 18, 06:00 PM EDT',text)
        self.assertIn('Last 24h change',text)
        self.assertIn('no saved snapshot',alerts.check_summary(latest,[recent,current]))
    def test_24h_change_handles_missing_zero_and_source_switch(self):
        self.assertIn('no saved snapshot',alerts.check_summary(self.latest,[]))
        self.history[0]['source']='MTGJSON retail'
        self.assertIn('sources differ',alerts.check_summary(self.latest,self.history))
        self.history[0]['source']='Scryfall USD';self.history[0]['items'][0][4]=0
        self.assertIn('percentage unavailable',alerts.check_summary(self.latest,self.history))
        self.latest['prices']['a']['usd']='0'
        text=alerts.check_summary(self.latest,self.history)
        self.assertIn('Biggest gainer: none.',text);self.assertIn('Biggest loser: none.',text)
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
    def test_initial_connection_sends_summary_without_threshold_event(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);self.latest['prices']['a']['usd']='2'
            save(root/'settings/main.json',dict(version=1,alerts=self.rule,watchlist=[]));save(root/'data/latest.json',self.latest)
            save_history(root/'data',self.history)
            with patch.object(alerts,'ROOT',root),patch.object(sys,'argv',['check_alerts.py']),patch.dict(os.environ,{'DISCORD_WEBHOOK_MAIN':'https://discord.com/api/webhooks/123/mock'}),patch.object(alerts,'graph_png',return_value=b'PNG'),patch.object(alerts,'post_discord') as post:
                alerts.main();alerts.main();self.assertEqual(post.call_count,1)
                self.assertIn('Discord connected',post.call_args.args[1])
                self.assertIn('Open collection: '+alerts.collection_link('main'),post.call_args.args[1])
    def test_scheduled_summary_ignores_thresholds_and_caches_graph(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);save(root/'settings/main.json',dict(version=1,alerts={**self.rule,'enabled':False},watchlist=[]));save(root/'data/latest.json',self.latest);save_history(root/'data',self.history)
            with patch.object(alerts,'ROOT',root),patch.object(sys,'argv',['check_alerts.py','--send-summary']),patch.dict(os.environ,{'DISCORD_WEBHOOK_MAIN':'https://discord.com/api/webhooks/123/mock'}),patch.object(alerts,'graph_png',return_value=b'PNG'),patch.object(alerts,'post_discord') as post:
                alerts.main();self.assertEqual(post.call_count,1);self.assertIn('+2.00 USD',post.call_args.args[1]);self.assertIn('Biggest gainer',post.call_args.args[1])
            cached=json.loads((root/'data/discord-summary.json').read_text());self.assertIn('+2.00 USD',cached['content']);self.assertEqual((root/'data/discord-graph.png').read_bytes(),b'PNG')
if __name__=='__main__':unittest.main()
