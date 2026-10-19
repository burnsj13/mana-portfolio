import json,os,sys,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import supabase_store as store
import supabase_sync as sync
from urllib.error import HTTPError

class CloudStoreTests(unittest.TestCase):
    def test_private_configuration_requires_server_secret(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            self.assertIsNone(store.configuration(root))
            (root/'supabase-config.json').write_text(json.dumps({'url':'https://test.supabase.co','publishableKey':'sb_publishable_test'}))
            with patch.dict(os.environ,{},clear=True):
                with self.assertRaisesRegex(RuntimeError,'repository secret'):store.configuration(root)
            with patch.dict(os.environ,{'SUPABASE_SERVICE_ROLE_KEY':'sb_secret_test'}):
                self.assertEqual(store.configuration(root),('https://test.supabase.co','sb_secret_test'))
    def test_paginated_holdings_and_settings_are_not_csv(self):
        config=('https://test.supabase.co','secret')
        def fake(config,path):
            if 'portfolio_collections' in path:return [{'initialized':True}]
            if 'portfolio_settings' in path:return [{'settings':{'watchlist':[{'n':'Saved wish'}]}}]
            return [{'payload':{'n':'Saved card','q':3}}]*(500 if 'offset=0' in path else 1)
        with patch.object(store,'configuration',return_value=config),patch.object(store,'request',side_effect=fake):
            data=store.load_profile('.', 'jacob')
            self.assertEqual(len(data['cards']),501)
            self.assertEqual(data['settings']['watchlist'][0]['n'],'Saved wish')
    def test_uninitialized_collection_fails_instead_of_overwriting(self):
        with patch.object(store,'configuration',return_value=('url','secret')),patch.object(store,'request',return_value=[{'initialized':False}]):
            with self.assertRaisesRegex(RuntimeError,'initial import'):store.load_profile('.','main')
    def test_restore_retains_every_month_and_alert_state(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            def remote(config,path,*args,**kwargs):
                if path.endswith('/history-index.json'):return {'version':1,'files':['history/2025-01.json','history/2026-10.json']}
                if path.endswith('/alert-state.json'):return {'active':['already-delivered']}
                return {'fromCloud':True}
            with patch.object(sync,'ROOT',root),patch.object(sync,'configuration',return_value=('url','secret')),patch.object(sync,'request',side_effect=remote),patch.object(sys,'argv',['supabase_sync.py','--restore']):sync.main()
            for directory in [root/'data',root/'data/jacob']:
                self.assertTrue((directory/'history/2025-01.json').exists())
                self.assertTrue((directory/'wishlist/history/2025-01.json').exists())
                self.assertEqual(json.loads((directory/'alert-state.json').read_text())['active'],['already-delivered'])
    def test_restore_outage_fails_without_uploading_seed_history(self):
        with patch.object(sync,'configuration',return_value=('url','secret')),patch.object(sync,'request',side_effect=HTTPError('url',503,'Unavailable',{},None)),patch.object(sys,'argv',['supabase_sync.py','--restore']):
            with self.assertRaises(HTTPError):sync.main()
if __name__=='__main__':unittest.main()
