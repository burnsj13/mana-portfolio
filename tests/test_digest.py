import json,os,sys,tempfile,unittest
from pathlib import Path
from datetime import datetime,timezone
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import send_digest as digest
from check_alerts import check_summary

class DigestTests(unittest.TestCase):
    def test_release_marker_written_only_after_delivery(self):
        state={}
        def request(config,path,*args,**kwargs):
            if args:state.update(json.loads(args[1]));return None
            return dict(state)
        with patch.dict(os.environ,DISCORD_WEBHOOK_MAIN='https://discord.com/api/webhooks/test'),patch.object(digest,'request',side_effect=request),patch.object(digest,'post_text') as send:
            self.assertTrue(digest.deliver('main','release',{}));self.assertFalse(digest.deliver('main','release',{}));self.assertEqual(send.call_count,1)
            self.assertIn('releaseVersion',state)
            state.clear();send.side_effect=RuntimeError('Delivery failed')
            with self.assertRaises(RuntimeError):digest.deliver('main','release',{})
            self.assertNotIn('releaseVersion',state)

    def test_weekly_before_monday_seven_and_already_sent(self):
        with patch.dict(os.environ,DISCORD_WEBHOOK_MAIN='test'),patch.object(digest,'state_for',return_value={}),patch.object(digest,'post_discord') as send:
            self.assertFalse(digest.deliver('main','weekly',{},datetime(2026,10,19,10,59,tzinfo=timezone.utc)));send.assert_not_called()
        with patch.dict(os.environ,DISCORD_WEBHOOK_MAIN='test'),patch.object(digest,'state_for',return_value={'weeklyKey':'2026-10-19'}):
            self.assertFalse(digest.deliver('main','weekly',{},datetime(2026,10,20,15,tzinfo=timezone.utc)))

    def test_weekly_uses_seven_day_baseline(self):
        latest={'cards':[dict(id='a',n='Card',f='normal',q=2,proxy='false')],'prices':{'a':{'usd':4}},'lastUpdated':'2026-10-20T11:00:00Z','source':'Scryfall USD'}
        history=[dict(date=d,timestamp=d+'T11:00:00Z',source='Scryfall USD',items=[['a','normal',2,'',p]]) for d,p in [('2026-10-13',2),('2026-10-19',3)]]
        self.assertIn('+4.00 USD',check_summary(latest,history,hours=168));self.assertIn('+2.00 USD',check_summary(latest,history))

    def test_weekly_delivery_saves_marker_and_link(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);(root/'data').mkdir();(root/'data/latest.json').write_text('{}');(root/'data/discord-graph.png').write_bytes(b'PNG')
            with patch.dict(os.environ,DISCORD_WEBHOOK_MAIN='test'),patch.object(digest,'ROOT',root),patch.object(digest,'state_for',return_value={}),patch.object(digest,'load_history',return_value=[{'value':12}]),patch.object(digest,'check_summary',return_value='Last 7d change: +2 USD\n') as summary,patch.object(digest,'post_discord') as send,patch.object(digest,'request') as save:
                self.assertTrue(digest.deliver('main','weekly',{},datetime(2026,10,19,11,tzinfo=timezone.utc)))
                self.assertEqual(summary.call_args.kwargs['hours'],168);self.assertIn('https://burnsj13.github.io/mana-portfolio/',send.call_args.args[1]);self.assertIn('2026-10-19',save.call_args.args[3].decode())
