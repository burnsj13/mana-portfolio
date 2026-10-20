import sys,unittest,copy
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from watchlist import seed_baselines,evaluate_watchlist

class WatchBaselineTests(unittest.TestCase):
    def setUp(self):
        self.start='2026-10-20T10:00:00Z'
        self.card=dict(id='a',n='Wishlist card',f='normal',addedAt=self.start,baseline=dict(price=1,source='Scryfall USD',timestamp=self.start))
        self.rule=dict(enabled=True,percent=10,dollars=100,period='day',direction='both',watchPercent=5,watchDirection='both')
    def latest(self,price,card=None,source='Scryfall USD'):
        return dict(cards=[card or self.card],prices={'a':{'usd':price,'usd_foil':999}},source=source,lastUpdated='2026-10-24T10:00:00Z')
    def test_cumulative_move_uses_fixed_baseline_without_dollar_floor(self):
        events=evaluate_watchlist(self.latest(1.10),self.rule)
        self.assertEqual(len(events),1);self.assertEqual(events[0]['percent'],10);self.assertEqual(events[0]['baselinePrice'],1)
        self.assertEqual(events[0]['baseline'],self.start)
        self.assertEqual(evaluate_watchlist(self.latest(1.03),self.rule),[])
    def test_direction_missing_zero_finish_and_source(self):
        self.assertEqual(len(evaluate_watchlist(self.latest(.90),self.rule)),1)
        self.assertEqual(evaluate_watchlist(self.latest(.90),{**self.rule,'watchDirection':'up'}),[])
        self.assertEqual(evaluate_watchlist(self.latest(None),self.rule),[])
        self.assertEqual(evaluate_watchlist(self.latest(2,source='MTGJSON retail'),self.rule),[])
        c=copy.deepcopy(self.card);c['baseline']['price']=0
        self.assertEqual(evaluate_watchlist(self.latest(2,c),self.rule),[])
        c=copy.deepcopy(self.card);c['f']='etched'
        self.assertEqual(evaluate_watchlist(self.latest(2,c),self.rule),[])
    def test_captured_price_is_never_overwritten_by_later_quotes(self):
        cards=[copy.deepcopy(self.card)]
        seed_baselines(cards,[],{'a':{'usd':50}},'MTGJSON retail','2026-10-24T10:00:00Z')
        self.assertEqual(cards[0]['baseline'],self.card['baseline'])
    def test_legacy_earliest_and_readd_reset(self):
        history=[dict(date='2026-10-19',source='Scryfall USD',items=[['a','normal',1,'Wishlist',1]]),dict(date='2026-10-21',source='Scryfall USD',items=[['a','normal',1,'Wishlist',2]])]
        old=dict(id='a',n='Old',f='normal');new=dict(old,addedAt='2026-10-20T10:00:00Z')
        seed_baselines([old,new],history,{'a':{'usd':3}},'Scryfall USD','2026-10-24T10:00:00Z')
        self.assertEqual(old['baseline']['price'],1);self.assertEqual(new['baseline']['price'],2)
    def test_pending_quote_uses_first_valid_observation(self):
        c=dict(id='a',n='Pending',f='normal',addedAt=self.start)
        history=[dict(date='2026-10-21',source='Scryfall USD',items=[['a','normal',1,'Wishlist',None]])]
        seed_baselines([c],history,{'a':{'usd':None}},'Scryfall USD','2026-10-22T10:00:00Z');self.assertNotIn('baseline',c)
        seed_baselines([c],history,{'a':{'usd':2}},'Scryfall USD','2026-10-23T10:00:00Z');self.assertEqual(c['baseline']['price'],2)
